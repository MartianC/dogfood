#!/usr/bin/env python3
"""合并阶段三确定性和双次模型一致结果，生成新的完整目录。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from cluster_source_food_identities import stage2_source_score
from discover_standard_ingredient_concepts import PREPARATION_LABELS
from seed_ingredient_catalog import normalize_alias, validate_seed_shape


POLICY_ID = "recipeIngredientStage3CatalogIntegration/v1"


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def source_key(value: dict[str, Any]) -> tuple[str, int]:
    return str(value["source_version"]), int(value["fdc_id"])


def resolve_cluster_sources(
    conn: sqlite3.Connection,
    cluster: dict[str, Any],
) -> list[dict[str, Any]]:
    resolved = []
    for source in cluster.get("sources", []):
        version, fdc_id = source_key(source)
        rows = conn.execute(
            """
            SELECT COUNT(n.rowid)
            FROM source_release r
            JOIN source_food f ON f.source_release_id = r.release_id
            LEFT JOIN source_food_nutrient n
              ON n.source_release_id = f.source_release_id AND n.fdc_id = f.fdc_id
            WHERE r.source_version = ? AND f.fdc_id = ? AND f.description = ?
            """,
            (version, fdc_id, source["description"]),
        ).fetchall()
        if len(rows) != 1 or int(rows[0][0]) <= 0:
            continue
        resolved.append({
            **source,
            "source_description": source["description"],
            "nutrient_count": int(rows[0][0]),
            "base_identity": cluster["base_identity"],
            "variant_id": f"source_{version}_{fdc_id}",
            "is_default": False,
        })
    return resolved


def selected_stage3_items(
    deterministic: dict[str, Any],
    consensus: dict[str, Any],
) -> list[dict[str, Any]]:
    selected = [
        {
            "cleaned_name": item["cleaned_name"],
            "occurrence_count": int(item["occurrence_count"]),
            "candidate_id": item["candidate_id"],
            "decision_method": item["decision_method"],
        }
        for item in deterministic.get("items", [])
        if item.get("decision") == "selected_cluster"
    ]
    selected.extend(
        {
            "cleaned_name": item["cleaned_name"],
            "occurrence_count": int(item["occurrence_count"]),
            "candidate_id": item["decision"],
            "decision_method": "dual_pass_model_consensus",
        }
        for item in consensus.get("items", [])
        if item.get("status") == "selected_cluster" and item.get("decision")
    )
    return selected


def integrate_stage3(
    conn: sqlite3.Connection,
    base_catalog: dict[str, Any],
    candidates: dict[str, Any],
    deterministic: dict[str, Any],
    consensus: dict[str, Any],
    source_clusters: dict[str, Any],
    catalog_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    output = deepcopy(base_catalog)
    output["catalog_version"] = catalog_version
    output["stage3_integration"] = {
        "policy_id": POLICY_ID,
        "rule": "L1唯一候选或L2正反顺序双次一致后，才允许选择来源簇",
    }
    items = output["items"]
    clusters = {str(item["cluster_id"]): item for item in source_clusters.get("items", [])}
    candidate_groups = {str(item["cleaned_name"]): item for item in candidates.get("items", [])}
    selected = selected_stage3_items(deterministic, consensus)

    source_owners: dict[tuple[str, int], dict[str, Any]] = {}
    alias_owners: dict[str, dict[str, Any]] = {}
    for item in items:
        for variant in item["variants"]:
            source_owners[source_key(variant)] = item
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]:
            alias_owners[normalize_alias(str(alias))] = item

    added = []
    extended = []
    decisions = []
    used_stage3_sources: set[tuple[str, int]] = set()
    for selection in selected:
        name = str(selection["cleaned_name"])
        candidate_group = candidate_groups.get(name)
        cluster = clusters.get(str(selection["candidate_id"]))
        if not candidate_group or not cluster:
            raise ValueError(f"阶段三选择缺少候选证据：{name}")
        allowed_ids = {str(item["candidate_id"]) for item in candidate_group["candidates"]}
        if str(selection["candidate_id"]) not in allowed_ids:
            raise ValueError(f"阶段三选择超出候选集合：{name}")
        sources = resolve_cluster_sources(conn, cluster)
        source_pattern = candidate_group.get("source_description_pattern")
        if source_pattern:
            sources = [
                source for source in sources
                if re.search(str(source_pattern), str(source["description"]), re.IGNORECASE)
            ]
        if not sources:
            raise ValueError(f"阶段三来源簇没有营养来源：{name}")
        chosen = sorted(sources, key=stage2_source_score)[0]
        key = source_key(chosen)
        if key in used_stage3_sources:
            raise ValueError(f"阶段三重复选择来源：{key}")
        used_stage3_sources.add(key)
        owner = source_owners.get(key)
        if owner:
            previous = alias_owners.get(normalize_alias(name))
            if previous and previous["concept_id"] != owner["concept_id"]:
                raise ValueError(f"阶段三别名跨概念冲突：{name}")
            if name != owner["canonical_name_zh"] and name not in owner.setdefault("aliases", []):
                owner["aliases"].append(name)
                owner["aliases"] = sorted(set(owner["aliases"]))
            alias_owners[normalize_alias(name)] = owner
            extended.append({"concept_id": owner["concept_id"], "added_alias": name})
            concept_id = owner["concept_id"]
            decision = "mapped_existing_source"
        else:
            concept_id = stable_id("ingredient_stage3", f"{name}|{cluster['base_identity']}")
            previous = alias_owners.get(normalize_alias(name))
            if previous and previous["concept_id"] != concept_id:
                raise ValueError(f"阶段三新概念名称冲突：{name}")
            state = str(chosen.get("preparation_state") or "unspecified")
            variant = {
                "variant_id": stable_id("variant_stage3", f"{concept_id}|{key[0]}|{key[1]}"),
                "display_name_zh": f"{name}（{PREPARATION_LABELS.get(state, state)}）",
                "preparation_state": state,
                "source_version": key[0],
                "fdc_id": key[1],
                "description_contains": chosen["description"],
                "is_default": True,
            }
            item = {
                "concept_id": concept_id,
                "canonical_name_zh": name,
                "category_code": cluster["category_code"],
                "subcategory_code": None,
                "aliases": [],
                "variants": [variant],
            }
            items.append(item)
            source_owners[key] = item
            alias_owners[normalize_alias(name)] = item
            added.append({
                "concept_id": concept_id,
                "canonical_name_zh": name,
                "source_version": key[0],
                "fdc_id": key[1],
            })
            decision = "new_concept"
        decisions.append({
            **selection,
            "decision": decision,
            "concept_id": concept_id,
            "selected_source_version": key[0],
            "selected_fdc_id": key[1],
            "selected_description": chosen["description"],
        })

    items.sort(key=lambda item: str(item["concept_id"]))
    validate_seed_shape(output)
    report = {
        "report_contract": "recipeIngredientStage3IntegrationReport/v1",
        "policy_id": POLICY_ID,
        "catalog_version": catalog_version,
        "base_concept_count": len(base_catalog["items"]),
        "final_concept_count": len(items),
        "selected_group_count": len(selected),
        "selected_occurrence_count": sum(item["occurrence_count"] for item in selected),
        "added_concept_count": len(added),
        "extended_concept_count": len(extended),
        "duplicate_selected_source_count": 0,
        "model_selected_group_count": sum(item["decision_method"] == "dual_pass_model_consensus" for item in selected),
        "model_isolated_group_count": sum(item.get("status") == "isolated" for item in consensus.get("items", [])),
        "added_concepts": added,
        "extended_concepts": extended,
        "decisions": decisions,
    }
    return output, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--stage3-candidates", type=Path, required=True)
    parser.add_argument("--deterministic-decisions", type=Path, required=True)
    parser.add_argument("--model-consensus", type=Path, required=True)
    parser.add_argument("--source-clusters", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inputs = (
        args.sqlite, args.base_catalog, args.stage3_candidates,
        args.deterministic_decisions, args.model_consensus, args.source_clusters,
    )
    if not all(path.is_file() for path in inputs):
        print("阶段三合并输入不完整", file=sys.stderr)
        return 2
    if args.out_catalog.exists() or args.report.exists():
        print("拒绝覆盖阶段三目录或报告", file=sys.stderr)
        return 2
    try:
        values = [json.loads(path.read_text(encoding="utf-8")) for path in inputs[1:]]
        with sqlite3.connect(args.sqlite) as conn:
            catalog, report = integrate_stage3(conn, *values, args.catalog_version)
        for path in (args.out_catalog, args.report):
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        for path in (args.out_catalog, args.report):
            path.unlink(missing_ok=True)
        print(f"阶段三目录合并失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
