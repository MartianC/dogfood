#!/usr/bin/env python3
"""为每个标准食材自动选择唯一的烹调基准营养来源。"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


POLICY_ID = "readyToCookNutritionSource/v1"
PREPARATION_PRIORITY = {
    "raw": 0,
    "fresh": 0,
    "dry": 1,
    "dried": 1,
    "oil": 1,
    "frozen": 2,
    "unspecified": 3,
    "boiled": 4,
    "simmered": 4,
    "braised": 4,
    "cooked": 4,
    "fermented": 5,
    "fresh_cheese": 5,
    "canned": 6,
}
SOURCE_PRIORITY = {
    "foundation": 0,
    "sr_legacy_2018_04": 1,
}
PROCESSED_TERMS = (
    "seasoned",
    "salted",
    "with salt",
    "smoked",
    "cured",
    "breaded",
    "fried",
    "with sauce",
    "ready-to-eat",
    "restaurant",
    "sweetened",
    "syrup",
    "juice",
    "prepared",
    "with added solution",
    "added solution",
    "with added vitamin",
    "vanilla",
    "chocolate",
    "chai",
    "coffee",
    "mocha",
    "nog",
    "all flavors",
    "original",
)
BONE_POSITIVE_TERMS = ("boneless", "meat only")
BONE_NEGATIVE_TERMS = ("with bone", "bone-in", "including bone")
SKIN_POSITIVE_TERMS = ("skinless", "without skin")
SKIN_NEGATIVE_TERMS = ("with skin", "skin on")
PEEL_POSITIVE_TERMS = ("peeled", "without peel")
PEEL_NEGATIVE_TERMS = ("with peel", "unpeeled")


def text_rank(description: str, positive: tuple[str, ...], negative: tuple[str, ...]) -> int:
    normalized = description.lower()
    if any(term in normalized for term in positive):
        return 0
    if any(term in normalized for term in negative):
        return 2
    return 1


def resolve_candidate(
    conn: sqlite3.Connection,
    candidate: dict[str, Any],
) -> dict[str, Any]:
    source_version = str(candidate.get("source_version", "")).strip()
    fdc_id = int(candidate["fdc_id"])
    rows = conn.execute(
        """
        SELECT r.release_id, f.description,
               COUNT(n.source_record_id) AS nutrient_count
        FROM source_release r
        JOIN source_food f ON f.source_release_id = r.release_id
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id = f.source_release_id
         AND n.fdc_id = f.fdc_id
        WHERE r.source_version = ? AND f.fdc_id = ?
        GROUP BY r.release_id, f.description
        """,
        (source_version, fdc_id),
    ).fetchall()
    if len(rows) != 1:
        raise ValueError(
            "营养候选必须唯一存在："
            f"source_version={source_version}, fdc_id={fdc_id}"
        )
    source_release_id, description, nutrient_count = rows[0]
    if int(nutrient_count) <= 0:
        raise ValueError(f"营养候选没有营养明细：fdc_id={fdc_id}")
    expected = str(candidate.get("description_contains", ""))
    if expected and expected not in str(description):
        raise ValueError(
            f"营养候选描述不匹配：fdc_id={fdc_id}，"
            f"期望包含 {expected!r}，实际为 {description!r}"
        )
    result = deepcopy(candidate)
    result["source_release_id"] = str(source_release_id)
    result["source_description"] = str(description)
    result["nutrient_count"] = int(nutrient_count)
    return result


def candidate_score(candidate: dict[str, Any]) -> tuple[Any, ...]:
    description = str(candidate["source_description"])
    normalized = description.lower()
    preparation = str(candidate.get("preparation_state") or "unspecified").lower()
    handling = " ".join(
        [
            description,
            str(candidate.get("part_or_cut") or ""),
            str(candidate.get("skin_bone_state") or ""),
        ]
    )
    explicitly_sweetened = bool(
        re.search(r"\b(?:sweetened|syrup|sugar added|with sugar)\b", normalized)
    ) and "unsweetened" not in normalized
    return (
        sum(
            bool(re.search(rf"(?<![a-z]){re.escape(term)}(?![a-z])", normalized))
            for term in PROCESSED_TERMS
        ),
        1 if explicitly_sweetened else 0,
        PREPARATION_PRIORITY.get(preparation, 7),
        text_rank(handling, BONE_POSITIVE_TERMS, BONE_NEGATIVE_TERMS),
        text_rank(handling, SKIN_POSITIVE_TERMS, SKIN_NEGATIVE_TERMS),
        text_rank(handling, PEEL_POSITIVE_TERMS, PEEL_NEGATIVE_TERMS),
        SOURCE_PRIORITY.get(str(candidate.get("source_version")), 9),
        -int(candidate["nutrient_count"]),
        0 if bool(candidate.get("is_default")) else 1,
        int(candidate["fdc_id"]),
        str(candidate.get("variant_id", "")),
    )


def score_explanation(candidate: dict[str, Any]) -> dict[str, Any]:
    score = candidate_score(candidate)
    return {
        "processed_penalty": score[0],
        "unsweetened_rank": score[1],
        "preparation_rank": score[2],
        "bone_rank": score[3],
        "skin_rank": score[4],
        "peel_rank": score[5],
        "source_rank": score[6],
        "nutrient_count": int(candidate["nutrient_count"]),
        "existing_default_tiebreaker": bool(candidate.get("is_default")),
        "fdc_id": int(candidate["fdc_id"]),
    }


def select_catalog(
    conn: sqlite3.Connection,
    seed: dict[str, Any],
    catalog_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(seed.get("items"), list) or not seed["items"]:
        raise ValueError("目录候选缺少 items")

    output = deepcopy(seed)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["selection_policy"] = {
        "policy_id": POLICY_ID,
        "priority": [
            "排除调味、腌制、油炸等已加工候选",
            "同类来源优先未加糖候选",
            "优先生鲜或未经烹调的候选",
            "优先去骨或纯肉候选",
            "优先去皮候选",
            "优先去外皮候选",
            "同等条件优先 Foundation",
            "同等条件优先营养明细更完整的候选",
            "最后使用既有默认标记和稳定 ID 破同分",
        ],
    }

    reports: list[dict[str, Any]] = []
    for item in output["items"]:
        candidates = item.get("nutrition_candidates", item.get("variants"))
        if not isinstance(candidates, list) or not candidates:
            raise ValueError(f"标准食材缺少营养候选：{item.get('concept_id')}")
        resolved = [resolve_candidate(conn, candidate) for candidate in candidates]
        ordered = sorted(resolved, key=candidate_score)
        selected = deepcopy(ordered[0])
        selected.pop("source_release_id", None)
        selected.pop("source_description", None)
        selected.pop("nutrient_count", None)
        selected["is_default"] = True
        item["variants"] = [selected]
        item.pop("nutrition_candidates", None)

        reports.append(
            {
                "concept_id": item["concept_id"],
                "canonical_name_zh": item["canonical_name_zh"],
                "candidate_count": len(ordered),
                "selected_variant_id": selected["variant_id"],
                "selected_source_version": selected["source_version"],
                "selected_fdc_id": int(selected["fdc_id"]),
                "selected_description": ordered[0]["source_description"],
                "selected_score": score_explanation(ordered[0]),
                "rejected_candidates": [
                    {
                        "variant_id": candidate["variant_id"],
                        "source_version": candidate["source_version"],
                        "fdc_id": int(candidate["fdc_id"]),
                        "description": candidate["source_description"],
                        "score": score_explanation(candidate),
                    }
                    for candidate in ordered[1:]
                ],
            }
        )

    report = {
        "report_contract": "standardIngredientSourceSelection/v1",
        "catalog_version": catalog_version,
        "selection_policy_id": POLICY_ID,
        "concept_count": len(reports),
        "selected_source_count": len(reports),
        "concepts_with_multiple_candidates": sum(
            item["candidate_count"] > 1 for item in reports
        ),
        "items": reports,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--candidate-seed", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-seed", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.out_seed, args.report)
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if not args.candidate_seed.is_file():
        print(f"目录候选不存在：{args.candidate_seed}", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有目录种子或选择报告", file=sys.stderr)
        return 2

    try:
        seed = json.loads(args.candidate_seed.read_text(encoding="utf-8"))
        with sqlite3.connect(args.sqlite) as conn:
            selected, report = select_catalog(conn, seed, args.catalog_version)
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_seed.write_text(
            json.dumps(selected, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "catalog_version": args.catalog_version,
                    "concepts": report["concept_count"],
                    "selected_sources": report["selected_source_count"],
                    "multiple_candidate_concepts": report[
                        "concepts_with_multiple_candidates"
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        for path in targets:
            if path.exists():
                path.unlink()
        print(f"烹调基准营养来源选择失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
