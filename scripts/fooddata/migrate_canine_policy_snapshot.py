#!/usr/bin/env python3
"""把上一版安全策略中仍有效的显式规则迁移到新目录完整快照。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--policy-version", required=True)
    parser.add_argument("--reviewed-at", required=True)
    parser.add_argument("--next-review-at", required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def migrate(
    previous: dict[str, Any],
    catalog: dict[str, Any],
    policy_version: str,
    reviewed_at: str,
    next_review_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    concept_ids = {str(item["concept_id"]) for item in catalog.get("items", [])}
    variant_ids = {
        str(variant["variant_id"])
        for item in catalog.get("items", [])
        for variant in item.get("variants", [])
    }
    if not concept_ids or not variant_ids:
        raise ValueError("目标目录为空或缺少形态")
    concept_policies = [
        rule
        for rule in previous.get("concept_policies", [])
        if str(rule.get("concept_id", "")) in concept_ids
    ]
    variant_policies = [
        rule
        for rule in previous.get("variant_policies", [])
        if str(rule.get("variant_id", "")) in variant_ids
    ]
    dropped_concepts = sorted(
        str(rule.get("concept_id", ""))
        for rule in previous.get("concept_policies", [])
        if str(rule.get("concept_id", "")) not in concept_ids
    )
    dropped_variants = sorted(
        str(rule.get("variant_id", ""))
        for rule in previous.get("variant_policies", [])
        if str(rule.get("variant_id", "")) not in variant_ids
    )
    output = {
        "policy_version": policy_version,
        "compatible_catalog_version": str(catalog["catalog_version"]),
        "evidence_reviewed_at": str(previous["evidence_reviewed_at"]),
        "review": {
            "reviewed_by": "system:versioned-policy-migration（自动迁移，非专业终审）",
            "reviewed_at": reviewed_at,
            "next_review_at": next_review_at,
        },
        "migration": {
            "previous_policy_version": str(previous["policy_version"]),
            "rule": "仅迁移目标目录中身份和形态 ID 均未变化的显式规则；其余概念由种子器生成 unknown。",
            "dropped_concept_rules": dropped_concepts,
            "dropped_variant_rules": dropped_variants,
        },
        "evidence_library": previous["evidence_library"],
        "concept_policies": concept_policies,
        "variant_policies": variant_policies,
    }
    report = {
        "policy_version": policy_version,
        "compatible_catalog_version": output["compatible_catalog_version"],
        "catalog_concepts": len(concept_ids),
        "catalog_variants": len(variant_ids),
        "migrated_concept_rules": len(concept_policies),
        "migrated_variant_rules": len(variant_policies),
        "default_unknown_concepts": len(concept_ids)
        - len({str(rule["concept_id"]) for rule in concept_policies}),
        "dropped_concept_rules": dropped_concepts,
        "dropped_variant_rules": dropped_variants,
    }
    return output, report


def main() -> int:
    args = parse_args()
    if not args.previous.is_file() or not args.catalog.is_file():
        print("策略迁移输入不完整", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"拒绝覆盖已有策略快照：{args.out}", file=sys.stderr)
        return 2
    try:
        previous = json.loads(args.previous.read_text(encoding="utf-8"))
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        output, report = migrate(
            previous,
            catalog,
            args.policy_version,
            args.reviewed_at,
            args.next_review_at,
        )
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out.unlink(missing_ok=True)
        print(f"策略迁移失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
