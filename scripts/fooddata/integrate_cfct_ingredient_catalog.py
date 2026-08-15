#!/usr/bin/env python3
"""把显式 CFCT 食品编码决定合并为新的完整标准食材目录。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from seed_ingredient_catalog import normalize_alias, validate_seed_shape


CONTRACT = "cfctIngredientCatalogDecisions/v1"
POLICY_ID = "cfctIngredientCatalogIntegration/v1"


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def integrate(conn: sqlite3.Connection, base: dict[str, Any], decisions: dict[str, Any], catalog_version: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if decisions.get("contract") != CONTRACT:
        raise ValueError("CFCT 目录决定合同不匹配")
    source_version = str(decisions.get("source_version", ""))
    output = deepcopy(base)
    output["catalog_version"] = catalog_version
    source_metadata = conn.execute(
        """
        SELECT DISTINCT license_status
        FROM source_release
        WHERE source_version=?
        """,
        (source_version,),
    ).fetchall()
    if len(source_metadata) != 1:
        raise ValueError("CFCT 来源发布状态必须唯一")
    source_license_status = str(source_metadata[0][0])
    if source_license_status not in {"needs_review", "verified"}:
        raise ValueError(f"CFCT 来源发布状态无效：{source_license_status}")
    output["cfct_integration"] = {
        "policy_id": POLICY_ID,
        "decision_version": decisions.get("decision_version"),
        "source_version": source_version,
        "license_status": source_license_status,
        "data_quality": "ocr_unverified",
    }
    items = output.get("items", [])
    aliases: dict[str, str] = {}
    sources: set[tuple[str, int]] = set()
    ids = {str(item["concept_id"]) for item in items}
    for item in items:
        for name in [item["canonical_name_zh"], *item.get("aliases", [])]:
            aliases[normalize_alias(str(name))] = str(item["concept_id"])
        for variant in item.get("variants", []):
            sources.add((str(variant["source_version"]), int(variant["fdc_id"])))

    added = []
    for entry in decisions.get("items", []):
        canonical = str(entry.get("canonical_name_zh", "")).strip()
        food_code = str(entry.get("food_code", "")).strip()
        expected_name = str(entry.get("expected_name", "")).strip()
        category = str(entry.get("category_code", "")).strip()
        preparation = str(entry.get("preparation_state", "")).strip()
        names = [canonical, *(str(value).strip() for value in entry.get("aliases", []))]
        if not all((canonical, food_code, expected_name, category, preparation)):
            raise ValueError("CFCT 决定缺少必填字段")
        rows = conn.execute(
            """
            SELECT r.release_id, x.fdc_id, x.original_name, x.data_quality,
                   r.license_status, COUNT(DISTINCT n.source_record_id)
            FROM source_release r
            JOIN source_cfct_food x ON x.source_release_id=r.release_id
            LEFT JOIN source_food_nutrient n
              ON n.source_release_id=x.source_release_id AND n.fdc_id=x.fdc_id
            WHERE r.source_version=? AND x.food_code=?
            GROUP BY r.release_id,x.fdc_id,x.original_name,x.data_quality,r.license_status
            """,
            (source_version, food_code),
        ).fetchall()
        if len(rows) != 1:
            raise ValueError(f"CFCT 来源必须唯一：{food_code}")
        _release_id, fdc_id, original_name, quality, license_status, nutrient_count = rows[0]
        if (
            str(original_name) != expected_name
            or quality != "ocr_unverified"
            or license_status != source_license_status
        ):
            raise ValueError(f"CFCT 来源元数据不匹配：{food_code}")
        if int(nutrient_count) <= 0:
            raise ValueError(f"CFCT 来源没有可计算营养值：{food_code}")
        source_key = (source_version, int(fdc_id))
        if source_key in sources:
            raise ValueError(f"CFCT 来源已被占用：{food_code}")
        concept_id = stable_id("ingredient_cfct", canonical)
        if concept_id in ids:
            raise ValueError(f"CFCT 概念已存在：{canonical}")
        for name in names:
            owner = aliases.get(normalize_alias(name))
            if owner:
                raise ValueError(f"CFCT 名称已属于其他概念：{name} -> {owner}")
        variant = {
            "variant_id": stable_id("variant_cfct", f"{concept_id}|{source_version}|{fdc_id}"),
            "display_name_zh": f"{canonical}（CFCT OCR：{preparation}）",
            "preparation_state": preparation,
            "source_version": source_version,
            "fdc_id": int(fdc_id),
            "description_contains": expected_name,
            "is_default": True,
        }
        item = {
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "category_code": category,
            "subcategory_code": None,
            "aliases": sorted({name for name in names if name != canonical}),
            "variants": [variant],
        }
        items.append(item)
        ids.add(concept_id)
        sources.add(source_key)
        for name in names:
            aliases[normalize_alias(name)] = concept_id
        added.append({
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "food_code": food_code,
            "source_food_id": int(fdc_id),
            "source_name": expected_name,
            "nutrient_count": int(nutrient_count),
            "aliases": item["aliases"],
        })
    items.sort(key=lambda item: str(item["concept_id"]))
    validate_seed_shape(output)
    report = {
        "report_contract": "cfctIngredientCatalogIntegrationReport/v1",
        "policy_id": POLICY_ID,
        "decision_version": decisions.get("decision_version"),
        "source_version": source_version,
        "catalog_version": catalog_version,
        "base_concept_count": len(base.get("items", [])),
        "final_concept_count": len(items),
        "added_concept_count": len(added),
        "added_alias_count": sum(len(item["aliases"]) for item in added),
        "license_status": source_license_status,
        "data_quality": "ocr_unverified",
        "added_concepts": added,
    }
    return output, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--decisions", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if any(path.exists() for path in (args.out_catalog, args.report)):
        print("拒绝覆盖已有 CFCT 目录产物", file=sys.stderr)
        return 2
    try:
        base = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        decisions = json.loads(args.decisions.read_text(encoding="utf-8"))
        with sqlite3.connect(args.sqlite) as conn:
            catalog, report = integrate(conn, base, decisions, args.catalog_version)
        for path, value in ((args.out_catalog, catalog), (args.report, report)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        for path in (args.out_catalog, args.report):
            path.unlink(missing_ok=True)
        print(f"CFCT 目录合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
