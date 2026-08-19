#!/usr/bin/env python3
"""从上一版审核产物派生新目录版本的覆盖、来源选择和安全审核快照。"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--aggregation-report", type=Path, required=True)
    parser.add_argument("--previous-coverage", type=Path, required=True)
    parser.add_argument("--previous-selection", type=Path, required=True)
    parser.add_argument("--previous-review", type=Path, required=True)
    parser.add_argument("--out-coverage", type=Path, required=True)
    parser.add_argument("--out-selection", type=Path, required=True)
    parser.add_argument("--out-review", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare(args: argparse.Namespace) -> dict[str, Any]:
    catalog = load_json(args.catalog)
    aggregation = load_json(args.aggregation_report)
    previous_coverage = load_json(args.previous_coverage)
    previous_selection = load_json(args.previous_selection)
    previous_review = load_json(args.previous_review)
    catalog_version = str(catalog["catalog_version"])
    concept_ids = {str(item["concept_id"]) for item in catalog["items"]}

    coverage = deepcopy(previous_coverage)
    coverage["catalog_version"] = catalog_version
    coverage["selection_aggregation"] = aggregation
    coverage["selection_aggregation_removed_concept_count"] = int(
        aggregation["removed_concept_count"]
    )

    selection = deepcopy(previous_selection)
    selection["catalog_version"] = catalog_version
    selection["items"] = [
        item for item in selection.get("items", [])
        if str(item.get("concept_id", "")) in concept_ids
    ]
    selection["concept_count"] = len(selection["items"])
    selection["selected_source_count"] = len(selection["items"])
    selection["selection_aggregation"] = {
        "contract": aggregation["contract"],
        "base_catalog_version": aggregation["base_catalog_version"],
        "removed_concept_count": aggregation["removed_concept_count"],
    }

    review = deepcopy(previous_review)
    review["catalog_version"] = catalog_version
    review["items"] = [
        item for item in review.get("items", [])
        if str(item.get("concept_id", "")) in concept_ids
    ]
    review["migration"] = {
        "previous_catalog_version": str(previous_review.get("catalog_version", "")),
        "removed_concept_count": int(aggregation["removed_concept_count"]),
        "rule": "只保留目标目录中的待审核概念；上一版目录整理下线的概念不再进入新版本策略队列。",
    }

    write_json(args.out_coverage, coverage)
    write_json(args.out_selection, selection)
    write_json(args.out_review, review)
    return {
        "catalog_version": catalog_version,
        "coverage_selection_items": len(selection["items"]),
        "review_items": len(review["items"]),
        "removed_concept_count": aggregation["removed_concept_count"],
    }


def main() -> int:
    args = parse_args()
    try:
        print(json.dumps(prepare(args), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"审核产物准备失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
