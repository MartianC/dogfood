#!/usr/bin/env python3
"""把版本化犬食安全策略完整快照写入食材知识层 SQLite。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


DECISIONS = {"allowed", "conditional", "blocked", "unknown"}
REQUIRED_TABLES = {
    "ingredient_concept",
    "ingredient_variant",
    "ingredient_alias",
    "canine_ingredient_policy",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    return parser.parse_args()


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def policy_id(policy_version: str, subject_key: str) -> str:
    digest = hashlib.sha256(f"{policy_version}\0{subject_key}".encode()).hexdigest()[:20]
    return f"canine_policy_{digest}"


def catalog_version(conn: sqlite3.Connection) -> str:
    versions = [
        str(row[0])
        for row in conn.execute(
            """
            SELECT DISTINCT decision_version
            FROM ingredient_alias
            WHERE source = 'catalog_seed'
              AND review_status = 'approved'
              AND decision_version IS NOT NULL
            ORDER BY decision_version
            """
        )
    ]
    if len(versions) != 1:
        raise ValueError(f"离线主库必须且只能包含一个目录版本：{versions}")
    return versions[0]


def load_seed(path: Path) -> dict[str, Any]:
    seed = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "policy_version",
        "compatible_catalog_version",
        "evidence_reviewed_at",
        "review",
        "evidence_library",
        "concept_policies",
        "variant_policies",
    }
    missing = sorted(required - seed.keys())
    if missing:
        raise ValueError(f"安全策略种子缺少字段：{', '.join(missing)}")
    return seed


def validate_tables(conn: sqlite3.Connection) -> None:
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"离线主库缺少必要表：{', '.join(missing)}")


def normalize_rule(
    rule: dict[str, Any],
    evidence_library: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    decision = str(rule.get("decision", ""))
    if decision not in DECISIONS:
        raise ValueError(f"无效安全策略结论：{decision!r}")
    evidence_ids = rule.get("evidence_ids", [])
    if not isinstance(evidence_ids, list):
        raise ValueError("evidence_ids 必须是数组")
    unknown_evidence = sorted(set(map(str, evidence_ids)) - evidence_library.keys())
    if unknown_evidence:
        raise ValueError(f"安全策略引用未知证据：{unknown_evidence}")
    if decision != "unknown" and not evidence_ids:
        raise ValueError(f"{decision} 策略必须具有证据")
    conditions = rule.get("conditions", {})
    if not isinstance(conditions, dict):
        raise ValueError("conditions 必须是对象")
    if decision == "conditional" and not conditions:
        raise ValueError("conditional 策略必须具有结构化条件")
    rationale = str(rule.get("rationale", "")).strip()
    if not rationale:
        raise ValueError("安全策略必须记录判断理由")
    return {
        "decision": decision,
        "hazard_type": rule.get("hazard_type"),
        "conditions": conditions,
        "evidence": [evidence_library[str(item)] for item in evidence_ids],
        "rationale": rationale,
    }


def resolved_policies(conn: sqlite3.Connection, seed: dict[str, Any]) -> list[dict[str, Any]]:
    evidence_library = seed["evidence_library"]
    if not isinstance(evidence_library, dict):
        raise ValueError("evidence_library 必须是对象")
    concepts = {
        str(row[0])
        for row in conn.execute(
            "SELECT concept_id FROM ingredient_concept WHERE status IN ('reviewed','published')"
        )
    }
    variants = {
        str(row[0]): str(row[1])
        for row in conn.execute(
            """
            SELECT variant_id, concept_id
            FROM ingredient_variant
            WHERE status IN ('reviewed','published')
            """
        )
    }
    concept_rules: dict[str, dict[str, Any]] = {}
    for rule in seed["concept_policies"]:
        concept_id = str(rule.get("concept_id", ""))
        if concept_id not in concepts:
            raise ValueError(f"概念策略引用目录外概念：{concept_id}")
        if concept_id in concept_rules:
            raise ValueError(f"概念策略重复：{concept_id}")
        concept_rules[concept_id] = normalize_rule(rule, evidence_library)

    variant_rules: dict[str, dict[str, Any]] = {}
    for rule in seed["variant_policies"]:
        variant_id = str(rule.get("variant_id", ""))
        if variant_id not in variants:
            raise ValueError(f"形态策略引用目录外形态：{variant_id}")
        if variant_id in variant_rules:
            raise ValueError(f"形态策略重复：{variant_id}")
        normalized = normalize_rule(rule, evidence_library)
        concept_rule = concept_rules.get(variants[variant_id])
        if concept_rule and concept_rule["decision"] == "blocked" and normalized["decision"] != "blocked":
            raise ValueError(f"blocked 概念不能被普通形态策略放宽：{variant_id}")
        variant_rules[variant_id] = normalized

    default_unknown = {
        "decision": "unknown",
        "hazard_type": "insufficient_evidence",
        "conditions": {},
        "evidence": [],
        "rationale": "当前证据不足或尚未完成食材级复核，按保守默认保持不可选择。",
    }
    rows: list[dict[str, Any]] = []
    for concept_id in sorted(concepts):
        rows.append(
            {
                "subject_key": f"concept:{concept_id}",
                "concept_id": concept_id,
                "variant_id": None,
                **concept_rules.get(concept_id, default_unknown),
            }
        )
    for variant_id in sorted(variant_rules):
        rows.append(
            {
                "subject_key": f"variant:{variant_id}",
                "concept_id": variants[variant_id],
                "variant_id": variant_id,
                **variant_rules[variant_id],
            }
        )
    return rows


def seed_policies(conn: sqlite3.Connection, seed: dict[str, Any]) -> dict[str, Any]:
    validate_tables(conn)
    actual_catalog_version = catalog_version(conn)
    compatible_catalog_version = str(seed["compatible_catalog_version"])
    if compatible_catalog_version != actual_catalog_version:
        raise ValueError(
            "策略兼容目录版本不匹配："
            f"seed={compatible_catalog_version}, sqlite={actual_catalog_version}"
        )
    review = seed["review"]
    for field in ("reviewed_by", "reviewed_at", "next_review_at"):
        if not str(review.get(field, "")).strip():
            raise ValueError(f"策略审核记录缺少 {field}")

    policy_version = str(seed["policy_version"])
    rows = resolved_policies(conn, seed)
    conn.execute(
        "DELETE FROM canine_ingredient_policy WHERE policy_version = ?",
        (policy_version,),
    )
    for row in rows:
        conn.execute(
            """
            INSERT INTO canine_ingredient_policy (
              policy_id, policy_version, compatible_catalog_version, subject_key,
              concept_id, variant_id, decision, hazard_type, conditions_json,
              evidence_json, rationale, review_status, reviewed_by, reviewed_at,
              next_review_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
            """,
            (
                policy_id(policy_version, row["subject_key"]),
                policy_version,
                compatible_catalog_version,
                row["subject_key"],
                row["concept_id"],
                row["variant_id"],
                row["decision"],
                row["hazard_type"],
                stable_json(row["conditions"]),
                stable_json(row["evidence"]),
                row["rationale"],
                review["reviewed_by"],
                review["reviewed_at"],
                review["next_review_at"],
            ),
        )
    decisions = {
        decision: sum(row["decision"] == decision for row in rows)
        for decision in sorted(DECISIONS)
    }
    concept_count = sum(row["variant_id"] is None for row in rows)
    variant_override_count = len(rows) - concept_count
    return {
        "policy_version": policy_version,
        "compatible_catalog_version": compatible_catalog_version,
        "policies": len(rows),
        "concept_policies": concept_count,
        "variant_overrides": variant_override_count,
        "decisions": decisions,
    }


def main() -> int:
    args = parse_args()
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if not args.seed.is_file():
        print(f"安全策略种子不存在：{args.seed}", file=sys.stderr)
        return 2
    try:
        seed = load_seed(args.seed)
        with sqlite3.connect(args.sqlite) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            with conn:
                summary = seed_policies(conn, seed)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        print(f"安全策略写入失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
