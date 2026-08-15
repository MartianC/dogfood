#!/usr/bin/env python3
"""为全部 CFCT 精确来源候选生成确定性决定和受控模型批次。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from seed_ingredient_catalog import normalize_alias


POLICY_ID = "cfctExactIdentityPreparation/v1"
INPUT_CONTRACT = "recipeIngredientGapClassification/v1"
NATURAL_CATEGORY_PATTERN = re.compile(r"谷类|薯类|干豆类|蔬菜类|菌藻类|水果类|坚果|畜肉类|禽肉类|鱼虾蟹贝类|蛋类")
REVIEW_PATTERN = re.compile(
    r"熟|煮|烤|蒸|炸|冷冻|冻|干|咸|腌|熏|馅|肠|叉烧|烤麸|素鸡|阿胶|蟹足棒|蟹棒|饼|片$|粉$|面$|罐头"
)


def category_code(category: str) -> str | None:
    rules = (
        ("蛋类", "egg"), ("奶类", "dairy"), ("畜肉类", "meat"), ("禽肉类", "meat"),
        ("鱼虾蟹贝类-鱼", "fish"), ("鱼虾蟹贝类", "seafood"),
        ("水果类", "fruit"), ("蔬菜类", "vegetable"), ("菌藻类", "vegetable"),
        ("干豆类", "legume"), ("坚果", "legume"), ("谷类", "carb"), ("薯类", "carb"),
    )
    return next((code for prefix, code in rules if prefix in category), None)


def catalog_candidates(catalog: dict[str, Any], name: str, category: str | None) -> list[dict[str, Any]]:
    key = normalize_alias(name)
    values = []
    for item in catalog.get("items", []):
        if category and str(item.get("category_code")) != category:
            continue
        names = [str(item["canonical_name_zh"]), *(str(value) for value in item.get("aliases", []))]
        score = max(SequenceMatcher(None, key, normalize_alias(value)).ratio() for value in names)
        contains = any(key in normalize_alias(value) or normalize_alias(value) in key for value in names)
        if score >= 0.5 or contains:
            values.append({
                "choice_id": f"concept:{item['concept_id']}",
                "concept_id": item["concept_id"],
                "canonical_name_zh": item["canonical_name_zh"],
                "matched_names": names[:8],
                "similarity": round(score, 4),
            })
    return sorted(values, key=lambda value: (-float(value["similarity"]), str(value["canonical_name_zh"])))[:5]


def source_rows(conn: sqlite3.Connection, name: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.source_version,x.fdc_id,x.food_code,x.original_name,x.category,
               x.edible_raw,x.remark,x.data_quality,COUNT(n.source_record_id)
        FROM source_localized_name l
        JOIN source_release r ON r.release_id=l.source_release_id
        JOIN source_cfct_food x ON x.source_release_id=l.source_release_id AND x.fdc_id=l.fdc_id
        LEFT JOIN source_food_nutrient n ON n.source_release_id=x.source_release_id AND n.fdc_id=x.fdc_id
        WHERE l.locale='zh-CN' AND l.name=?
        GROUP BY r.source_version,x.fdc_id,x.food_code,x.original_name,x.category,
                 x.edible_raw,x.remark,x.data_quality
        ORDER BY x.food_code,x.fdc_id
        """,
        (name,),
    ).fetchall()
    return [{
        "choice_id": f"source:{int(row[1])}", "source_version": str(row[0]),
        "fdc_id": int(row[1]), "food_code": str(row[2]), "original_name": str(row[3]),
        "category": str(row[4]), "category_code": category_code(str(row[4])),
        "edible_raw": str(row[5]), "remark": row[6], "data_quality": str(row[7]),
        "nutrient_count": int(row[8]),
    } for row in rows]


