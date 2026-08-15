#!/usr/bin/env python3
"""校验并合并模型原料身份结果，生成标准食材候选目录。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import defaultdict
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from discover_standard_ingredient_concepts import (
    CATEGORY_BY_USDA_ID,
    PREPARATION_LABELS,
    normalize_name,
    preparation_state,
)
from recipe_ingredient_normalization import AUXILIARY_TERMS, exclusion_category


POLICY_ID = "recipeIngredientModelResultIntegration/v1"
BASE_IDENTITY_ALIASES = {
    "全脂奶粉": "奶粉",
    "脱脂奶粉": "奶粉",
    "低脂奶粉": "奶粉",
    "全脂牛奶": "牛奶",
    "脱脂牛奶": "牛奶",
    "低脂牛奶": "牛奶",
    "纯牛奶": "牛奶",
    "大白菜": "白菜",
}
GENERIC_IDENTITIES = {
    "肉", "鱼", "蛋", "菜", "青菜", "蔬菜", "水果", "坚果", "馅", "馅料",
    "食材", "配料", "其他", "面糊", "面团", "汤", "酱", "粉", "液体",
    "鸡", "猪", "牛", "羊", "鸭", "鹅", "火鸡", "蘑菇",
    "米饭",
}
SOURCE_SEARCH_ALIASES = {
    "青椒": "绿色甜椒",
    "红椒": "红色甜椒",
    "黄椒": "黄色甜椒",
    "橙椒": "橙色甜椒",
    "红豆": "小豆",
    "枣": "大棗",
    "面粉": "小麦粉",
    "低筋面粉": "小麦粉",
    "中筋面粉": "小麦粉",
    "高筋面粉": "小麦粉",
    "全麦面粉": "小麦粉",
    "奶粉": "牛奶",
    "全脂奶粉": "牛奶",
}
ANIMAL_DESCRIPTION_TERMS = {
    "火鸡": "turkey",
    "鸡": "chicken",
    "猪": "pork",
    "牛": "beef",
    "羊": "lamb",
    "鸭": "duck",
    "鹅": "goose",
}
SOURCE_DESCRIPTION_PATTERNS = {
    "排骨": re.compile(r"\b(?:ribs|backribs|spareribs)\b", re.IGNORECASE),
    "小排": re.compile(r"\b(?:ribs|backribs|spareribs)\b", re.IGNORECASE),
    "韭菜": re.compile(r"\bchives?\b", re.IGNORECASE),
    "红豆": re.compile(r"\badzuki\b", re.IGNORECASE),
    "枣": re.compile(r"\bjujube\b", re.IGNORECASE),
    "面粉": re.compile(r"^wheat flour, white, all-purpose\b", re.IGNORECASE),
    "低筋面粉": re.compile(r"^wheat flour, white, cake\b", re.IGNORECASE),
    "中筋面粉": re.compile(r"^wheat flour, white, all-purpose\b", re.IGNORECASE),
    "高筋面粉": re.compile(r"^wheat flour, white, bread\b", re.IGNORECASE),
    "全麦面粉": re.compile(r"^wheat flour, whole-grain\b", re.IGNORECASE),
    "淀粉": re.compile(r"^cornstarch$", re.IGNORECASE),
    "奶粉": re.compile(r"^milk, dry, whole\b", re.IGNORECASE),
    "全脂奶粉": re.compile(r"^milk, dry, whole\b", re.IGNORECASE),
    "火腿": re.compile(r"^pork, cured, ham\b", re.IGNORECASE),
    "腊肠": re.compile(r"^chinese sausage\b", re.IGNORECASE),
    "芥菜": re.compile(r"^mustard greens\b", re.IGNORECASE),
    "甘蓝": re.compile(r"^cabbage, green\b", re.IGNORECASE),
    "甜菜": re.compile(r"^beets, raw$", re.IGNORECASE),
    "猪蹄": re.compile(r"^pork, fresh, .*hocks?\b", re.IGNORECASE),
    "梭子鱼": re.compile(r"\bbarracuda\b", re.IGNORECASE),
}
SOURCE_CATEGORY_HINTS = {
    "奶粉": "dairy",
    "面粉": "carb",
    "低筋面粉": "carb",
    "中筋面粉": "carb",
    "高筋面粉": "carb",
    "全麦面粉": "carb",
    "淀粉": "carb",
    "全脂奶粉": "dairy",
}


def stable_id(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def canonical_model_base(value: str) -> str:
    base = str(value).strip()
    return BASE_IDENTITY_ALIASES.get(normalize_name(base), base)


def identity_is_consistent(cleaned_name: str, base_name: str) -> bool:
    """阻止模型把近形词或纯语义猜测直接写入目录。"""
    cleaned = normalize_name(cleaned_name)
    base = normalize_name(base_name)
    if not cleaned or not base or base in GENERIC_IDENTITIES:
        return False
    if cleaned in base and cleaned != base:
        return False
    if base in cleaned:
        return True
    return SequenceMatcher(None, cleaned, base).ratio() >= 0.72


def load_expected_batches(path: Path) -> dict[str, dict[str, Any]]:
    expected: dict[str, dict[str, Any]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        batch = json.loads(line)
        for term in batch["terms"]:
            name = str(term["cleaned_name"])
            if name in expected:
                raise ValueError(f"模型批次包含重复身份组：{name}")
            expected[name] = term
    if not expected:
        raise ValueError("模型批次为空")
    return expected


def load_results(directory: Path) -> dict[str, dict[str, Any]]:
    manifest = directory / "manifest.json"
    if not manifest.is_file():
        raise ValueError("模型结果尚未完成：缺少 manifest.json")
    results: dict[str, dict[str, Any]] = {}
    files = sorted(directory.glob("batch_[0-9][0-9][0-9][0-9].json"))
    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        for item in payload.get("results", []):
            name = str(item["cleaned_name"])
            if name in results:
                raise ValueError(f"模型结果包含重复身份组：{name}")
            results[name] = item
    return results


def load_catalog_owners(seed: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], set[tuple[str, int]]]:
    aliases: dict[str, dict[str, Any]] = {}
    sources: set[tuple[str, int]] = set()
    conflicts: set[str] = set()
    for item in seed.get("items", []):
        for value in [item["canonical_name_zh"], *item.get("aliases", [])]:
            key = normalize_name(str(value))
            if key in aliases and aliases[key]["concept_id"] != item["concept_id"]:
                conflicts.add(key)
            aliases[key] = item
        for candidate in item.get("nutrition_candidates", item.get("variants", [])):
            sources.add((str(candidate["source_version"]), int(candidate["fdc_id"])))
    for key in conflicts:
        aliases.pop(key, None)
    return aliases, sources


def load_source_candidates(conn: sqlite3.Connection) -> list[dict[str, Any]]:
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
        ORDER BY r.source_version, l.fdc_id
        """
    ).fetchall()
    return [
        {
            "localized_name": str(name),
            "normalized_localized_name": normalize_name(str(name)),
            "source_version": str(version),
            "fdc_id": int(fdc_id),
            "description": str(description),
            "food_category_id": int(category_id) if category_id is not None else None,
            "nutrient_count": int(nutrient_count),
        }
        for name, version, fdc_id, description, category_id, nutrient_count in rows
    ]


