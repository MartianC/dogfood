#!/usr/bin/env python3
"""确定性清洗菜谱原料，并只为剩余高频项生成低 token 模型批次。"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

from recipe_ingredient_normalization import POLICY_ID, clean_term, normalize_text


MODEL_POLICY_ID = "recipeIngredientModelAssist/v1"
TOKENS_PER_ITEM = 160
TOKENS_PER_BATCH_OVERHEAD = 300


def load_maps(conn: sqlite3.Connection) -> tuple[dict[str, str], set[str]]:
    aliases: dict[str, str] = {}
    conflicts: set[str] = set()
    for alias, concept_id in conn.execute(
        """
        SELECT normalized_alias, concept_id
        FROM ingredient_alias
        WHERE review_status='approved'
        ORDER BY normalized_alias, concept_id
        """
    ):
        alias = str(alias)
        concept_id = str(concept_id)
        if alias in aliases and aliases[alias] != concept_id:
            conflicts.add(alias)
        aliases[alias] = concept_id
    for alias in conflicts:
        aliases.pop(alias, None)
    source_names = {
        normalize_text(str(row[0]))
        for row in conn.execute(
            "SELECT name FROM source_localized_name WHERE locale='zh-CN' ORDER BY name"
        )
    }
    return aliases, source_names


def prepare(
    conn: sqlite3.Connection,
    min_model_occurrences: int,
    max_model_terms: int,
    batch_size: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    aliases, source_names = load_maps(conn)
    known_names = set(aliases) | source_names
    rows = conn.execute(
        """
        SELECT normalized_name, example_raw_name, occurrence_count
        FROM recipe_ingredient_term
        ORDER BY occurrence_count DESC, normalized_name
        """
    ).fetchall()
    items: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    occurrences: dict[str, int] = {}
    model_groups: dict[str, dict[str, Any]] = {}
    all_model_candidate_terms = 0
    all_model_candidate_occurrences = 0
    queued_model_occurrences = 0
    for normalized_name, example_raw_name, occurrence_count in rows:
        result = clean_term(
            str(normalized_name), aliases, source_names, known_names
        )
        item = {
            **result.to_dict(),
            "example_raw_name": str(example_raw_name),
            "occurrence_count": int(occurrence_count),
        }
        items.append(item)
        counts[result.status] = counts.get(result.status, 0) + 1
        occurrences[result.status] = occurrences.get(result.status, 0) + int(occurrence_count)
        if result.status == "model_candidate":
            all_model_candidate_terms += 1
            all_model_candidate_occurrences += int(occurrence_count)
            group = model_groups.setdefault(
                result.cleaned_name,
                {
                    "cleaned_name": result.cleaned_name,
                    "occurrence_count": 0,
                    "source_terms": [],
                },
            )
            group["occurrence_count"] += int(occurrence_count)
            group["source_terms"].append(
                {
                    "name": result.normalized_name,
                    "occurrence_count": int(occurrence_count),
                }
            )

    ordered_groups = sorted(
        model_groups.values(),
        key=lambda item: (-int(item["occurrence_count"]), str(item["cleaned_name"])),
    )
    eligible_groups = [
        item for item in ordered_groups if int(item["occurrence_count"]) >= min_model_occurrences
    ]
    selected_groups = eligible_groups[:max_model_terms]
    model_candidates: list[dict[str, Any]] = []
    for group in selected_groups:
        source_terms = sorted(
            group["source_terms"],
            key=lambda item: (-int(item["occurrence_count"]), str(item["name"])),
        )
        model_candidates.append(
            {
                "cleaned_name": group["cleaned_name"],
                "occurrence_count": group["occurrence_count"],
                "source_term_count": len(source_terms),
                "source_terms": source_terms[:5],
            }
        )
        queued_model_occurrences += int(group["occurrence_count"])

    batches = []
    for index in range(0, len(model_candidates), batch_size):
        terms = model_candidates[index : index + batch_size]
        batches.append(
            {
                "batch_id": f"batch_{index // batch_size + 1:04d}",
                "contract": MODEL_POLICY_ID,
                "instruction": (
                    "只判断基础食材身份或返回 unresolved；不得判断犬食安全，"
                    "不得选择营养来源。每项只输出"
                    "{cleaned_name,base_name_zh,status,resolution_reason}，"
                    "status只能是resolved或unresolved，输出紧凑JSON数组。"
                ),
                "terms": terms,
            }
        )
    estimated_tokens = (
        len(model_candidates) * TOKENS_PER_ITEM
        + len(batches) * TOKENS_PER_BATCH_OVERHEAD
    )
    report = {
        "report_contract": "recipeIngredientNormalizationReport/v1",
        "normalization_policy_id": POLICY_ID,
        "model_policy_id": MODEL_POLICY_ID,
        "term_count": len(rows),
        "occurrence_count": sum(int(row[2]) for row in rows),
        "status_term_counts": dict(sorted(counts.items())),
        "status_occurrence_counts": dict(sorted(occurrences.items())),
        "model_queue": {
            "minimum_occurrences": min_model_occurrences,
            "maximum_terms": max_model_terms,
            "batch_size": batch_size,
            "candidate_terms_before_grouping": all_model_candidate_terms,
            "candidate_identity_groups": len(model_groups),
            "identity_groups": len(model_candidates),
            "occurrences": queued_model_occurrences,
            "batches": len(batches),
            "deferred_identity_groups": len(model_groups) - len(model_candidates),
            "deferred_low_frequency_occurrences": (
                all_model_candidate_occurrences - queued_model_occurrences
            ),
            "estimated_tokens": estimated_tokens,
            "tokens_per_item_assumption": TOKENS_PER_ITEM,
            "tokens_per_batch_overhead_assumption": TOKENS_PER_BATCH_OVERHEAD,
        },
        "items": items,
    }
    return report, batches


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--min-model-occurrences", type=int, default=5)
    parser.add_argument("--max-model-terms", type=int, default=5000)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--model-batches", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.report, args.model_batches)
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有清洗报告或模型批次", file=sys.stderr)
        return 2
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if min(args.min_model_occurrences, args.max_model_terms, args.batch_size) <= 0:
        print("模型队列参数必须大于0", file=sys.stderr)
        return 2
    try:
        with sqlite3.connect(args.sqlite) as conn:
            report, batches = prepare(
                conn,
                args.min_model_occurrences,
                args.max_model_terms,
                args.batch_size,
            )
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.model_batches.write_text(
            "".join(json.dumps(batch, ensure_ascii=False) + "\n" for batch in batches),
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "terms": report["term_count"],
                    "statuses": report["status_term_counts"],
                    "model_queue": report["model_queue"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, sqlite3.Error, ValueError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"菜谱原料低 token 清洗失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
