#!/usr/bin/env python3
"""合并 CFCT 精确身份自动与模型决定，执行来源门禁并生成完整目录。"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from integrate_controlled_ingredient_aliases import integrate


POLICY_ID = "cfctExactIdentityDecisionIntegration/v1"
POST_GATE_OVERRIDES = {
    "红豆馅": ("variable_processed", "sweetened_filling_cannot_use_plain_red_bean"),
    "桂圆肉": ("state_conversion", "longan_flesh_state_cannot_use_fresh_longan"),
    "鸭蛋黄": ("source:112103", "duck_egg_yolk_cannot_use_chicken_egg_yolk"),
    "豆角": ("concept:ingredient_green_beans", "project_controlled_synonym_maps_doujiao_to_green_beans"),
    "燕窝": ("insufficient_evidence", "current_catalog_has_no_controlled_bird_nest_category"),
    "阿胶": ("variable_processed", "processed_animal_product_requires_composition_policy"),
}
CATEGORY_OVERRIDES = {"牛蛙": "meat"}


def preparation_state(name: str) -> str:
    if any(value in name for value in ("熟", "煮", "烤", "蒸", "炸")): return "cooked"
    if "干" in name: return "dried"
    if any(value in name for value in ("冷冻", "冻")): return "frozen"
    if "鲜" in name: return "raw"
    return "unspecified"


def build_controlled_decisions(
    candidates: dict[str, Any], automatic: dict[str, Any], model: dict[str, Any], decision_version: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    groups = {str(item["cleaned_name"]): item for item in candidates.get("items", [])}
    choices_by_group = {
        name: {*(value["choice_id"] for value in item["concept_candidates"]), *(value["choice_id"] for value in item["source_candidates"]), "variable_processed", "state_conversion", "insufficient_evidence"}
        for name, item in groups.items()
    }
    final: dict[str, dict[str, str]] = {}
    for item in automatic.get("items", []):
        final[str(item["cleaned_name"])] = {"decision": str(item["decision"]), "method": str(item["method"])}
    for item in model.get("items", []):
        name = str(item["cleaned_name"])
        if name in final: raise ValueError(f"CFCT 身份组重复决定：{name}")
        final[name] = {"decision": str(item["decision"]), "method": "controlled_model_consensus"}
    if set(final) != set(groups):
        raise ValueError("CFCT 身份决定没有完整覆盖候选组")

    aliases: dict[str, list[str]] = defaultdict(list)
    new_concepts = []
    isolated = []
    decisions = []
    for name, group in groups.items():
        model_decision = final[name]["decision"]
        decision, gate_reason = POST_GATE_OVERRIDES.get(name, (model_decision, None))
        if model_decision not in choices_by_group[name]: raise ValueError(f"CFCT 身份决定超出候选：{name}")
        if decision.startswith("concept:"):
            concept_id = decision.split(":", 1)[1]; aliases[concept_id].append(name)
            status = "mapped_existing"
        elif decision.startswith("source:"):
            fdc_id = int(decision.split(":", 1)[1])
            matches = [value for value in group["source_candidates"] if int(value["fdc_id"]) == fdc_id]
            if len(matches) != 1: raise ValueError(f"CFCT 新概念来源不唯一：{name}")
            source = matches[0]
            controlled_category = CATEGORY_OVERRIDES.get(name, source.get("category_code"))
            if not controlled_category: raise ValueError(f"CFCT 新概念分类无法映射：{name}")
            new_concepts.append({
                "canonical_name_zh": name, "aliases": [], "category_code": controlled_category,
                "source_version": source["source_version"], "fdc_id": source["fdc_id"],
                "description_contains": source["original_name"], "preparation_state": preparation_state(source["original_name"]),
            })
            status = "new_concept"
        else:
            isolated.append({"cleaned_name": name, "status": decision, "occurrence_count": group["occurrence_count"]})
            status = decision
        decisions.append({
            "cleaned_name": name, "occurrence_count": group["occurrence_count"],
            "model_or_automatic_decision": model_decision, "decision": decision,
            "status": status, "method": final[name]["method"], "post_gate_reason": gate_reason,
        })
    controlled = {
        "contract": "controlledIngredientIdentityDecisions/v1", "decision_version": decision_version,
        "scope": "CFCT 精确来源候选的确定性与本地模型完整终态决定",
        "catalog_aliases": [{"concept_id": key, "terms": sorted(set(values))} for key, values in sorted(aliases.items())],
        "bare_defaults": [], "new_concepts": new_concepts,
    }
    report = {
        "report_contract": "cfctExactIdentityDecisionReport/v1", "policy_id": POLICY_ID,
        "decision_version": decision_version, "input_group_count": len(groups),
        "terminal_group_count": len(decisions), "mapped_existing_count": sum(v["status"] == "mapped_existing" for v in decisions),
        "new_concept_count": sum(v["status"] == "new_concept" for v in decisions),
        "isolated_count": len(isolated), "isolated": isolated, "decisions": decisions,
    }
    return controlled, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True); parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True); parser.add_argument("--automatic-decisions", type=Path, required=True)
    parser.add_argument("--model-decisions", type=Path, required=True); parser.add_argument("--decision-version", required=True)
    parser.add_argument("--catalog-version", required=True); parser.add_argument("--out-controlled-decisions", type=Path, required=True)
    parser.add_argument("--out-catalog", type=Path, required=True); parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(); targets = (args.out_controlled_decisions, args.out_catalog, args.report)
    if any(path.exists() for path in targets): print("拒绝覆盖 CFCT 精确身份合并产物", file=sys.stderr); return 2
    try:
        values = [json.loads(path.read_text(encoding="utf-8")) for path in (args.candidates, args.automatic_decisions, args.model_decisions)]
        base = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        controlled, decision_report = build_controlled_decisions(*values, args.decision_version)
        with sqlite3.connect(args.sqlite) as conn:
            catalog, integration_report = integrate(base, controlled, args.catalog_version, conn)
        report = {**decision_report, "catalog_version": args.catalog_version, "catalog_integration": integration_report}
        for path, value in ((args.out_controlled_decisions, controlled), (args.out_catalog, catalog), (args.report, report)):
            path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key not in ("decisions", "isolated", "catalog_integration")}, ensure_ascii=False, indent=2)); return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        for path in targets: path.unlink(missing_ok=True)
        print(f"CFCT 精确身份合并失败：{error}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