def source_matches(base_name: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = normalize_name(base_name)
    search_name = normalize_name(SOURCE_SEARCH_ALIASES.get(base, base))
    matched = [
        row for row in rows if search_name in row["normalized_localized_name"]
    ]
    required_animal = next(
        (
            english
            for chinese, english in ANIMAL_DESCRIPTION_TERMS.items()
            if chinese in base
        ),
        "pork" if base in {"排骨", "小排"} else None,
    )
    if required_animal:
        matched = [
            row for row in matched
            if required_animal in row["description"].lower()
        ]
    description_pattern = SOURCE_DESCRIPTION_PATTERNS.get(base)
    if description_pattern:
        matched = [
            row for row in matched if description_pattern.search(row["description"])
        ]
    category_hint = SOURCE_CATEGORY_HINTS.get(base)
    if category_hint:
        matched = [
            row
            for row in matched
            if CATEGORY_BY_USDA_ID.get(row["food_category_id"]) == category_hint
        ]
    categories = {
        CATEGORY_BY_USDA_ID.get(row["food_category_id"])
        for row in matched
        if CATEGORY_BY_USDA_ID.get(row["food_category_id"])
    }
    if len(categories) != 1:
        return []
    category = next(iter(categories))
    return [
        row
        for row in matched
        if CATEGORY_BY_USDA_ID.get(row["food_category_id"]) == category
    ]


def candidate_variant(concept_id: str, canonical: str, row: dict[str, Any]) -> dict[str, Any]:
    state = preparation_state(row["description"])
    key = f'{row["source_version"]}:{row["fdc_id"]}'
    return {
        "variant_id": stable_id(f"variant_{concept_id.removeprefix('ingredient_')}", key),
        "display_name_zh": f"{canonical}（{PREPARATION_LABELS[state]}）",
        "preparation_state": state,
        "source_version": row["source_version"],
        "fdc_id": row["fdc_id"],
        "description_contains": row["description"],
        "is_default": False,
    }


def integrate(
    conn: sqlite3.Connection,
    base_seed: dict[str, Any],
    expected: dict[str, dict[str, Any]],
    results: dict[str, dict[str, Any]],
    candidate_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if set(expected) != set(results):
        missing = sorted(set(expected) - set(results))
        extra = sorted(set(results) - set(expected))
        raise ValueError(f"模型结果未一一覆盖批次：missing={len(missing)}, extra={len(extra)}")

    output = deepcopy(base_seed)
    output["catalog_version"] = candidate_version
    output["catalog_schema_version"] = 2
    output["model_integration_policy"] = {
        "policy_id": POLICY_ID,
        "rule": "模型只提议身份；字面一致且可落到既有概念或来源档案时才进入候选",
    }
    aliases, owned_sources = load_catalog_owners(output)
    source_rows = load_source_candidates(conn)
    accepted_existing: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for cleaned_name, term in expected.items():
        result = results[cleaned_name]
        base_name = result.get("base_name_zh")
        occurrence_count = int(term["occurrence_count"])
        if result.get("status") != "resolved" or not base_name:
            rejected.append({
                "cleaned_name": cleaned_name,
                "occurrence_count": occurrence_count,
                "reason": "model_unresolved",
            })
            continue
        base_name = canonical_model_base(str(base_name))
        excluded_category = exclusion_category(base_name)
        if excluded_category:
            rejected.append({
                "cleaned_name": cleaned_name,
                "base_name_zh": base_name,
                "occurrence_count": occurrence_count,
                "reason": f"excluded_{excluded_category}",
            })
            continue
        if normalize_name(base_name) in AUXILIARY_TERMS:
            rejected.append({
                "cleaned_name": cleaned_name,
                "base_name_zh": base_name,
                "occurrence_count": occurrence_count,
                "reason": "auxiliary_current_policy",
            })
            continue
        if not identity_is_consistent(cleaned_name, base_name):
            rejected.append({
                "cleaned_name": cleaned_name,
                "base_name_zh": base_name,
                "occurrence_count": occurrence_count,
                "reason": "lexical_identity_gate_failed",
            })
            continue
        owner = aliases.get(normalize_name(base_name))
        if owner is not None:
            for alias in (cleaned_name, base_name):
                normalized = normalize_name(alias)
                if normalized not in aliases:
                    owner.setdefault("aliases", []).append(alias)
                    aliases[normalized] = owner
            accepted_existing.append({
                "cleaned_name": cleaned_name,
                "base_name_zh": base_name,
                "occurrence_count": occurrence_count,
                "concept_id": owner["concept_id"],
            })
            continue
        groups[normalize_name(base_name)].append({
            "cleaned_name": cleaned_name,
            "base_name_zh": base_name,
            "occurrence_count": occurrence_count,
        })

    discovered: list[dict[str, Any]] = []
    reserved_sources = set(owned_sources)
    ordered_groups = sorted(
        groups.items(),
        key=lambda pair: (-len(pair[0]), -sum(row["occurrence_count"] for row in pair[1]), pair[0]),
    )
    for normalized_base, members in ordered_groups:
        canonical = sorted(
            members,
            key=lambda row: (-row["occurrence_count"], row["base_name_zh"]),
        )[0]["base_name_zh"]
        candidates = [
            row for row in source_matches(canonical, source_rows)
            if (row["source_version"], row["fdc_id"]) not in reserved_sources
        ]
        if not candidates:
            for member in members:
                rejected.append({**member, "reason": "no_unique_supported_source"})
            continue
        concept = stable_id("ingredient_auto_model", normalized_base)
        category = CATEGORY_BY_USDA_ID[candidates[0]["food_category_id"]]
        aliases_for_item = sorted({
            member["cleaned_name"] for member in members
            if normalize_name(member["cleaned_name"]) != normalized_base
        })
        item = {
            "concept_id": concept,
            "canonical_name_zh": canonical,
            "category_code": category,
            "subcategory_code": None,
            "aliases": aliases_for_item,
            "nutrition_candidates": [candidate_variant(concept, canonical, row) for row in candidates],
        }
        output.setdefault("items", []).append(item)
        for row in candidates:
            reserved_sources.add((row["source_version"], row["fdc_id"]))
        discovered.append({
            "concept_id": concept,
            "canonical_name_zh": canonical,
            "aliases": aliases_for_item,
            "recipe_occurrence_count": sum(row["occurrence_count"] for row in members),
            "source_candidate_count": len(candidates),
        })

    for item in output.get("items", []):
        item["aliases"] = sorted(set(item.get("aliases", [])))
    report = {
        "report_contract": "recipeIngredientModelResultIntegrationReport/v1",
        "candidate_version": candidate_version,
        "integration_policy_id": POLICY_ID,
        "model_identity_group_count": len(expected),
        "model_resolved_count": sum(
            item.get("status") == "resolved" and bool(item.get("base_name_zh"))
            for item in results.values()
        ),
        "accepted_existing_count": len(accepted_existing),
        "discovered_concept_count": len(discovered),
        "rejected_group_count": len(rejected),
        "accepted_existing_occurrence_count": sum(row["occurrence_count"] for row in accepted_existing),
        "discovered_occurrence_count": sum(row["recipe_occurrence_count"] for row in discovered),
        "rejected_occurrence_count": sum(row["occurrence_count"] for row in rejected),
        "discovered_concepts": discovered,
        "accepted_existing": accepted_existing,
        "rejected": sorted(rejected, key=lambda row: (-row["occurrence_count"], row["cleaned_name"])),
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-seed", type=Path, required=True)
    parser.add_argument("--model-batches", type=Path, required=True)
    parser.add_argument("--model-results-dir", type=Path, required=True)
    parser.add_argument("--candidate-version", required=True)
    parser.add_argument("--out-candidate-seed", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.out_candidate_seed, args.report)
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有模型合并候选或报告", file=sys.stderr)
        return 2
    if not args.sqlite.is_file() or not args.base_seed.is_file() or not args.model_batches.is_file():
        print("合并输入文件不完整", file=sys.stderr)
        return 2
    try:
        base_seed = json.loads(args.base_seed.read_text(encoding="utf-8"))
        expected = load_expected_batches(args.model_batches)
        results = load_results(args.model_results_dir)
        with sqlite3.connect(args.sqlite) as conn:
            candidate, report = integrate(
                conn, base_seed, expected, results, args.candidate_version
            )
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_candidate_seed.write_text(
            json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "candidate_version": args.candidate_version,
            "model_groups": report["model_identity_group_count"],
            "accepted_existing": report["accepted_existing_count"],
            "discovered_concepts": report["discovered_concept_count"],
            "rejected_groups": report["rejected_group_count"],
        }, ensure_ascii=False, indent=2))
        return 0
    except (OSError, KeyError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"模型结果合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
