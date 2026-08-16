#!/usr/bin/env python3
"""按受控规则拆分粉条与粉丝目录身份，并绑定指定营养来源。"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from copy import deepcopy
from pathlib import Path
from typing import Any

from seed_ingredient_catalog import validate_seed_shape


POLICY_ID = "starchNoodleCatalogIntegration/v1"
CFCT_SOURCE_VERSION = "cfct_6th_ocr_2025_12_06"
CFCT_FDC_ID = 22203
USDA_SOURCE_VERSION = "sr_legacy_2018_04"
USDA_FDC_ID = 169884
SWEET_POTATO_TERMS = ("红薯", "地瓜", "甘薯", "番薯", "蕃薯", "山芋")
CFCT_ALIASES = (
    "红薯粉条",
    "纯红薯粉条",
    "地瓜粉条",
    "甘薯粉条",
    "番薯粉条",
    "蕃薯粉条",
    "山芋粉条",
    "红薯粉丝",
    "地瓜粉丝",
    "甘薯粉丝",
    "番薯粉丝",
    "蕃薯粉丝",
    "山芋粉丝",
    "干粉条",
    "粗粉条",
    "宽粉条",
    "碎粉条",
)
USDA_ALIASES = (
    "干粉丝",
    "细粉丝",
    "粗粉丝",
    "宽粉丝",
    "绿豆粉丝",
    "豌豆粉丝",
    "龙口粉丝",
    "水晶粉丝",
    "魔芋粉丝",
    "蕨根粉丝",
    "荞麦粉丝",
    "白粉丝",
)


def normalized_alias(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def source_key(item: dict[str, Any]) -> tuple[str, int]:
    variant = item["variants"][0]
    return str(variant["source_version"]), int(variant["fdc_id"])


def unique_source_owner(
    items: list[dict[str, Any]], source_version: str, fdc_id: int
) -> dict[str, Any]:
    owners = [item for item in items if source_key(item) == (source_version, fdc_id)]
    if len(owners) != 1:
        raise ValueError(
            f"营养来源必须恰好已有一个目录所有者：{source_version}/{fdc_id}"
        )
    return owners[0]


def belongs_to_cfct(alias: str) -> bool:
    value = normalized_alias(alias)
    if "粉条" in value:
        return True
    return "粉丝" in value and any(term in value for term in SWEET_POTATO_TERMS)


def append_unique_aliases(item: dict[str, Any], values: tuple[str, ...]) -> int:
    aliases = list(item.get("aliases", []))
    occupied = {
        normalized_alias(str(value))
        for value in [item["canonical_name_zh"], *aliases]
    }
    added = 0
    for value in values:
        normalized = normalized_alias(value)
        if normalized in occupied:
            continue
        aliases.append(value)
        occupied.add(normalized)
        added += 1
    item["aliases"] = aliases
    return added


def integrate_catalog(
    base: dict[str, Any], catalog_version: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    output = deepcopy(base)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    items = output["items"]
    vermicelli = unique_source_owner(items, USDA_SOURCE_VERSION, USDA_FDC_ID)

    removed_aliases: list[dict[str, str]] = []
    for item in items:
        retained = []
        for alias in item.get("aliases", []):
            if belongs_to_cfct(str(alias)):
                removed_aliases.append(
                    {
                        "alias": str(alias),
                        "previous_concept_id": str(item["concept_id"]),
                    }
                )
            else:
                retained.append(alias)
        item["aliases"] = retained

    usda_added_alias_count = append_unique_aliases(vermicelli, USDA_ALIASES)
    concept_id = "ingredient_cfct_starch_noodle_22203"
    if any(str(item["concept_id"]) == concept_id for item in items):
        raise ValueError(f"目标粉条概念已存在：{concept_id}")
    starch_noodle = {
        "concept_id": concept_id,
        "canonical_name_zh": "粉条",
        "category_code": "carb",
        "subcategory_code": "starch_noodle",
        "aliases": list(CFCT_ALIASES),
        "variants": [
            {
                "variant_id": "variant_cfct_starch_noodle_22203",
                "display_name_zh": "粉条（来源状态未注明）",
                "preparation_state": "unspecified",
                "source_version": CFCT_SOURCE_VERSION,
                "fdc_id": CFCT_FDC_ID,
                "description_contains": "粉条",
                "is_default": True,
            }
        ],
    }
    items.append(starch_noodle)
    items.sort(key=lambda item: str(item["concept_id"]))
    output["starch_noodle_integration"] = {
        "policy_id": POLICY_ID,
        "base_catalog_version": str(base["catalog_version"]),
        "cfct_starch_noodle": {
            "concept_id": concept_id,
            "source_version": CFCT_SOURCE_VERSION,
            "fdc_id": CFCT_FDC_ID,
        },
        "usda_vermicelli": {
            "concept_id": str(vermicelli["concept_id"]),
            "source_version": USDA_SOURCE_VERSION,
            "fdc_id": USDA_FDC_ID,
        },
    }
    validate_seed_shape(output)
    report = {
        "report_contract": "starchNoodleCatalogIntegrationReport/v1",
        "policy_id": POLICY_ID,
        "base_catalog_version": str(base["catalog_version"]),
        "catalog_version": catalog_version,
        "concept_count": len(items),
        "added_concept_count": 1,
        "removed_aliases": removed_aliases,
        "cfct_alias_count": len(starch_noodle["aliases"]),
        "usda_added_alias_count": usda_added_alias_count,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.base_catalog.is_file():
        print(f"基础目录不存在：{args.base_catalog}", file=sys.stderr)
        return 2
    if args.out_catalog.exists() or args.report.exists():
        print("拒绝覆盖已有粉条目录产物", file=sys.stderr)
        return 2
    try:
        base = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        catalog, report = integrate_catalog(base, args.catalog_version)
        args.out_catalog.parent.mkdir(parents=True, exist_ok=True)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out_catalog.unlink(missing_ok=True)
        args.report.unlink(missing_ok=True)
        print(f"粉条目录整合失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
