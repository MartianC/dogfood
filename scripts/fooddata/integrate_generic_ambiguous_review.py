#!/usr/bin/env python3
"""合并上位词自动与模型决定，执行身份门禁并生成阶段一审核决定。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from seed_ingredient_catalog import normalize_alias


POLICY_ID = "genericAmbiguousDecisionIntegration/v1"
ANIMAL_TOKENS = ("猪", "牛", "羊", "鸡", "鸭", "鹅", "鱼", "虾", "蟹")
PART_PATTERN = re.compile(r"蛋清|蛋白|蛋黄|去皮|去骨|带皮|带骨")
FIXED_DECISIONS = {
    "needs_controlled_default", "composite", "alternative", "state_conversion",
    "auxiliary", "excluded", "insufficient_evidence",
}


def catalog_maps(catalog: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    concepts = {str(item["concept_id"]): item for item in catalog.get("items", [])}
    aliases: dict[str, str] = {}
    conflicts: set[str] = set()
    for concept_id, item in concepts.items():
        for value in [item["canonical_name_zh"], *item.get("aliases", [])]:
            key = normalize_alias(str(value))
            if key in aliases and aliases[key] != concept_id:
                conflicts.add(key)
            aliases[key] = concept_id
    for key in conflicts:
        aliases.pop(key, None)
    return concepts, aliases


def post_gate(
    name: str, decision: str, concepts: dict[str, dict[str, Any]], aliases: dict[str, str]
) -> tuple[str, str | None]:
    if not decision.startswith("concept:"):
        return decision, None
    concept_id = decision.split(":", 1)[1]
    concept = concepts.get(concept_id)
    if not concept:
        raise ValueError(f"模型选择了目录外概念：{name}/{concept_id}")
    target_names = normalize_alias(str(concept["canonical_name_zh"]) + " " + " ".join(concept.get("aliases", [])))
    source_animals = {token for token in ANIMAL_TOKENS if token in name}
    target_animals = {token for token in ANIMAL_TOKENS if token in target_names}
    if source_animals and target_animals and source_animals.isdisjoint(target_animals):
        return "insufficient_evidence", "cross_animal_identity_rejected"
    bracket = re.fullmatch(r"(.+?)\(([^()]*)\)", name)
    if bracket:
        base_owner = aliases.get(normalize_alias(bracket.group(1)))
        if base_owner and base_owner != concept_id:
            return "insufficient_evidence", "exact_base_concept_conflict"
    if PART_PATTERN.search(name) and not PART_PATTERN.search(target_names):
        return "state_conversion", "edible_part_mismatch_requires_conversion"
    return decision, None


def integrate(
    candidates: dict[str, Any], automatic: dict[str, Any], model: dict[str, Any],
    catalog: dict[str, Any], decision_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    groups = {str(item["cleaned_name"]): item for item in candidates.get("items", [])}
    concepts, aliases = catalog_maps(catalog)
    final: dict[str, dict[str, str]] = {}
    for item in automatic.get("items", []):
        final[str(item["cleaned_name"])] = {"decision": str(item["decision"]), "method": str(item["method"])}
    for item in model.get("items", []):
        name = str(item["cleaned_name"])
        if name in final:
            raise ValueError(f"上位词身份组重复决定：{name}")
        final[name] = {
            "decision": str(item["decision"]),
            "method": str(item.get("method") or "controlled_agent_review"),
        }
    if set(final) != set(groups):
        missing = len(set(groups) - set(final))
        raise ValueError(f"上位词决定没有完整覆盖候选组，缺少 {missing} 组")

    review_items: list[dict[str, Any]] = []
    group_decisions: list[dict[str, Any]] = []
    status_counts: dict[str, int] = {}
    occurrence_counts: dict[str, int] = {}
    for name, group in groups.items():
        original = final[name]["decision"]
        allowed = {
            *(str(item["choice_id"]) for item in group.get("concept_candidates", [])),
            *FIXED_DECISIONS,
        }
        if original not in allowed:
            raise ValueError(f"上位词决定超出受控候选：{name}/{original}")
        decision, gate_reason = post_gate(name, original, concepts, aliases)
        if decision.startswith("concept:"):
            status = "matched"
            concept_id = decision.split(":", 1)[1]
            terminal_reason = None
        elif decision in {"auxiliary", "excluded"}:
            status = decision
            concept_id = None
            terminal_reason = f"generic_review_{decision}"
        else:
            status = "isolated"
            concept_id = None
            terminal_reason = f"generic_review_{decision}"
        for source_term in group["source_terms"]:
            review_items.append({
                "normalized_name": source_term["normalized_name"],
                "cleaned_name": name,
                "status": status,
                "concept_id": concept_id,
                "exclusion_category": "seasoning_or_oil" if status == "excluded" else None,
                "rule_id": terminal_reason or "generic_review_selected_concept",
                "model_or_automatic_decision": original,
                "decision": decision,
                "method": final[name]["method"],
                "post_gate_reason": gate_reason,
            })
        status_counts[status] = status_counts.get(status, 0) + 1
        occurrence_counts[status] = occurrence_counts.get(status, 0) + int(group["occurrence_count"])
        group_decisions.append({
            "cleaned_name": name,
            "occurrence_count": group["occurrence_count"],
            "model_or_automatic_decision": original,
            "decision": decision,
            "status": status,
            "concept_id": concept_id,
            "method": final[name]["method"],
            "post_gate_reason": gate_reason,
        })
    review_items.sort(key=lambda item: item["normalized_name"])
    document = {
        "contract": "recipeIngredientReviewedDecisions/v1",
        "policy_id": POLICY_ID,
        "decision_version": decision_version,
        "items": review_items,
    }
    report = {
        "report_contract": "genericAmbiguousDecisionReport/v1",
        "policy_id": POLICY_ID,
        "decision_version": decision_version,
        "input_group_count": len(groups),
        "input_term_count": len(review_items),
        "input_occurrence_count": sum(int(item["occurrence_count"]) for item in groups.values()),
        "terminal_group_count": len(group_decisions),
        "status_group_counts": dict(sorted(status_counts.items())),
        "status_occurrence_counts": dict(sorted(occurrence_counts.items())),
        "post_gate_changed_count": sum(item["post_gate_reason"] is not None for item in group_decisions),
        "group_decisions": group_decisions,
    }
    return document, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--automatic-decisions", type=Path, required=True)
    parser.add_argument("--model-decisions", type=Path, required=True, nargs="+")
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--decision-version", required=True)
    parser.add_argument("--out-decisions", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.out_decisions.exists() or args.report.exists():
        print("拒绝覆盖上位词审核合并产物", file=sys.stderr)
        return 2
    try:
        candidates = json.loads(args.candidates.read_text(encoding="utf-8"))
        automatic = json.loads(args.automatic_decisions.read_text(encoding="utf-8"))
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        partials = [json.loads(path.read_text(encoding="utf-8")) for path in args.model_decisions]
        model = {
            "contract": "genericAmbiguousIdentityAgentDecisions/v1",
            "items": [item for partial in partials for item in partial.get("items", [])],
        }
        document, report = integrate(candidates, automatic, model, catalog, args.decision_version)
        for path, value in ((args.out_decisions, document), (args.report, report)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "group_decisions"}, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out_decisions.unlink(missing_ok=True)
        args.report.unlink(missing_ok=True)
        print(f"上位词审核合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
