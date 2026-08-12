#!/usr/bin/env python3
"""为阶段三生成确定性唯一决定和2至5候选的受控模型批次。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


POLICY_ID = "recipeIngredientStage3CandidatePreparation/v1"
CANDIDATE_CONTRACT = "recipeIngredientStage3Candidates/v1"
DECISION_CONTRACT = "recipeIngredientStage3DeterministicDecisions/v1"
MODEL_BATCH_CONTRACT = "recipeIngredientStage3ControlledModelBatch/v1"

TERM_RULES: dict[str, dict[str, Any]] = {
    "培根": {"base": r"^bacon$", "categories": {"meat"}, "species": {None}},
    "奶油": {"base": r"^cream$", "categories": {"dairy"}},
    "面条": {"base": r"^noodles$", "categories": {"carb"}},
    "绿豆": {"base": r"^mung_beans$", "categories": {"legume"}},
    "樱桃": {"base": r"^cherries$", "categories": {"fruit"}},
    "鸭子": {"base": r"^duck$", "categories": {"meat"}, "species": {"duck"}, "parts": {None}},
    "长豆": {"base": r"^yardlong_bean$", "categories": {"vegetable"}},
    "小麦粉": {"base": r"^wheat_flours?$", "categories": {"carb"}},
    "大豆": {"base": r"^soybeans?$", "categories": {"legume"}},
    "李子": {"base": r"^(?:plums|prunes)$", "categories": {"fruit"}},
    "榛子": {"base": r"^nuts_hazelnuts_or_filberts$", "categories": {"legume"}},
    "覆盆子": {"base": r"^raspberries$", "categories": {"fruit"}},
    "黑莓": {"base": r"^blackberries$", "categories": {"fruit"}},
    "意大利细面": {
        "base": r"^pasta$",
        "categories": {"carb"},
        "source_description_pattern": r"\bspaghetti\b",
    },
    "木薯": {"base": r"^cassava$", "categories": {"vegetable"}},
    "菊苣": {"base": r"^chicory(?:_greens)?$", "categories": {"vegetable"}},
    "野鸡": {"base": r"^pheasant$", "categories": {"meat"}, "parts": {None}},
}
FORCED_ISOLATION = {
    "奶酪": "identity_too_broad",
    "肉丸": "composition_unknown",
    "汤": "generic_parent_term",
    "配料": "generic_parent_term",
    "饮料": "generic_parent_term",
    "饼干": "processed_identity_too_broad",
    "冰淇淋": "processed_identity_too_broad",
    "华夫饼": "processed_identity_too_broad",
    "柠檬水": "processed_identity_too_broad",
    "松饼": "processed_identity_too_broad",
    "玉米饼": "processed_identity_too_broad",
    "豬肉": "generic_animal_without_part",
    "鲸鱼": "animal_without_edible_part",
}


def cluster_matches(cluster: dict[str, Any], rule: dict[str, Any]) -> bool:
    if not re.search(str(rule["base"]), str(cluster["base_identity"])):
        return False
    if cluster.get("category_code") not in rule["categories"]:
        return False
    if "species" in rule and cluster.get("species") not in rule["species"]:
        return False
    if "parts" in rule and cluster.get("part") not in rule["parts"]:
        return False
    return True


def aggregate_terms(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.get("stage2_status") != "multiple_source_identities":
            continue
        candidate_ids = list(item.get("candidate_cluster_ids", []))
        if not 2 <= len(candidate_ids) <= 5:
            continue
        name = str(item["cleaned_name"])
        group = groups.setdefault(name, {
            "cleaned_name": name,
            "occurrence_count": 0,
            "source_terms": [],
            "candidate_cluster_ids": candidate_ids,
        })
        if group["candidate_cluster_ids"] != candidate_ids:
            raise ValueError(f"同一清洗词的候选集合不一致：{name}")
        group["occurrence_count"] += int(item["occurrence_count"])
        group["source_terms"].append({
            "normalized_name": item["normalized_name"],
            "occurrence_count": int(item["occurrence_count"]),
        })
    return sorted(groups.values(), key=lambda item: (-item["occurrence_count"], item["cleaned_name"]))


def prepare_stage3(
    stage2_candidates: dict[str, Any],
    source_clusters: dict[str, Any],
    batch_size: int,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    clusters = {str(item["cluster_id"]): item for item in source_clusters.get("items", [])}
    groups = aggregate_terms(list(stage2_candidates.get("items", [])))
    candidates: list[dict[str, Any]] = []
    deterministic: list[dict[str, Any]] = []
    model_items: list[dict[str, Any]] = []
    isolated: list[dict[str, Any]] = []

    for group in groups:
        name = group["cleaned_name"]
        if name in FORCED_ISOLATION:
            isolated.append({**group, "reason": FORCED_ISOLATION[name]})
            continue
        rule = TERM_RULES.get(name)
        if not rule:
            isolated.append({**group, "reason": "no_controlled_identity_rule"})
            continue
        filtered = [
            clusters[cluster_id]
            for cluster_id in group["candidate_cluster_ids"]
            if cluster_id in clusters and cluster_matches(clusters[cluster_id], rule)
        ]
        candidate_values = [
            {
                "candidate_id": item["cluster_id"],
                "base_identity": item["base_identity"],
                "category_code": item["category_code"],
                "species": item.get("species"),
                "part": item.get("part"),
                "source_count": item["source_count"],
                "representative_descriptions": [
                    source["description"] for source in item.get("sources", [])[:3]
                ],
            }
            for item in filtered
        ]
        record = {
            **group,
            "candidates": candidate_values,
            "source_description_pattern": rule.get("source_description_pattern"),
        }
        candidates.append(record)
        if len(candidate_values) == 1:
            deterministic.append({
                "cleaned_name": name,
                "occurrence_count": group["occurrence_count"],
                "decision": "selected_cluster",
                "candidate_id": candidate_values[0]["candidate_id"],
                "decision_method": "deterministic_unique_after_identity_gate",
            })
        elif 2 <= len(candidate_values) <= 5:
            model_items.append(record)
        else:
            isolated.append({**group, "reason": "no_candidate_after_identity_gate"})

    batches = []
    for offset in range(0, len(model_items), batch_size):
        batches.append({
            "batch_id": f"stage3_batch_{offset // batch_size + 1:04d}",
            "contract": MODEL_BATCH_CONTRACT,
            "items": model_items[offset : offset + batch_size],
        })
    candidate_document = {"contract": CANDIDATE_CONTRACT, "policy_id": POLICY_ID, "items": candidates}
    decision_document = {"contract": DECISION_CONTRACT, "policy_id": POLICY_ID, "items": deterministic}
    report = {
        "report_contract": "recipeIngredientStage3PreparationReport/v1",
        "policy_id": POLICY_ID,
        "input_identity_group_count": len(groups),
        "input_occurrence_count": sum(item["occurrence_count"] for item in groups),
        "deterministic_group_count": len(deterministic),
        "deterministic_occurrence_count": sum(item["occurrence_count"] for item in deterministic),
        "model_group_count": len(model_items),
        "model_occurrence_count": sum(item["occurrence_count"] for item in model_items),
        "isolated_group_count": len(isolated),
        "isolated_occurrence_count": sum(item["occurrence_count"] for item in isolated),
        "model_batch_count": len(batches),
        "isolated": isolated,
    }
    return candidate_document, decision_document, batches, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage2-candidates", type=Path, required=True)
    parser.add_argument("--source-clusters", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=20)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.stage2_candidates.is_file() or not args.source_clusters.is_file():
        print("阶段三输入不存在", file=sys.stderr)
        return 2
    if args.out_dir.exists() or args.batch_size <= 0:
        print("拒绝覆盖阶段三目录，且batch-size必须大于0", file=sys.stderr)
        return 2
    try:
        stage2 = json.loads(args.stage2_candidates.read_text(encoding="utf-8"))
        clusters = json.loads(args.source_clusters.read_text(encoding="utf-8"))
        candidates, decisions, batches, report = prepare_stage3(stage2, clusters, args.batch_size)
        args.out_dir.mkdir(parents=True)
        documents = {
            "mapping-candidates.json": candidates,
            "deterministic-decisions.json": decisions,
            "report.json": report,
        }
        report["artifact_sha256"] = {}
        for filename, document in documents.items():
            content = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            (args.out_dir / filename).write_bytes(content)
            if filename != "report.json":
                report["artifact_sha256"][filename] = hashlib.sha256(content).hexdigest()
        (args.out_dir / "model-batches.jsonl").write_text(
            "".join(json.dumps(batch, ensure_ascii=False) + "\n" for batch in batches), encoding="utf-8"
        )
        (args.out_dir / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"阶段三候选生成失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
