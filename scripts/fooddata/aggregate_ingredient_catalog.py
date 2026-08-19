#!/usr/bin/env python3
"""按产品选择范围聚合标准食材目录，生成新的完整目录快照和差异报告。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


CONTRACT = "ingredientCatalogSelectionAggregation/v1"

GROUPS = (
    {
        "group_id": "flour_and_wheat_flour",
        "label_zh": "面粉/麦粉",
        "category_code": "carb",
        "name_pattern": re.compile(
            r"(?:面粉|小麦粉|全麦粉|麦粉|粗面粉|粗麦粉|杜兰|斯佩尔特)"
        ),
        "representative_concept_ids": (
            "ingredient_auto_model_21eaff4331362c33",
            "ingredient_auto_model_f90d535503573e75",
        ),
        "rule_zh": "同一选择族只保留普通面粉和全麦面粉；其他来源身份不重写为代表项。",
    },
    {
        "group_id": "cheese",
        "label_zh": "奶酪",
        "category_code": "dairy",
        "name_pattern": re.compile(r"(?:奶酪|芝士|乳酪|干酪)"),
        "representative_concept_ids": (
            "ingredient_auto_667e81096d909865",
            "ingredient_auto_model_c53f731e04c2ac9e",
        ),
        "rule_zh": "奶酪选择族只保留切达奶酪和马苏里拉奶酪；其他奶酪身份不重写为代表项。",
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--out-report", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def item_text(item: dict[str, Any]) -> str:
    return "|".join(
        str(value)
        for value in [item.get("canonical_name_zh"), *item.get("aliases", [])]
        if value
    )


def group_for_item(item: dict[str, Any]) -> dict[str, Any] | None:
    category = str(item.get("category_code", ""))
    text = item_text(item)
    for group in GROUPS:
        if category == group["category_code"] and group["name_pattern"].search(text):
            return group
    return None


def validate_base_catalog(catalog: dict[str, Any]) -> None:
    if not str(catalog.get("catalog_version", "")).strip():
        raise ValueError("基础目录缺少 catalog_version")
    items = catalog.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("基础目录 items 必须是非空数组")
    ids = [str(item.get("concept_id", "")) for item in items]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("基础目录 concept_id 缺失或重复")
    by_id = {str(item["concept_id"]): item for item in items}
    for group in GROUPS:
        for concept_id in group["representative_concept_ids"]:
            item = by_id.get(concept_id)
            if not item:
                raise ValueError(f"聚合代表项不在基础目录：{concept_id}")
            if item.get("category_code") != group["category_code"]:
                raise ValueError(f"聚合代表项分类不匹配：{concept_id}")
            if not group["name_pattern"].search(item_text(item)):
                raise ValueError(f"聚合代表项不满足名称规则：{concept_id}")


def aggregate(
    base_catalog: dict[str, Any], catalog_version: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    validate_base_catalog(base_catalog)
    representative_ids = {
        concept_id
        for group in GROUPS
        for concept_id in group["representative_concept_ids"]
    }
    output = deepcopy(base_catalog)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["selection_aggregation"] = {
        "contract": CONTRACT,
        "base_catalog_version": str(base_catalog["catalog_version"]),
        "rule": "按产品选择族聚合重复标准食材；非代表概念不重定向为营养上不等价的代表项。",
        "groups": [
            {
                "group_id": group["group_id"],
                "label_zh": group["label_zh"],
                "category_code": group["category_code"],
                "representative_concept_ids": list(group["representative_concept_ids"]),
                "rule_zh": group["rule_zh"],
            }
            for group in GROUPS
        ],
    }

    removed: list[dict[str, Any]] = []
    kept: list[dict[str, Any]] = []
    group_stats: list[dict[str, Any]] = []
    for group in GROUPS:
        matched = []
        group_ids = set(group["representative_concept_ids"])
        for item in base_catalog["items"]:
            if group_for_item(item) is group:
                matched.append(item)
        group_removed = [item for item in matched if item["concept_id"] not in group_ids]
        group_stats.append(
            {
                "group_id": group["group_id"],
                "label_zh": group["label_zh"],
                "before_count": len(matched),
                "retained_count": len(matched) - len(group_removed),
                "removed_count": len(group_removed),
                "representative_concept_ids": list(group["representative_concept_ids"]),
                "removed_concepts": [
                    {
                        "concept_id": str(item["concept_id"]),
                        "canonical_name_zh": str(item["canonical_name_zh"]),
                        "variant_ids": [
                            str(variant["variant_id"])
                            for variant in item.get("variants", [])
                        ],
                        "reason": "selection_catalog_aggregation",
                    }
                    for item in group_removed
                ],
            }
        )

    for item in base_catalog["items"]:
        group = group_for_item(item)
        if group and str(item["concept_id"]) not in set(group["representative_concept_ids"]):
            removed.append(
                {
                    "concept_id": str(item["concept_id"]),
                    "canonical_name_zh": str(item["canonical_name_zh"]),
                    "group_id": group["group_id"],
                    "reason": "selection_catalog_aggregation",
                }
            )
            continue
        kept.append(item)

    output["items"] = kept
    output["selection_aggregation"]["removed_concept_ids"] = [
        item["concept_id"] for item in removed
    ]
    output["selection_aggregation"]["removed_concepts"] = removed

    integration = deepcopy(output.get("complete_usda_integration", {}))
    integration["selection_aggregation_contract"] = CONTRACT
    integration["selection_aggregation_base_catalog_version"] = str(
        base_catalog["catalog_version"]
    )
    integration["selection_aggregation_removed_concepts"] = [
        item["concept_id"] for item in removed
    ]
    output["complete_usda_integration"] = integration

    report = {
        "contract": CONTRACT,
        "catalog_version": catalog_version,
        "base_catalog_version": str(base_catalog["catalog_version"]),
        "base_concept_count": len(base_catalog["items"]),
        "catalog_concept_count": len(output["items"]),
        "removed_concept_count": len(removed),
        "representative_concept_ids": sorted(representative_ids),
        "groups": group_stats,
        "removed_concepts": removed,
        "removed_concept_policy": "不建立营养身份重定向；阶段一映射中的旧概念进入 isolated，历史记录保留旧版本回滚能力。",
    }
    return output, report


def main() -> int:
    args = parse_args()
    try:
        base_catalog = load_json(args.base_catalog)
        catalog, report = aggregate(base_catalog, args.catalog_version)
        args.out_catalog.parent.mkdir(parents=True, exist_ok=True)
        args.out_report.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        args.out_report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        args.out_catalog.unlink(missing_ok=True)
        args.out_report.unlink(missing_ok=True)
        print(f"目录聚合失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