def prepare(
    conn: sqlite3.Connection, classification: dict[str, Any], catalog: dict[str, Any], batch_size: int
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    if classification.get("contract") != INPUT_CONTRACT:
        raise ValueError("CFCT 精确候选分类合同不匹配")
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in classification.get("items", []):
        if item.get("category") == "cfct_exact_candidate":
            grouped[str(item["cleaned_name"])].append(item)
    source_owners = {
        (str(version), int(fdc_id)): str(concept_id)
        for version, fdc_id, concept_id in conn.execute(
            """SELECT r.source_version,v.source_food_id,v.concept_id
               FROM ingredient_variant v JOIN source_release r ON r.release_id=v.source_release_id"""
        )
    }
    groups = []
    automatic = []
    model_items = []
    for name, terms in grouped.items():
        sources = source_rows(conn, name)
        if not sources:
            raise ValueError(f"CFCT 精确候选没有来源：{name}")
        category = sources[0].get("category_code") if len({s.get("category_code") for s in sources}) == 1 else None
        concepts = catalog_candidates(catalog, name, category)
        record = {
            "cleaned_name": name,
            "occurrence_count": sum(int(item["occurrence_count"]) for item in terms),
            "source_terms": [{"normalized_name": item["normalized_name"], "occurrence_count": int(item["occurrence_count"])} for item in terms],
            "source_candidates": sources,
            "concept_candidates": concepts,
        }
        groups.append(record)
        occupied = [source_owners.get((s["source_version"], s["fdc_id"])) for s in sources]
        occupied = [value for value in occupied if value]
        original_exact = len(sources) == 1 and normalize_alias(sources[0]["original_name"]) == normalize_alias(name)
        auto_natural = (
            len(sources) == 1 and not concepts and original_exact
            and bool(NATURAL_CATEGORY_PATTERN.search(sources[0]["category"]))
            and not REVIEW_PATTERN.search(name) and sources[0]["nutrient_count"] > 0
            and sources[0]["category_code"] is not None
        )
        if len(set(occupied)) == 1 and occupied:
            automatic.append({"cleaned_name": name, "decision": f"concept:{occupied[0]}", "method": "source_already_owned"})
        elif auto_natural:
            automatic.append({"cleaned_name": name, "decision": sources[0]["choice_id"], "method": "unique_natural_exact_source"})
        else:
            model_items.append(record)
    groups.sort(key=lambda value: (-int(value["occurrence_count"]), str(value["cleaned_name"])))
    automatic.sort(key=lambda value: str(value["cleaned_name"]))
    model_items.sort(key=lambda value: (-int(value["occurrence_count"]), str(value["cleaned_name"])))
    batches = [{"batch_id": f"cfct_exact_{i // batch_size + 1:04d}", "contract": "cfctExactIdentityModelBatch/v1", "items": model_items[i:i + batch_size]} for i in range(0, len(model_items), batch_size)]
    candidate_document = {"contract": "cfctExactIdentityCandidates/v1", "policy_id": POLICY_ID, "items": groups}
    automatic_document = {"contract": "cfctExactIdentityAutomaticDecisions/v1", "policy_id": POLICY_ID, "items": automatic}
    report = {
        "report_contract": "cfctExactIdentityPreparationReport/v1", "policy_id": POLICY_ID,
        "input_term_count": sum(len(value) for value in grouped.values()),
        "input_occurrence_count": sum(int(item["occurrence_count"]) for values in grouped.values() for item in values),
        "identity_group_count": len(groups), "automatic_group_count": len(automatic),
        "model_group_count": len(model_items), "model_batch_count": len(batches),
    }
    return candidate_document, automatic_document, batches, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--classification", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=10)
    args = parser.parse_args()
    if args.out_dir.exists() or args.batch_size <= 0:
        print("拒绝覆盖 CFCT 精确身份准备目录，且批次大小必须大于0", file=sys.stderr); return 2
    try:
        classification = json.loads(args.classification.read_text(encoding="utf-8"))
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        with sqlite3.connect(args.sqlite) as conn:
            candidates, automatic, batches, report = prepare(conn, classification, catalog, args.batch_size)
        args.out_dir.mkdir(parents=True)
        docs = {"candidates.json": candidates, "automatic-decisions.json": automatic}
        report["artifact_sha256"] = {}
        for name, value in docs.items():
            content = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
            (args.out_dir / name).write_bytes(content); report["artifact_sha256"][name] = hashlib.sha256(content).hexdigest()
        (args.out_dir / "model-batches.jsonl").write_text("".join(json.dumps(value, ensure_ascii=False) + "\n" for value in batches), encoding="utf-8")
        (args.out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2)); return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"CFCT 精确身份准备失败：{error}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
