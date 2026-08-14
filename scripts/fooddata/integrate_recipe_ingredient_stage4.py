#!/usr/bin/env python3
"""用版本化中英身份词典合并阶段四高频原料，生成新的完整目录。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from discover_standard_ingredient_concepts import PREPARATION_LABELS, preparation_state
from seed_ingredient_catalog import normalize_alias, validate_seed_shape
from select_preferred_ingredient_sources import candidate_score, score_explanation


POLICY_ID = "recipeIngredientStage4IdentityLexiconIntegration/v1"
LEXICON_CONTRACT = "recipeIngredientIdentityLexicon/v1"
ROUTE_CONTRACT = "recipeIngredientStage1Route/v1"


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def source_key(value: dict[str, Any]) -> tuple[str, int]:
    return str(value["source_version"]), int(value["fdc_id"])


def load_wave_items(
    route: dict[str, Any],
    minimum_occurrences: int,
    maximum_occurrences: int | None = None,
) -> dict[str, dict[str, Any]]:
    if route.get("contract") != ROUTE_CONTRACT or route.get("route") != "identity_candidate":
        raise ValueError("阶段四输入必须是阶段一 identity_candidate 路由")
    items = {
        str(item["normalized_name"]): item
        for item in route.get("items", [])
        if int(item.get("occurrence_count", 0)) >= minimum_occurrences
        and (
            maximum_occurrences is None
            or int(item.get("occurrence_count", 0)) <= maximum_occurrences
        )
    }
    if not items:
        raise ValueError("阶段四波次没有达到频次阈值的原料")
    return items


def assignment_terms(lexicon: dict[str, Any]) -> dict[str, str]:
    assignments: dict[str, str] = {}
    sections = (
        ("existing_aliases", "existing_alias"),
        ("new_concepts", "new_concept"),
    )
    for section, decision in sections:
        for entry in lexicon.get(section, []):
            for value in entry.get("terms", []):
                term = str(value).strip()
                if not term:
                    raise ValueError(f"阶段四 {section} 包含空词条")
                if term in assignments:
                    raise ValueError(f"阶段四词条重复分配：{term}")
                assignments[term] = decision
    for entry in lexicon.get("isolated", []):
        term = str(entry.get("term", "")).strip()
        if not term or not str(entry.get("reason", "")).strip():
            raise ValueError("阶段四隔离项必须包含 term 和 reason")
        if term in assignments:
            raise ValueError(f"阶段四词条重复分配：{term}")
        assignments[term] = "isolated"
    return assignments


def complete_default_isolation(
    lexicon: dict[str, Any],
    wave_items: dict[str, dict[str, Any]],
    assignments: dict[str, str],
) -> list[dict[str, str]]:
    explicit = [
        {"term": str(entry["term"]), "reason": str(entry["reason"])}
        for entry in lexicon.get("isolated", [])
    ]
    default_reason = str(lexicon.get("default_isolation_reason", "")).strip()
    missing = sorted(set(wave_items) - set(assignments))
    if missing and not default_reason:
        raise ValueError(f"阶段四词典缺少波次词条：{missing}")
    return [
        *explicit,
        *({"term": term, "reason": default_reason} for term in missing),
    ]


def load_source_candidates(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.source_version, f.fdc_id, f.food_category_id, f.description,
               COUNT(n.rowid) AS nutrient_count
        FROM source_food f
        JOIN source_release r ON r.release_id = f.source_release_id
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id = f.source_release_id AND n.fdc_id = f.fdc_id
        GROUP BY r.source_version, f.fdc_id, f.food_category_id, f.description
        HAVING COUNT(n.rowid) > 0
        ORDER BY r.source_version, f.fdc_id
        """
    ).fetchall()
    return [
        {
            "source_version": str(version),
            "fdc_id": int(fdc_id),
            "food_category_id": int(category_id) if category_id is not None else None,
            "description": str(description),
            "source_description": str(description),
            "preparation_state": preparation_state(str(description)),
            "nutrient_count": int(nutrient_count),
            "is_default": False,
            "variant_id": f"source_{version}_{fdc_id}",
        }
        for version, fdc_id, category_id, description, nutrient_count in rows
    ]


