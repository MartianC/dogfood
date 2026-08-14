#!/usr/bin/env python3
"""把受控别名和裸词默认决定合并为新的完整标准食材目录。"""

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


CONTRACT = "controlledIngredientIdentityDecisions/v1"
POLICY_ID = "controlledIngredientIdentityIntegration/v1"


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def resolve_source(conn: sqlite3.Connection, entry: dict[str, Any]) -> tuple[str, int, str]:
    source_version = str(entry.get("source_version", "")).strip()
    fdc_id = int(entry.get("fdc_id", 0))
    expected = str(entry.get("description_contains", "")).strip()
    if not source_version or fdc_id <= 0 or not expected:
        raise ValueError(f"受控新概念缺少显式来源：{entry.get('canonical_name_zh')}")
    rows = conn.execute(
        """
        SELECT f.description, COUNT(n.source_record_id)
        FROM source_release r
        JOIN source_food f ON f.source_release_id=r.release_id
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id=f.source_release_id AND n.fdc_id=f.fdc_id
        WHERE r.source_version=? AND f.fdc_id=?
        GROUP BY f.description
        """,
        (source_version, fdc_id),
    ).fetchall()
    if len(rows) != 1:
        raise ValueError(f"受控新概念来源不唯一：{source_version}/{fdc_id}")
    description, nutrient_count = str(rows[0][0]), int(rows[0][1])
    if expected not in description or nutrient_count <= 0:
        raise ValueError(f"受控新概念来源描述或营养明细不匹配：{source_version}/{fdc_id}")
    return source_version, fdc_id, description


