#!/usr/bin/env python3
"""执行菜谱原料阶段一确定性映射并生成可审计产物。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from recipe_ingredient_normalization import POLICY_ID, clean_term, normalize_text


REPORT_CONTRACT = "recipeIngredientStage1Report/v1"
DECISION_CONTRACT = "recipeIngredientStage1Decisions/v1"
UNRESOLVED_CONTRACT = "recipeIngredientStage1Unresolved/v1"
RESOLVED_STATUSES = {"excluded", "auxiliary", "matched", "alternative", "composite"}


def load_maps(conn: sqlite3.Connection) -> tuple[dict[str, str], set[str]]:
    aliases: dict[str, str] = {}
    conflicts: set[str] = set()
    for alias, concept_id in conn.execute(
        """
        SELECT normalized_alias, concept_id
        FROM ingredient_alias
        WHERE review_status = 'approved'
        ORDER BY normalized_alias, concept_id
        """
    ):
        key = normalize_text(str(alias))
        concept = str(concept_id)
        if key in aliases and aliases[key] != concept:
            conflicts.add(key)
        aliases[key] = concept
    for key in conflicts:
        aliases.pop(key, None)
    source_names = {
        normalize_text(str(row[0]))
        for row in conn.execute(
            "SELECT name FROM source_localized_name WHERE locale = 'zh-CN'"
        )
    }
    return aliases, source_names


def decision_type(status: str) -> str:
    return {
        "excluded": "excluded",
        "auxiliary": "auxiliary",
        "matched": "mapped_existing",
        "alternative": "alternative",
        "composite": "composite",
    }[status]


def build_stage1(conn: sqlite3.Connection) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    aliases, source_names = load_maps(conn)
    known_names = set(aliases) | source_names
    decisions: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    status_term_counts: dict[str, int] = defaultdict(int)
    status_occurrence_counts: dict[str, int] = defaultdict(int)
    decision_term_counts: dict[str, int] = defaultdict(int)
    decision_occurrence_counts: dict[str, int] = defaultdict(int)
    nutrition_status_term_counts: dict[str, int] = defaultdict(int)
    nutrition_status_occurrence_counts: dict[str, int] = defaultdict(int)

    rows = conn.execute(
        """
        SELECT normalized_name, example_raw_name, occurrence_count
        FROM recipe_ingredient_term
        ORDER BY occurrence_count DESC, normalized_name
        """
    ).fetchall()
    for normalized_name, example_raw_name, occurrence_count in rows:
        count = int(occurrence_count)
        result = clean_term(str(normalized_name), aliases, source_names, known_names)
        base = {
            "normalized_name": str(normalized_name),
            "example_raw_name": str(example_raw_name),
            "occurrence_count": count,
            "cleaned_name": result.cleaned_name,
            "rule_id": result.rule_id,
            "rule_trace": result.rule_trace,
            "mention_preparation_state": result.mention_preparation_state,
            "nutrition_status": result.nutrition_status,
        }
        status_term_counts[result.status] += 1
        status_occurrence_counts[result.status] += count
        if result.status in RESOLVED_STATUSES:
            kind = decision_type(result.status)
            decisions.append(
                {
                    **base,
                    "decision": kind,
                    "concept_id": result.concept_id,
                    "components": result.components,
                    "exclusion_category": result.exclusion_category,
                }
            )
            decision_term_counts[kind] += 1
            decision_occurrence_counts[kind] += count
            if result.nutrition_status:
                nutrition_status_term_counts[result.nutrition_status] += 1
                nutrition_status_occurrence_counts[result.nutrition_status] += count
        else:
            unresolved.append({**base, "status": result.status})

    decisions_document = {
        "contract": DECISION_CONTRACT,
        "normalization_policy_id": POLICY_ID,
        "items": decisions,
    }
    unresolved_document = {
        "contract": UNRESOLVED_CONTRACT,
        "normalization_policy_id": POLICY_ID,
        "items": unresolved,
    }
    report = {
        "report_contract": REPORT_CONTRACT,
        "normalization_policy_id": POLICY_ID,
        "model_calls": 0,
        "external_api_token_cost": 0,
        "term_count": len(rows),
        "occurrence_count": sum(int(row[2]) for row in rows),
        "decision_term_count": len(decisions),
        "decision_occurrence_count": sum(item["occurrence_count"] for item in decisions),
        "unresolved_term_count": len(unresolved),
        "unresolved_occurrence_count": sum(item["occurrence_count"] for item in unresolved),
        "status_term_counts": dict(sorted(status_term_counts.items())),
        "status_occurrence_counts": dict(sorted(status_occurrence_counts.items())),
        "decision_term_counts": dict(sorted(decision_term_counts.items())),
        "decision_occurrence_counts": dict(sorted(decision_occurrence_counts.items())),
        "nutrition_status_term_counts": dict(sorted(nutrition_status_term_counts.items())),
        "nutrition_status_occurrence_counts": dict(sorted(nutrition_status_occurrence_counts.items())),
    }
    return decisions_document, unresolved_document, report


def encoded(document: dict[str, Any]) -> bytes:
    return (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--decisions", type=Path, required=True)
    parser.add_argument("--unresolved", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    targets = (args.decisions, args.unresolved, args.report)
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if any(path.exists() for path in targets):
        print("拒绝覆盖已有阶段一产物", file=sys.stderr)
        return 2
    try:
        with sqlite3.connect(args.sqlite) as conn:
            decisions, unresolved, report = build_stage1(conn)
        decision_bytes = encoded(decisions)
        unresolved_bytes = encoded(unresolved)
        report["artifact_sha256"] = {
            args.decisions.name: hashlib.sha256(decision_bytes).hexdigest(),
            args.unresolved.name: hashlib.sha256(unresolved_bytes).hexdigest(),
        }
        for path in targets:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.decisions.write_bytes(decision_bytes)
        args.unresolved.write_bytes(unresolved_bytes)
        args.report.write_bytes(encoded(report))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError) as error:
        for path in targets:
            path.unlink(missing_ok=True)
        print(f"阶段一确定性映射失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