def select_source(
    entry: dict[str, Any],
    source_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pattern_text = str(entry.get("source_description_pattern", "")).strip()
    category_ids = {int(value) for value in entry.get("source_category_ids", [])}
    if not pattern_text or not category_ids:
        raise ValueError(f"新概念缺少英文身份或来源分类约束：{entry.get('canonical_name_zh')}")
    try:
        pattern = re.compile(pattern_text, re.IGNORECASE)
    except re.error as error:
        raise ValueError(f"来源英文正则无效：{pattern_text}：{error}") from error
    candidates = [
        row for row in source_rows
        if row["food_category_id"] in category_ids and pattern.search(row["description"])
    ]
    if not candidates:
        raise ValueError(f"新概念没有满足门禁的营养来源：{entry.get('canonical_name_zh')}")
    ordered = sorted(candidates, key=candidate_score)
    return ordered[0], ordered


def integrate_stage4(
    conn: sqlite3.Connection,
    base_catalog: dict[str, Any],
    route: dict[str, Any],
    lexicon: dict[str, Any],
    catalog_version: str,
    minimum_occurrences: int,
    maximum_occurrences: int | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if lexicon.get("contract") != LEXICON_CONTRACT:
        raise ValueError("阶段四身份词典合同不匹配")
    wave_items = load_wave_items(route, minimum_occurrences, maximum_occurrences)
    assignments = assignment_terms(lexicon)
    extra = sorted(set(assignments) - set(wave_items))
    if extra:
        raise ValueError(f"阶段四词典包含波次外词条：{extra}")
    isolated_entries = complete_default_isolation(lexicon, wave_items, assignments)
    for entry in isolated_entries:
        assignments[entry["term"]] = "isolated"

    output = deepcopy(base_catalog)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["stage4_identity_lexicon_integration"] = {
        "policy_id": POLICY_ID,
        "lexicon_version": lexicon.get("lexicon_version"),
        "minimum_occurrences": minimum_occurrences,
        "maximum_occurrences": maximum_occurrences,
        "rule": "完整覆盖频次波次；既有别名或受控英文身份来源通过后才允许写入目录",
    }
    items = output.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("阶段四基础目录缺少 items")

    concept_by_id = {str(item["concept_id"]): item for item in items}
    alias_owner: dict[str, dict[str, Any]] = {}
    source_owner: dict[tuple[str, int], dict[str, Any]] = {}
    for item in items:
        for value in [item["canonical_name_zh"], *item.get("aliases", [])]:
            key = normalize_alias(str(value))
            previous = alias_owner.get(key)
            if previous and previous["concept_id"] != item["concept_id"]:
                raise ValueError(f"基础目录存在跨概念别名冲突：{value}")
            alias_owner[key] = item
        for variant in item.get("variants", []):
            key = source_key(variant)
            if key in source_owner:
                raise ValueError(f"基础目录存在重复来源：{key}")
            source_owner[key] = item

    decisions: list[dict[str, Any]] = []
    added_aliases: list[dict[str, Any]] = []
    for entry in lexicon.get("existing_aliases", []):
        concept_id = str(entry.get("concept_id", ""))
        owner = concept_by_id.get(concept_id)
        if not owner:
            raise ValueError(f"阶段四既有概念不存在：{concept_id}")
        for term in entry.get("terms", []):
            normalized = normalize_alias(str(term))
            previous = alias_owner.get(normalized)
            if previous and previous["concept_id"] != concept_id:
                raise ValueError(f"阶段四别名跨概念冲突：{term}")
            if term != owner["canonical_name_zh"] and term not in owner.setdefault("aliases", []):
                owner["aliases"].append(str(term))
                added_aliases.append({"term": term, "concept_id": concept_id})
            alias_owner[normalized] = owner
            source_item = wave_items[str(term)]
            decisions.append({
                "term": term,
                "occurrence_count": int(source_item["occurrence_count"]),
                "decision": "mapped_existing_concept",
                "concept_id": concept_id,
            })
        owner["aliases"] = sorted(set(owner.get("aliases", [])))

    source_rows = load_source_candidates(conn)
    added_concepts: list[dict[str, Any]] = []
    for entry in lexicon.get("new_concepts", []):
        canonical = str(entry.get("canonical_name_zh", "")).strip()
        category_code = str(entry.get("category_code", "")).strip()
        terms = [str(value).strip() for value in entry.get("terms", [])]
        if not canonical or not category_code or not terms:
            raise ValueError("阶段四新概念缺少标准名、分类或词条")
        selected, candidates = select_source(entry, source_rows)
        key = source_key(selected)
        if key in source_owner:
            raise ValueError(f"阶段四新概念来源已被占用：{canonical} -> {key}")
        concept_id = stable_id("ingredient_stage4", canonical)
        if concept_id in concept_by_id:
            raise ValueError(f"阶段四新概念ID已存在：{concept_id}")
        for value in [canonical, *terms]:
            previous = alias_owner.get(normalize_alias(value))
            if previous and previous["concept_id"] != concept_id:
                raise ValueError(f"阶段四新概念名称冲突：{value}")
        state = str(selected["preparation_state"] or "unspecified")
        variant = {
            "variant_id": stable_id("variant_stage4", f"{concept_id}|{key[0]}|{key[1]}"),
            "display_name_zh": f"{canonical}（{PREPARATION_LABELS.get(state, state)}）",
            "preparation_state": state,
            "source_version": key[0],
            "fdc_id": key[1],
            "description_contains": selected["description"],
            "is_default": True,
        }
        item = {
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "category_code": category_code,
            "subcategory_code": None,
            "aliases": sorted({term for term in terms if term != canonical}),
            "variants": [variant],
        }
        items.append(item)
        concept_by_id[concept_id] = item
        source_owner[key] = item
        for value in [canonical, *item["aliases"]]:
            alias_owner[normalize_alias(value)] = item
        occurrence_count = sum(int(wave_items[term]["occurrence_count"]) for term in terms)
        added_concepts.append({
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "terms": terms,
            "occurrence_count": occurrence_count,
            "source_candidate_count": len(candidates),
            "selected_source_version": key[0],
            "selected_fdc_id": key[1],
            "selected_description": selected["description"],
            "selected_score": score_explanation(selected),
        })
        for term in terms:
            decisions.append({
                "term": term,
                "occurrence_count": int(wave_items[term]["occurrence_count"]),
                "decision": "new_concept",
                "concept_id": concept_id,
            })

    isolated = []
    for entry in isolated_entries:
        term = str(entry["term"])
        isolated.append({
            "term": term,
            "occurrence_count": int(wave_items[term]["occurrence_count"]),
            "reason": str(entry["reason"]),
        })
        decisions.append({
            "term": term,
            "occurrence_count": int(wave_items[term]["occurrence_count"]),
            "decision": "isolated",
            "reason": str(entry["reason"]),
        })

    items.sort(key=lambda item: str(item["concept_id"]))
    decisions.sort(key=lambda item: (-int(item["occurrence_count"]), str(item["term"])))
    isolated.sort(key=lambda item: (-int(item["occurrence_count"]), str(item["term"])))
    validate_seed_shape(output)
    accepted = [item for item in decisions if item["decision"] != "isolated"]
    report = {
        "report_contract": "recipeIngredientStage4IntegrationReport/v1",
        "policy_id": POLICY_ID,
        "lexicon_version": lexicon.get("lexicon_version"),
        "catalog_version": catalog_version,
        "minimum_occurrences": minimum_occurrences,
        "maximum_occurrences": maximum_occurrences,
        "wave_term_count": len(wave_items),
        "wave_occurrence_count": sum(int(item["occurrence_count"]) for item in wave_items.values()),
        "accepted_term_count": len(accepted),
        "accepted_occurrence_count": sum(int(item["occurrence_count"]) for item in accepted),
        "isolated_term_count": len(isolated),
        "isolated_occurrence_count": sum(int(item["occurrence_count"]) for item in isolated),
        "base_concept_count": len(base_catalog["items"]),
        "final_concept_count": len(items),
        "added_concept_count": len(added_concepts),
        "added_alias_count": len(added_aliases),
        "selected_source_count": len(source_owner),
        "added_concepts": added_concepts,
        "added_aliases": added_aliases,
        "isolated": isolated,
        "decisions": decisions,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--identity-candidates", type=Path, required=True)
    parser.add_argument("--lexicon", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--minimum-occurrences", type=int, default=100)
    parser.add_argument("--maximum-occurrences", type=int)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inputs = (args.sqlite, args.base_catalog, args.identity_candidates, args.lexicon)
    targets = (args.out_catalog, args.report)
    if not all(path.is_file() for path in inputs):
        print("阶段四输入不完整", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有阶段四目录或报告", file=sys.stderr)
        return 2
    if args.minimum_occurrences <= 0 or (
        args.maximum_occurrences is not None
        and args.maximum_occurrences < args.minimum_occurrences
    ):
        print("阶段四频次范围无效", file=sys.stderr)
        return 2
    try:
        base_catalog, route, lexicon = [
            json.loads(path.read_text(encoding="utf-8")) for path in inputs[1:]
        ]
        with sqlite3.connect(args.sqlite) as conn:
            catalog, report = integrate_stage4(
                conn, base_catalog, route, lexicon,
                args.catalog_version, args.minimum_occurrences,
                args.maximum_occurrences,
            )
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"阶段四目录合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
