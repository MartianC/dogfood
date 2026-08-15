#!/usr/bin/env python3
"""把证据复核通过的 blocked 决定合并为新的完整安全策略快照。"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--decisions", type=Path, required=True)
    parser.add_argument("--policy-version", required=True)
    parser.add_argument("--reviewed-at", required=True)
    parser.add_argument("--next-review-at", required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def promote(
    previous: dict[str, Any],
    catalog: dict[str, Any],
    decisions: dict[str, Any],
    *,
    policy_version: str,
    reviewed_at: str,
    next_review_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    concept_ids = {str(item["concept_id"]) for item in catalog.get("items", [])}
    if not concept_ids:
        raise ValueError("目标目录没有标准概念")

    output = deepcopy(previous)
    previous_rules = {
        str(item["concept_id"]): item
        for item in output.get("concept_policies", [])
    }
    evidence = output.get("evidence_library")
    if not isinstance(evidence, dict):
        raise ValueError("上一版策略缺少 evidence_library")
    additions = decisions.get("evidence_library")
    if not isinstance(additions, dict):
        raise ValueError("blocked 决定缺少 evidence_library")
    for evidence_id, item in additions.items():
        if evidence_id in evidence and evidence[evidence_id] != item:
            raise ValueError(f"证据 ID 冲突：{evidence_id}")
        evidence[evidence_id] = item

    promoted: list[str] = []
    for rule in decisions.get("concept_policies", []):
        concept_id = str(rule.get("concept_id", ""))
        if concept_id not in concept_ids:
            raise ValueError(f"blocked 决定引用目录外概念：{concept_id}")
        if concept_id in previous_rules:
            raise ValueError(f"blocked 决定试图覆盖已有显式策略：{concept_id}")
        if rule.get("decision") != "blocked":
            raise ValueError(f"本工具只接受 blocked 决定：{concept_id}")
        evidence_ids = rule.get("evidence_ids")
        if not isinstance(evidence_ids, list) or not evidence_ids:
            raise ValueError(f"blocked 决定缺少证据：{concept_id}")
        unknown = sorted(set(map(str, evidence_ids)) - evidence.keys())
        if unknown:
            raise ValueError(f"blocked 决定引用未知证据：{concept_id}/{unknown}")
        if not str(rule.get("hazard_type", "")).strip():
            raise ValueError(f"blocked 决定缺少 hazard_type：{concept_id}")
        if not str(rule.get("rationale", "")).strip():
            raise ValueError(f"blocked 决定缺少 rationale：{concept_id}")
        output["concept_policies"].append(rule)
        previous_rules[concept_id] = rule
        promoted.append(concept_id)

    if len(promoted) != len(set(promoted)):
        raise ValueError("blocked 决定包含重复概念")
    output["concept_policies"] = sorted(
        output["concept_policies"], key=lambda item: str(item["concept_id"])
    )
    output["policy_version"] = policy_version
    output["compatible_catalog_version"] = str(catalog["catalog_version"])
    output["evidence_reviewed_at"] = str(decisions["evidence_reviewed_at"])
    output["review"] = {
        "reviewed_by": str(decisions["reviewed_by"]),
        "reviewed_at": reviewed_at,
        "next_review_at": next_review_at,
    }
    output["migration"] = {
        "previous_policy_version": str(previous["policy_version"]),
        "decision_version": str(decisions["decision_version"]),
        "rule": "保留身份未变化的显式策略，并把公开证据复核通过的 whole-concept 毒物提升为 blocked；其余概念继续 unknown。",
        "promoted_blocked_concepts": sorted(promoted),
    }
    report = {
        "policy_version": policy_version,
        "compatible_catalog_version": output["compatible_catalog_version"],
        "explicit_concept_rules": len(output["concept_policies"]),
        "variant_rules": len(output.get("variant_policies", [])),
        "promoted_blocked_concepts": sorted(promoted),
        "default_unknown_concepts": len(concept_ids) - len(output["concept_policies"]),
    }
    return output, report


def main() -> int:
    args = parse_args()
    inputs = (args.previous, args.catalog, args.decisions)
    if any(not path.is_file() for path in inputs):
        print("策略提升输入不完整", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"拒绝覆盖已有策略快照：{args.out}", file=sys.stderr)
        return 2
    try:
        previous, catalog, decisions = (
            json.loads(path.read_text(encoding="utf-8")) for path in inputs
        )
        output, report = promote(
            previous,
            catalog,
            decisions,
            policy_version=args.policy_version,
            reviewed_at=args.reviewed_at,
            next_review_at=args.next_review_at,
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
        print(f"策略提升失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
