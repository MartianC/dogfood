#!/usr/bin/env python3
"""从高频菜谱原料和来源中文名自动发现标准食材概念候选。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

from recipe_ingredient_normalization import clean_term


DISCOVERY_POLICY_ID = "recipeIngredientConceptDiscovery/v2"
CATEGORY_BY_USDA_ID = {
    1: "dairy",
    2: "dairy",
    4: "oil",
    5: "meat",
    7: "meat",
    9: "fruit",
    10: "meat",
    11: "vegetable",
    12: "legume",
    13: "meat",
    15: "seafood",
    16: "legume",
    17: "meat",
    19: "carb",
    20: "carb",
}
CUT_SUFFIXES = ("切片", "切丝", "切丁", "切块", "片", "丝", "丁", "块", "末", "碎", "段")
QUALITY_PREFIXES = ("新鲜", "鲜", "冷冻", "速冻")
PREPARATION_LABELS = {
    "raw": "生",
    "fresh": "鲜",
    "dry": "干制",
    "oil": "油",
    "frozen": "冷冻",
    "canned": "罐装",
    "cooked": "熟制",
    "prepared": "加工",
    "unspecified": "来源状态未注明",
}
IDENTITY_STOPWORDS = {
    "all", "and", "as", "classes", "food", "only", "or", "product", "products",
    "raw", "fresh", "dry", "dried", "frozen", "canned", "cooked", "prepared",
    "whole", "peeled", "seeded", "skinless", "boneless", "with", "without",
    "red", "green", "white", "regular", "commercial", "added", "unsweetened",
}
IDENTITY_TOKEN_ALIASES = {
    "kiwi": "kiwifruit",
    "mushroom": "mushrooms",
    "tomato": "tomatoes",
}


def normalize_name(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def canonical_name(value: str) -> str:
    """标准概念名不携带来源中文名中的受控生鲜状态。"""
    return re.sub(r"[（(](生|鲜|冷冻|速冻)[）)]$", "", value).strip()


def cleaned_names(value: str) -> list[tuple[str, str, float]]:
    """返回原词及只去除明确采购/刀工修饰后的候选名称。"""
    normalized = normalize_name(value)
    results = [(normalized, "exact", 1.0)] if normalized else []
    current = normalized
    for prefix in QUALITY_PREFIXES:
        if current.startswith(prefix) and len(current) > len(prefix) + 1:
            current = current[len(prefix) :]
            break
    for suffix in CUT_SUFFIXES:
        if (
            current.endswith(suffix)
            and len(current) > len(suffix) + 1
            and not (suffix == "丝" and current.endswith("粉丝"))
        ):
            current = current[: -len(suffix)]
            break
    if current and current != normalized:
        results.append((current, "modifier_removed", 0.95))
    return results


def preparation_state(description: str) -> str:
    text = description.lower()
    if re.search(r"\braw\b", text):
        return "raw"
    if text.startswith("oil,") or text.startswith("oil "):
        return "oil"
    if re.search(r"\b(dry|dried)\b", text):
        return "dry"
    if "frozen" in text:
        return "frozen"
    if "canned" in text:
        return "canned"
    if re.search(r"\b(cooked|boiled|roasted|baked|fried|simmered)\b", text):
        return "cooked"
    if re.search(r"\b(prepared|ready-to-eat|sweetened|salted|smoked)\b", text):
        return "prepared"
    if "fresh" in text:
        return "fresh"
    return "unspecified"


def identity_tokens(description: str) -> set[str]:
    tokens = set(re.findall(r"[a-z]+", description.lower())) - IDENTITY_STOPWORDS
    return {IDENTITY_TOKEN_ALIASES.get(token, token) for token in tokens}


def concept_id(source_keys: tuple[tuple[str, int], ...]) -> str:
    raw = "|".join(f"{version}:{fdc_id}" for version, fdc_id in source_keys)
    return f"ingredient_auto_{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def variant_id(concept: str, source_version: str, fdc_id: int) -> str:
    digest = hashlib.sha256(f"{source_version}:{fdc_id}".encode()).hexdigest()[:12]
    return f"variant_{concept.removeprefix('ingredient_')}_{digest}"


def load_source_names(conn: sqlite3.Connection) -> dict[str, list[dict[str, Any]]]:
    rows = conn.execute(
        """
        SELECT l.name, r.source_version, l.fdc_id, f.description,
               f.food_category_id, COUNT(n.source_record_id) AS nutrient_count
        FROM source_localized_name l
        JOIN source_release r ON r.release_id = l.source_release_id
        JOIN source_food f
          ON f.source_release_id = l.source_release_id AND f.fdc_id = l.fdc_id
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id = f.source_release_id AND n.fdc_id = f.fdc_id
        WHERE l.locale = 'zh-CN'
        GROUP BY l.name, r.source_version, l.fdc_id, f.description, f.food_category_id
        HAVING COUNT(n.source_record_id) > 0
        ORDER BY l.name, r.source_version, l.fdc_id
        """
    ).fetchall()
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for name, version, fdc_id, description, category_id, nutrient_count in rows:
        result[normalize_name(str(name))].append(
            {
                "localized_name": str(name),
                "source_version": str(version),
                "fdc_id": int(fdc_id),
                "description": str(description),
                "food_category_id": int(category_id) if category_id is not None else None,
                "nutrient_count": int(nutrient_count),
            }
        )
    return result


def validate_identity(candidates: list[dict[str, Any]]) -> tuple[bool, str, str | None]:
    category_ids = {row["food_category_id"] for row in candidates}
    categories = {CATEGORY_BY_USDA_ID.get(value) for value in category_ids}
    if None in categories or len(categories) != 1:
        return False, "category_conflict_or_unsupported", None
    shared_tokens: set[str] | None = None
    for row in candidates:
        tokens = identity_tokens(row["description"])
        shared_tokens = tokens if shared_tokens is None else shared_tokens & tokens
    if not shared_tokens:
        return False, "source_identity_conflict", None
    return True, "accepted", categories.pop()


def discover(
    conn: sqlite3.Connection,
    base_seed: dict[str, Any],
    candidate_version: str,
    min_occurrences: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    output = deepcopy(base_seed)
    output["catalog_version"] = candidate_version
    output["catalog_schema_version"] = 2
    output["discovery_policy"] = {
        "policy_id": DISCOVERY_POLICY_ID,
        "minimum_occurrences": min_occurrences,
        "publication_rule": "仅高置信身份进入候选种子；冲突和未匹配项不自动发布",
    }
    items = output.setdefault("items", [])
    source_names = load_source_names(conn)
    source_name_keys = set(source_names)

    alias_owner: dict[str, dict[str, Any]] = {}
    source_owner: dict[tuple[str, int], dict[str, Any]] = {}
    for item in items:
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]:
            alias_owner[normalize_name(str(alias))] = item
        for candidate in item.get("nutrition_candidates", item.get("variants", [])):
            source_owner[(str(candidate["source_version"]), int(candidate["fdc_id"]))] = item
    known_names = set(alias_owner) | source_name_keys

    terms = conn.execute(
        """
        SELECT normalized_name, example_raw_name, occurrence_count
        FROM recipe_ingredient_term
        WHERE occurrence_count >= ?
        ORDER BY occurrence_count DESC, normalized_name
        """,
        (min_occurrences,),
    ).fetchall()
    accepted_groups: dict[tuple[tuple[str, int], ...], list[dict[str, Any]]] = defaultdict(list)
    unmatched: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    matched_existing: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    auxiliaries: list[dict[str, Any]] = []

    for normalized, example, count in terms:
        alias_to_concept = {
            name: str(owner["concept_id"]) for name, owner in alias_owner.items()
        }
        normalized_result = clean_term(
            str(normalized), alias_to_concept, source_name_keys, known_names
        )
        if normalized_result.status == "excluded":
            excluded.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "category": normalized_result.exclusion_category,
                    "rule_id": normalized_result.rule_id,
                }
            )
            continue
        if normalized_result.status == "auxiliary":
            auxiliaries.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "rule_id": normalized_result.rule_id,
                }
            )
            continue
        if normalized_result.status == "matched":
            owner = next(
                item
                for item in items
                if item["concept_id"] == normalized_result.concept_id
            )
            normalized_key = normalize_name(str(normalized))
            if normalized_key not in alias_owner:
                owner.setdefault("aliases", []).append(str(normalized))
                alias_owner[normalized_key] = owner
                known_names.add(normalized_key)
            matched_existing.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "concept_id": owner["concept_id"],
                    "method": normalized_result.rule_id,
                }
            )
            continue
        if normalized_result.status in {"ambiguous", "alternative", "composite"}:
            ambiguous.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "reason": normalized_result.rule_id,
                }
            )
            continue
        cleaned = normalized_result.cleaned_name
        if cleaned not in source_names:
            unmatched.append(
                {
                    "normalized_name": normalized,
                    "cleaned_name": cleaned,
                    "example_raw_name": example,
                    "occurrence_count": int(count),
                }
            )
            continue
        method = normalized_result.rule_id
        confidence = 1.0 if cleaned == normalize_name(str(normalized)) else 0.95
        candidates = source_names[cleaned]
        valid, reason, category = validate_identity(candidates)
        if not valid:
            ambiguous.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "reason": reason,
                    "candidate_descriptions": [row["description"] for row in candidates],
                }
            )
            continue
        keys = tuple(sorted((row["source_version"], row["fdc_id"]) for row in candidates))
        existing = {source_owner[key]["concept_id"] for key in keys if key in source_owner}
        if len(existing) == 1:
            owner = next(item for item in items if item["concept_id"] in existing)
            if normalize_name(str(normalized)) not in alias_owner:
                owner.setdefault("aliases", []).append(str(normalized))
                alias_owner[normalize_name(str(normalized))] = owner
            matched_existing.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "concept_id": owner["concept_id"],
                    "method": "existing_source",
                }
            )
            continue
        if len(existing) > 1:
            ambiguous.append(
                {
                    "normalized_name": normalized,
                    "occurrence_count": int(count),
                    "reason": "sources_owned_by_multiple_concepts",
                    "concept_ids": sorted(existing),
                }
            )
            continue
        accepted_groups[keys].append(
            {
                "name": str(normalized),
                "occurrence_count": int(count),
                "method": method,
                "confidence": confidence,
                "category_code": category,
                "candidates": candidates,
                "localized_name": cleaned,
            }
        )

    discovered: list[dict[str, Any]] = []
    for keys, group in sorted(accepted_groups.items()):
        ordered_names = sorted(group, key=lambda row: (-row["occurrence_count"], row["name"]))
        source_name = ordered_names[0]["name"]
        canonical = canonical_name(source_name)
        aliases = sorted({row["name"] for row in group if row["name"] != canonical})
        concept = concept_id(keys)
        candidates = ordered_names[0]["candidates"]
        nutrition_candidates = []
        for row in candidates:
            state = preparation_state(row["description"])
            nutrition_candidates.append(
                {
                    "variant_id": variant_id(concept, row["source_version"], row["fdc_id"]),
                    "display_name_zh": f"{canonical}（{PREPARATION_LABELS[state]}）",
                    "preparation_state": state,
                    "source_version": row["source_version"],
                    "fdc_id": row["fdc_id"],
                    "description_contains": row["description"],
                    "is_default": False,
                }
            )
        item = {
            "concept_id": concept,
            "canonical_name_zh": canonical,
            "category_code": ordered_names[0]["category_code"],
            "subcategory_code": None,
            "aliases": aliases,
            "nutrition_candidates": nutrition_candidates,
        }
        items.append(item)
        discovered.append(
            {
                "concept_id": concept,
                "canonical_name_zh": canonical,
                "aliases": aliases,
                "recipe_occurrence_count": sum(row["occurrence_count"] for row in group),
                "source_candidate_count": len(nutrition_candidates),
                "match_methods": sorted({row["method"] for row in group}),
            }
        )

    report = {
        "report_contract": "recipeIngredientConceptDiscovery/v1",
        "candidate_version": candidate_version,
        "discovery_policy_id": DISCOVERY_POLICY_ID,
        "minimum_occurrences": min_occurrences,
        "recipe_term_count": len(terms),
        "existing_match_count": len(matched_existing),
        "discovered_concept_count": len(discovered),
        "ambiguous_term_count": len(ambiguous),
        "unmatched_term_count": len(unmatched),
        "excluded_term_count": len(excluded),
        "excluded_occurrence_count": sum(item["occurrence_count"] for item in excluded),
        "auxiliary_term_count": len(auxiliaries),
        "auxiliary_occurrence_count": sum(
            item["occurrence_count"] for item in auxiliaries
        ),
        "discovered_concepts": discovered,
        "matched_existing": matched_existing,
        "ambiguous_terms": ambiguous,
        "unmatched_terms": unmatched,
        "excluded_terms": excluded,
        "auxiliary_terms": auxiliaries,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-seed", type=Path, required=True)
    parser.add_argument("--candidate-version", required=True)
    parser.add_argument("--min-occurrences", type=int, default=1)
    parser.add_argument("--out-candidate-seed", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.out_candidate_seed, args.report)
    if args.min_occurrences < 1:
        print("min-occurrences 必须大于 0", file=sys.stderr)
        return 2
    if not args.sqlite.is_file() or not args.base_seed.is_file():
        print("离线 SQLite 或基础目录种子不存在", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有概念候选或发现报告", file=sys.stderr)
        return 2
    try:
        base_seed = json.loads(args.base_seed.read_text(encoding="utf-8"))
        with sqlite3.connect(args.sqlite) as conn:
            candidate_seed, report = discover(
                conn, base_seed, args.candidate_version, args.min_occurrences
            )
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_candidate_seed.write_text(
            json.dumps(candidate_seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            json.dumps(
                {
                    "candidate_version": args.candidate_version,
                    "discovered_concepts": report["discovered_concept_count"],
                    "matched_existing": report["existing_match_count"],
                    "ambiguous_terms": report["ambiguous_term_count"],
                    "unmatched_terms": report["unmatched_term_count"],
                    "excluded_terms": report["excluded_term_count"],
                    "auxiliary_terms": report["auxiliary_term_count"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, sqlite3.Error, ValueError, KeyError, json.JSONDecodeError) as error:
        for path in targets:
            if path.exists():
                path.unlink()
        print(f"标准食材概念发现失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
