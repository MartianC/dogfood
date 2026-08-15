#!/usr/bin/env python3
"""为“上位词或省略词”生成确定性终态和受控本地模型批次。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from recipe_ingredient_normalization import (
    AUXILIARY_TERMS,
    CONTROLLED_BARE_INGREDIENT_DEFAULTS,
    exclusion_category,
    normalize_text,
)
from seed_ingredient_catalog import normalize_alias


POLICY_ID = "genericAmbiguousIdentityPreparation/v1"
INPUT_CONTRACT = "recipeIngredientGapClassification/v1"
SAFE_USAGE_PATTERN = re.compile(
    r"中种|主面团|面团|面糊|馅|内馅|装饰|表面|刷面|腌制|焯水|泡发|洗净|"
    r"切好|备用|油酥|水油皮|油皮|派皮|酥皮|可选|可不加|可不放|室温软化|"
    r"大|小|中等大小|适量|少许|用$"
)
STATE_ANNOTATION_PATTERN = re.compile(r"取蛋清|取蛋黄|去皮|去骨|带皮|带骨|生|熟|干|鲜|冷冻|速冻")
ALTERNATIVE_PATTERN = re.compile(r"(?:或者|或|/)")
COMPOSITE_PATTERN = re.compile(r"[、,，+]|和|青红|红绿")
GENERIC_HINTS = {
    "肉": ("猪肉", "猪肉末", "牛肉", "鸡肉", "羊肉"),
    "肉糜": ("猪肉末", "猪肉", "牛肉末", "鸡肉"),
    "肉沫": ("猪肉末", "猪肉", "牛肉末", "鸡肉"),
    "肉片": ("猪肉", "牛肉", "鸡肉", "羊肉"),
    "碎肉": ("猪肉末", "猪肉", "牛肉末", "鸡肉"),
    "鸭": ("鸭肉",),
    "鹅": ("鹅肉",),
    "猪": ("猪肉",),
    "牛": ("牛肉",),
    "羊": ("羊肉",),
    "蔬菜": ("小白菜", "菠菜", "油菜", "生菜"),
    "水果": ("苹果", "梨", "香蕉", "橙子"),
    "菌菇": ("平菇", "香菇", "口蘑", "金针菇"),
    "坚果": ("核桃", "花生", "杏仁", "腰果"),
    "海鲜": ("虾", "鱼", "螃蟹", "贝类"),
}


def catalog_index(catalog: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    concepts: dict[str, dict[str, Any]] = {}
    aliases: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in catalog.get("items", []):
        compact = {
            "choice_id": f"concept:{item['concept_id']}",
            "concept_id": str(item["concept_id"]),
            "canonical_name_zh": str(item["canonical_name_zh"]),
            "category_code": str(item.get("category_code") or ""),
        }
        concepts[compact["concept_id"]] = compact
        for value in [item["canonical_name_zh"], *item.get("aliases", [])]:
            aliases[normalize_alias(str(value))].append(compact)
    return concepts, aliases


def unique_alias(aliases: dict[str, list[dict[str, Any]]], value: str) -> dict[str, Any] | None:
    matches = aliases.get(normalize_alias(value), [])
    owners = {item["concept_id"]: item for item in matches}
    return next(iter(owners.values())) if len(owners) == 1 else None


def bracket_parts(value: str) -> tuple[str, str] | None:
    match = re.fullmatch(r"(.+?)\(([^()]*)\)", value)
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def candidate_score(name: str, candidate_name: str) -> float:
    left, right = normalize_alias(name), normalize_alias(candidate_name)
    if not left or not right:
        return 0.0
    ratio = SequenceMatcher(None, left, right).ratio()
    containment = min(len(left), len(right)) / max(len(left), len(right)) if left in right or right in left else 0.0
    overlap = len(set(left) & set(right)) / max(len(set(left)), 1)
    return max(ratio, containment, overlap * 0.72)


def controlled_candidates(
    name: str,
    aliases: dict[str, list[dict[str, Any]]],
    concepts: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    values: dict[str, tuple[float, dict[str, Any], str]] = {}
    search_terms = [name]
    parts = bracket_parts(name)
    if parts:
        search_terms.extend(parts)
    search_terms.extend(GENERIC_HINTS.get(name, ()))
    default = CONTROLLED_BARE_INGREDIENT_DEFAULTS.get(name)
    if default:
        search_terms.insert(0, default)
    for term in search_terms:
        exact = unique_alias(aliases, term)
        if exact:
            boost = 2.0 if term != name else 3.0
            current = values.get(exact["concept_id"])
            if current is None or boost > current[0]:
                values[exact["concept_id"]] = (boost, exact, term)
        for candidate in concepts.values():
            score = candidate_score(term, candidate["canonical_name_zh"])
            if score < 0.45:
                continue
            current = values.get(candidate["concept_id"])
            if current is None or score > current[0]:
                values[candidate["concept_id"]] = (score, candidate, term)
    ranked = sorted(values.values(), key=lambda value: (-value[0], value[1]["canonical_name_zh"]))[:5]
    return [{**item, "matched_from": matched_from, "score": round(score, 4)} for score, item, matched_from in ranked]


def deterministic_decision(
    name: str, aliases: dict[str, list[dict[str, Any]]]
) -> tuple[str, str] | None:
    excluded = exclusion_category(name)
    if excluded:
        return "excluded", f"deterministic_{excluded}"
    if name in AUXILIARY_TERMS:
        return "auxiliary", "deterministic_auxiliary"
    parts = bracket_parts(name)
    if parts:
        base, annotation = parts
        base_concept = unique_alias(aliases, base)
        annotation_concept = unique_alias(aliases, annotation)
        if base_concept and SAFE_USAGE_PATTERN.search(annotation):
            return base_concept["choice_id"], "safe_annotation_base_exact"
        if base_concept and annotation_concept and base_concept["concept_id"] == annotation_concept["concept_id"]:
            return base_concept["choice_id"], "identity_annotation_same_concept"
        if base_concept and STATE_ANNOTATION_PATTERN.search(annotation):
            return "state_conversion", "state_annotation_requires_conversion"
        if base_concept:
            annotation_key = normalize_alias(annotation)
            conflicting_concepts = {
                candidate["concept_id"]
                for alias, candidates in aliases.items()
                if len(alias) >= 2 and alias in annotation_key
                for candidate in candidates
                if candidate["concept_id"] != base_concept["concept_id"]
            }
            if not conflicting_concepts:
                return base_concept["choice_id"], "non_identity_annotation_base_exact"
    if ALTERNATIVE_PATTERN.search(name):
        return "alternative", "structured_alternative"
    if COMPOSITE_PATTERN.search(name):
        return "composite", "structured_composite"
    return None


def prepare(
    classification: dict[str, Any], catalog: dict[str, Any], batch_size: int
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    if classification.get("contract") != INPUT_CONTRACT:
        raise ValueError("上位词分类合同不匹配")
    concepts, aliases = catalog_index(catalog)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in classification.get("items", []):
        if item.get("category") == "generic_ambiguous":
            grouped[str(item["cleaned_name"])].append(item)
    candidates_document_items: list[dict[str, Any]] = []
    automatic: list[dict[str, Any]] = []
    model_items: list[dict[str, Any]] = []
    for name, terms in grouped.items():
        record = {
            "cleaned_name": name,
            "occurrence_count": sum(int(item["occurrence_count"]) for item in terms),
            "source_terms": [
                {
                    "normalized_name": str(item["normalized_name"]),
                    "example_raw_name": item.get("example_raw_name"),
                    "occurrence_count": int(item["occurrence_count"]),
                    "rule_id": item.get("rule_id"),
                }
                for item in terms
            ],
            "concept_candidates": controlled_candidates(name, aliases, concepts),
        }
        candidates_document_items.append(record)
        decision = deterministic_decision(name, aliases)
        if decision:
            automatic.append({"cleaned_name": name, "decision": decision[0], "method": decision[1]})
        else:
            model_items.append(record)
    candidates_document_items.sort(key=lambda value: (-value["occurrence_count"], value["cleaned_name"]))
    automatic.sort(key=lambda value: value["cleaned_name"])
    model_items.sort(key=lambda value: (-value["occurrence_count"], value["cleaned_name"]))
    batches = [
        {
            "batch_id": f"generic_ambiguous_{index // batch_size + 1:04d}",
            "contract": "genericAmbiguousIdentityModelBatch/v1",
            "items": model_items[index:index + batch_size],
        }
        for index in range(0, len(model_items), batch_size)
    ]
    candidate_document = {
        "contract": "genericAmbiguousIdentityCandidates/v1",
        "policy_id": POLICY_ID,
        "items": candidates_document_items,
    }
    automatic_document = {
        "contract": "genericAmbiguousIdentityAutomaticDecisions/v1",
        "policy_id": POLICY_ID,
        "items": automatic,
    }
    report = {
        "report_contract": "genericAmbiguousIdentityPreparationReport/v1",
        "policy_id": POLICY_ID,
        "input_term_count": sum(len(values) for values in grouped.values()),
        "input_occurrence_count": sum(int(item["occurrence_count"]) for values in grouped.values() for item in values),
        "identity_group_count": len(grouped),
        "automatic_group_count": len(automatic),
        "automatic_occurrence_count": sum(
            next(item["occurrence_count"] for item in candidates_document_items if item["cleaned_name"] == value["cleaned_name"])
            for value in automatic
        ),
        "model_group_count": len(model_items),
        "model_occurrence_count": sum(item["occurrence_count"] for item in model_items),
        "model_batch_count": len(batches),
        "groups_without_candidates": sum(not item["concept_candidates"] for item in model_items),
    }
    if report["automatic_group_count"] + report["model_group_count"] != report["identity_group_count"]:
        raise ValueError("上位词准备结果不守恒")
    return candidate_document, automatic_document, batches, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classification", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=25)
    args = parser.parse_args()
    if args.out_dir.exists() or args.batch_size <= 0:
        print("拒绝覆盖上位词审核准备目录，且批次大小必须大于0", file=sys.stderr)
        return 2
    try:
        classification = json.loads(args.classification.read_text(encoding="utf-8"))
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        candidates, automatic, batches, report = prepare(classification, catalog, args.batch_size)
        args.out_dir.mkdir(parents=True)
        artifacts = {"candidates.json": candidates, "automatic-decisions.json": automatic}
        report["artifact_sha256"] = {}
        for filename, document in artifacts.items():
            content = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode()
            (args.out_dir / filename).write_bytes(content)
            report["artifact_sha256"][filename] = hashlib.sha256(content).hexdigest()
        (args.out_dir / "model-batches.jsonl").write_text(
            "".join(json.dumps(batch, ensure_ascii=False) + "\n" for batch in batches), encoding="utf-8"
        )
        (args.out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"上位词审核准备失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
