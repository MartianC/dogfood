#!/usr/bin/env python3
"""把阶段二唯一来源决定合并为新的完整标准食材目录。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from discover_standard_ingredient_concepts import PREPARATION_LABELS
from seed_ingredient_catalog import normalize_alias, validate_seed_shape


POLICY_ID = "stage2SourceDecisionCatalogIntegration/v1"
DECISION_CONTRACT = "recipeIngredientStage2Decisions/v1"
CANONICAL_NAMES = {
    "milk": "牛奶",
    "sesame": "芝麻",
    "wood_ear_mushroom": "木耳",
    "cocoa_powder": "可可粉",
    "lemon": "柠檬",
    "yogurt": "酸奶",
    "pineapple": "菠萝",
    "winter_melon": "冬瓜",
    "coconut_milk": "椰浆",
}


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def source_key(variant: dict[str, Any]) -> tuple[str, int]:
    return str(variant["source_version"]), int(variant["fdc_id"])


def integrate_catalog(
    base_catalog: dict[str, Any],
    decisions: dict[str, Any],
    catalog_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if decisions.get("contract") != DECISION_CONTRACT:
        raise ValueError("阶段二决定合同不匹配")
    output = deepcopy(base_catalog)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["stage2_source_integration"] = {
        "policy_id": POLICY_ID,
        "source_policy_id": decisions.get("policy_id"),
        "rule": "受控中英身份一致且唯一来源簇通过后，才补充既有别名或建立新概念",
    }
    items = output.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("基础目录缺少 items")

    source_owner: dict[tuple[str, int], dict[str, Any]] = {}
    alias_owner: dict[str, dict[str, Any]] = {}
    for item in items:
        for variant in item.get("variants", []):
            source_owner[source_key(variant)] = item
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]:
            alias_owner[normalize_alias(str(alias))] = item

    added_concepts: list[dict[str, Any]] = []
    extended_concepts: list[dict[str, Any]] = []
    for decision in decisions.get("items", []):
        selected = decision["selected_source"]
        key = source_key(selected)
        aliases = sorted(
            {
                str(term["cleaned_name"]).strip()
                for term in decision.get("recipe_terms", [])
                if str(term.get("cleaned_name", "")).strip()
            }
        )
        if decision["decision"] == "mapped_existing_source":
            owner = source_owner.get(key)
            if not owner or owner["concept_id"] != decision.get("existing_concept_id"):
                raise ValueError(f"既有来源归属不匹配：{key}")
            added_aliases = []
            for alias in aliases:
                normalized = normalize_alias(alias)
                previous = alias_owner.get(normalized)
                if previous and previous["concept_id"] != owner["concept_id"]:
                    raise ValueError(f"阶段二别名跨概念冲突：{alias}")
                if alias != owner["canonical_name_zh"] and alias not in owner.setdefault("aliases", []):
                    owner["aliases"].append(alias)
                    added_aliases.append(alias)
                alias_owner[normalized] = owner
            owner["aliases"] = sorted(set(owner.get("aliases", [])))
            extended_concepts.append({
                "concept_id": owner["concept_id"],
                "canonical_name_zh": owner["canonical_name_zh"],
                "added_aliases": added_aliases,
            })
            continue

        base_identity = str(decision["base_identity"])
        canonical = CANONICAL_NAMES.get(base_identity)
        if not canonical:
            raise ValueError(f"新概念缺少受控中文标准名：{base_identity}")
        if key in source_owner:
            raise ValueError(f"新概念来源已被占用：{key}")
        concept_id = stable_id("ingredient_stage2", base_identity)
        for alias in [canonical, *aliases]:
            previous = alias_owner.get(normalize_alias(alias))
            if previous and previous["concept_id"] != concept_id:
                raise ValueError(f"新概念别名跨概念冲突：{alias}")
        state = str(selected.get("preparation_state") or "unspecified")
        variant = {
            "variant_id": stable_id("variant_stage2", f"{concept_id}|{key[0]}|{key[1]}"),
            "display_name_zh": f"{canonical}（{PREPARATION_LABELS.get(state, state)}）",
            "preparation_state": state,
            "source_version": key[0],
            "fdc_id": key[1],
            "description_contains": str(selected["description"]),
            "is_default": True,
        }
        item = {
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "category_code": decision["category_code"],
            "subcategory_code": None,
            "aliases": sorted({alias for alias in aliases if alias != canonical}),
            "variants": [variant],
        }
        items.append(item)
        source_owner[key] = item
        for alias in [canonical, *item["aliases"]]:
            alias_owner[normalize_alias(alias)] = item
        added_concepts.append({
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "aliases": item["aliases"],
            "source_version": key[0],
            "fdc_id": key[1],
        })

    items.sort(key=lambda item: str(item["concept_id"]))
    validate_seed_shape(output)
    report = {
        "report_contract": "stage2SourceDecisionCatalogIntegration/v1",
        "integration_policy_id": POLICY_ID,
        "catalog_version": catalog_version,
        "base_concept_count": len(base_catalog["items"]),
        "final_concept_count": len(items),
        "added_concept_count": len(added_concepts),
        "extended_concept_count": len(extended_concepts),
        "selected_source_count": sum(len(item["variants"]) for item in items),
        "added_concepts": added_concepts,
        "extended_concepts": extended_concepts,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--stage2-decisions", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.out_catalog, args.report)
    if not args.base_catalog.is_file() or not args.stage2_decisions.is_file():
        print("基础目录或阶段二决定不存在", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有目录或合并报告", file=sys.stderr)
        return 2
    try:
        base = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        decisions = json.loads(args.stage2_decisions.read_text(encoding="utf-8"))
        catalog, report = integrate_catalog(base, decisions, args.catalog_version)
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"阶段二目录合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
