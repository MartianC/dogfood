#!/usr/bin/env python3
"""统计排除调味料和油后的菜谱原料标准概念覆盖率。"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

from recipe_ingredient_normalization import POLICY_ID, clean_term, normalize_text


REPORT_CONTRACT = "recipeIngredientCoverageReport/v1"
COVERED_STATUSES = {"matched", "alternative", "composite"}


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
        key = str(alias)
        if key in aliases and aliases[key] != str(concept_id):
            conflicts.add(key)
        aliases[key] = str(concept_id)
    for key in conflicts:
        aliases.pop(key, None)
    source_names = {
        normalize_text(str(row[0]))
        for row in conn.execute(
            "SELECT name FROM source_localized_name WHERE locale = 'zh-CN'"
        )
    }
    return aliases, source_names


def coverage_report(conn: sqlite3.Connection) -> dict[str, object]:
    aliases, source_names = load_maps(conn)
    known_names = set(aliases) | source_names
    status_terms: dict[str, int] = defaultdict(int)
    status_occurrences: dict[str, int] = defaultdict(int)
    excluded_terms: dict[str, int] = defaultdict(int)
    excluded_occurrences: dict[str, int] = defaultdict(int)
    total_terms = total_occurrences = 0
    denominator_terms = denominator_occurrences = 0
    covered_terms = covered_occurrences = 0
    uncovered: list[dict[str, object]] = []

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
        total_terms += 1
        total_occurrences += count
        status_terms[result.status] += 1
        status_occurrences[result.status] += count
        if result.status == "excluded":
            category = str(result.exclusion_category)
            excluded_terms[category] += 1
            excluded_occurrences[category] += count
            continue
        denominator_terms += 1
        denominator_occurrences += count
        if result.status in COVERED_STATUSES:
            covered_terms += 1
            covered_occurrences += count
        else:
            uncovered.append({
                "normalized_name": str(normalized_name),
                "example_raw_name": str(example_raw_name),
                "occurrence_count": count,
                "status": result.status,
                "rule_id": result.rule_id,
                "cleaned_name": result.cleaned_name,
            })

    return {
        "report_contract": REPORT_CONTRACT,
        "normalization_policy_id": POLICY_ID,
        "denominator_rule": "仅排除 seasoning 和 oil；其余原料与烹饪辅料均计入分母",
        "total_term_count": total_terms,
        "total_occurrence_count": total_occurrences,
        "excluded_term_counts": dict(sorted(excluded_terms.items())),
        "excluded_occurrence_counts": dict(sorted(excluded_occurrences.items())),
        "denominator_term_count": denominator_terms,
        "denominator_occurrence_count": denominator_occurrences,
        "covered_term_count": covered_terms,
        "covered_occurrence_count": covered_occurrences,
        "term_coverage": covered_terms / denominator_terms if denominator_terms else 0,
        "occurrence_coverage": (
            covered_occurrences / denominator_occurrences if denominator_occurrences else 0
        ),
        "status_term_counts": dict(sorted(status_terms.items())),
        "status_occurrence_counts": dict(sorted(status_occurrences.items())),
        "uncovered": uncovered,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if args.report.exists():
        print("拒绝覆盖已有覆盖率报告", file=sys.stderr)
        return 2
    try:
        with sqlite3.connect(args.sqlite) as conn:
            report = coverage_report(conn)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "denominator_occurrences": report["denominator_occurrence_count"],
            "covered_occurrences": report["covered_occurrence_count"],
            "occurrence_coverage": report["occurrence_coverage"],
            "term_coverage": report["term_coverage"],
        }, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError) as error:
        args.report.unlink(missing_ok=True)
        print(f"覆盖率统计失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