def integrate(
    base: dict[str, Any], decisions: dict[str, Any], catalog_version: str,
    conn: sqlite3.Connection | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if decisions.get("contract") != CONTRACT:
        raise ValueError("受控身份决定合同不匹配")
    output = deepcopy(base)
    output["catalog_version"] = catalog_version
    output["controlled_identity_integration"] = {
        "policy_id": POLICY_ID,
        "decision_version": decisions.get("decision_version"),
        "rule": "目录别名可直接匹配；裸词默认仅由同版本规范化规则对完整词生效",
    }
    items = output.get("items", [])
    concepts = {str(item["concept_id"]): item for item in items}
    alias_owners: dict[str, str] = {}
    source_owners: set[tuple[str, int]] = set()
    for item in items:
        concept_id = str(item["concept_id"])
        for value in [item["canonical_name_zh"], *item.get("aliases", [])]:
            key = normalize_alias(str(value))
            owner = alias_owners.get(key)
            if owner and owner != concept_id:
                raise ValueError(f"基础目录存在跨概念别名冲突：{value}")
            alias_owners[key] = concept_id
        for variant in item.get("variants", []):
            source_key = (str(variant["source_version"]), int(variant["fdc_id"]))
            if source_key in source_owners:
                raise ValueError(f"基础目录存在重复营养来源：{source_key}")
            source_owners.add(source_key)

    seen_terms: set[str] = set()
    added_aliases: list[dict[str, str]] = []
    bare_defaults: list[dict[str, str]] = []
    for section, result in (
        ("catalog_aliases", added_aliases),
        ("bare_defaults", bare_defaults),
    ):
        for entry in decisions.get(section, []):
            concept_id = str(entry.get("concept_id", ""))
            concept = concepts.get(concept_id)
            if not concept:
                raise ValueError(f"受控身份目标概念不存在：{concept_id}")
            if len(concept.get("variants", [])) != 1:
                raise ValueError(f"受控身份目标概念不是唯一来源：{concept_id}")
            for raw_term in entry.get("terms", []):
                term = str(raw_term).strip()
                key = normalize_alias(term)
                if not term or key in seen_terms:
                    raise ValueError(f"受控身份词条为空或重复：{term!r}")
                seen_terms.add(key)
                owner = alias_owners.get(key)
                if owner and owner != concept_id:
                    raise ValueError(f"受控身份词条跨概念冲突：{term} -> {owner}")
                result.append({"term": term, "concept_id": concept_id})
                if section == "catalog_aliases":
                    if term != concept["canonical_name_zh"] and term not in concept.setdefault("aliases", []):
                        concept["aliases"].append(term)
                    alias_owners[key] = concept_id

    new_concepts: list[dict[str, Any]] = []
    if decisions.get("new_concepts") and conn is None:
        raise ValueError("受控新概念合并必须提供 SQLite 来源库")
    for entry in decisions.get("new_concepts", []):
        canonical = str(entry.get("canonical_name_zh", "")).strip()
        category = str(entry.get("category_code", "")).strip()
        aliases = sorted({str(value).strip() for value in entry.get("aliases", []) if str(value).strip()})
        if not canonical or not category:
            raise ValueError("受控新概念缺少标准名或分类")
        concept_id = str(entry.get("concept_id") or stable_id("ingredient_controlled", canonical))
        if concept_id in concepts:
            raise ValueError(f"受控新概念 ID 已存在：{concept_id}")
        for value in [canonical, *aliases]:
            key = normalize_alias(value)
            if key in alias_owners or key in seen_terms:
                raise ValueError(f"受控新概念名称冲突：{value}")
            seen_terms.add(key)
        assert conn is not None
        source_version, fdc_id, description = resolve_source(conn, entry)
        source_key = (source_version, fdc_id)
        if source_key in source_owners:
            raise ValueError(f"受控新概念来源已被占用：{source_key}")
        preparation = str(entry.get("preparation_state", "unspecified")).strip()
        item = {
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "category_code": category,
            "subcategory_code": None,
            "aliases": aliases,
            "variants": [{
                "variant_id": stable_id("variant_controlled", f"{concept_id}|{source_version}|{fdc_id}"),
                "display_name_zh": f"{canonical}（{preparation}）",
                "preparation_state": preparation,
                "source_version": source_version,
                "fdc_id": fdc_id,
                "description_contains": str(entry["description_contains"]),
                "is_default": True,
            }],
        }
        items.append(item)
        concepts[concept_id] = item
        source_owners.add(source_key)
        for value in [canonical, *aliases]:
            alias_owners[normalize_alias(value)] = concept_id
        new_concepts.append({
            "concept_id": concept_id,
            "canonical_name_zh": canonical,
            "aliases": aliases,
            "source_version": source_version,
            "fdc_id": fdc_id,
            "source_description": description,
        })

    for item in items:
        item["aliases"] = sorted(set(item.get("aliases", [])))
    items.sort(key=lambda item: str(item["concept_id"]))
    validate_seed_shape(output)
    report = {
        "report_contract": "controlledIngredientIdentityIntegrationReport/v1",
        "policy_id": POLICY_ID,
        "decision_version": decisions.get("decision_version"),
        "catalog_version": catalog_version,
        "base_concept_count": len(base.get("items", [])),
        "final_concept_count": len(items),
        "added_concept_count": len(new_concepts),
        "added_alias_count": len(added_aliases),
        "bare_default_count": len(bare_defaults),
        "added_aliases": added_aliases,
        "bare_defaults": bare_defaults,
        "added_concepts": new_concepts,
    }
    return output, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--sqlite", type=Path)
    parser.add_argument("--decisions", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    targets = (args.out_catalog, args.report)
    if not args.base_catalog.is_file() or not args.decisions.is_file():
        print("受控身份合并输入不完整", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有受控身份目录或报告", file=sys.stderr)
        return 2
    try:
        base = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        decisions = json.loads(args.decisions.read_text(encoding="utf-8"))
        if args.sqlite and not args.sqlite.is_file():
            raise ValueError("受控身份来源 SQLite 不存在")
        if args.sqlite:
            with sqlite3.connect(args.sqlite) as conn:
                catalog, report = integrate(base, decisions, args.catalog_version, conn)
        else:
            catalog, report = integrate(base, decisions, args.catalog_version)
        for path, value in ((args.out_catalog, catalog), (args.report, report)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"受控身份合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
