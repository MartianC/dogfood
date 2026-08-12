#!/usr/bin/env python3
"""建立 USDA 来源基础身份簇，并为阶段二原料选择唯一来源簇。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from discover_standard_ingredient_concepts import CATEGORY_BY_USDA_ID, preparation_state
from recipe_ingredient_normalization import normalize_text
from select_preferred_ingredient_sources import candidate_score, score_explanation


POLICY_ID = "sourceFoodBaseIdentityClustering/v2"
ROUTE_CONTRACT = "recipeIngredientStage1Route/v1"
CLUSTER_CONTRACT = "sourceFoodIdentityClusters/v1"
CANDIDATE_CONTRACT = "recipeIngredientStage2Candidates/v1"
DECISION_CONTRACT = "recipeIngredientStage2Decisions/v1"
REPORT_CONTRACT = "recipeIngredientStage2Report/v1"

IDENTITY_EXPECTATIONS = {
    "牛奶": ("milk", "cow"),
    "纯牛奶": ("milk", "cow"),
    "鲜奶": ("milk", "cow"),
    "鲜牛奶": ("milk", "cow"),
    "全脂牛奶": ("milk", "cow"),
    "低脂牛奶": ("milk", "cow"),
    "脱脂牛奶": ("milk", "cow"),
    "木耳": ("wood_ear_mushroom", None),
    "黑木耳": ("wood_ear_mushroom", None),
    "干木耳": ("wood_ear_mushroom", None),
    "芝麻": ("sesame", None),
    "白芝麻": ("sesame", None),
    "黑芝麻": ("sesame", None),
    "可可粉": ("cocoa_powder", None),
    "柠檬": ("lemon", None),
    "玉米": ("corn", None),
    "菠萝": ("pineapple", None),
    "冬瓜": ("winter_melon", None),
    "椰浆": ("coconut_milk", None),
    "玉米淀粉": ("cornstarch", None),
    "酸奶": ("yogurt", None),
}
SINGULAR_BASES = {
    "lemons": "lemon",
    "pineapples": "pineapple",
    "mushrooms": "mushroom",
    "peppers": "pepper",
    "tomatoes": "tomato",
    "potatoes": "potato",
    "carrots": "carrot",
    "onions": "onion",
    "apples": "apple",
    "bananas": "banana",
    "peaches": "peach",
    "pears": "pear",
    "strawberries": "strawberry",
}
PART_TERMS = (
    "breast", "wing", "thigh", "leg", "liver", "heart", "kidney", "rib",
    "ribs", "loin", "tenderloin", "shoulder", "hock", "feet", "foot",
    "neck", "back", "chuck", "round", "sirloin", "tongue", "brain",
)
ADDED_PROCESSING_TERMS = (
    "salted", "with salt", "sweetened", "fortified", "flavored", "smoked",
    "cured", "breaded", "fried", "with sauce", "canned", "prepared",
)


def english_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def parse_identity(description: str, category_id: int | None) -> dict[str, Any]:
    text = description.lower().strip()
    category = CATEGORY_BY_USDA_ID.get(category_id)
    species = next(
        (value for term, value in (
            ("goat", "goat"), ("sheep", "sheep"), ("human", "human"),
            ("chicken", "chicken"), ("turkey", "turkey"), ("pork", "pig"),
            ("beef", "cattle"), ("lamb", "sheep"), ("duck", "duck"),
            ("goose", "goose"),
        ) if re.search(rf"\b{term}\b", text)),
        None,
    )
    part = next((term for term in PART_TERMS if re.search(rf"\b{term}\b", text)), None)

    if re.search(r"\b(?:jew'?s ear|wood ear|cloud ears?|auricularia)\b", text):
        base_identity = "wood_ear_mushroom"
    elif text.startswith("milk,"):
        if "buttermilk" in text:
            base_identity = "buttermilk"
        else:
            base_identity = "milk"
            species = species or "cow"
    elif re.match(r"^seeds?,\s*sesame", text):
        if re.search(r"sesame (?:butter|paste)|tahini", text):
            base_identity = "sesame_butter"
        elif re.search(r"sesame (?:flour|meal)", text):
            base_identity = "sesame_flour"
        else:
            base_identity = "sesame"
    elif re.match(r"^cocoa,\s*dry powder", text):
        base_identity = "cocoa_powder"
    elif re.match(r"^corn(?:,|$)", text):
        base_identity = "corn"
    elif re.match(r"^lemons?(?:,|$)", text):
        base_identity = "lemon"
    elif re.match(r"^pineapple(?:s)?(?:,|$)", text):
        base_identity = "pineapple"
    elif re.match(r"^(?:waxgourd|wax gourd|winter melon)(?:,|$)", text):
        base_identity = "winter_melon"
    elif re.match(r"^(?:coconut milk|nuts?,\s*coconut milk)(?:,|$)", text):
        base_identity = "coconut_milk"
    else:
        segments = [english_key(segment) for segment in description.split(",") if english_key(segment)]
        lead = segments[0] if segments else "unknown"
        base_identity = SINGULAR_BASES.get(lead, lead)
        if lead in {"seeds", "seed", "nuts", "nut", "fish", "mollusks", "crustaceans"} and len(segments) > 1:
            base_identity = f"{lead}_{segments[1]}"
        elif lead in {"beef", "pork", "chicken", "turkey", "lamb", "duck", "goose"} and part:
            base_identity = f"{lead}_{part}"

    state = preparation_state(description)
    if (
        base_identity == "milk"
        and state == "unspecified"
        and not re.search(r"\b(?:dry|dried|canned|evaporated|condensed)\b", text)
    ):
        state = "fresh"
    bone_state = (
        "boneless" if re.search(r"\b(?:boneless|meat only)\b", text)
        else "bone_in" if re.search(r"\b(?:with bone|bone-in|including bone)\b", text)
        else "unknown"
    )
    skin_state = (
        "skinless" if re.search(r"\b(?:skinless|without skin)\b", text)
        else "skin_on" if re.search(r"\b(?:with skin|skin on)\b", text)
        else "unknown"
    )
    processing = [term for term in ADDED_PROCESSING_TERMS if term in text]
    cluster_key = "|".join(
        [str(category or "unsupported"), base_identity, str(species or ""), str(part or "")]
    )
    return {
        "base_identity": base_identity,
        "species": species,
        "part": part,
        "preparation_state": state,
        "bone_state": bone_state,
        "skin_state": skin_state,
        "added_processing": processing,
        "category_code": category,
        "cluster_id": stable_id("source_cluster", cluster_key),
        "cluster_key": cluster_key,
    }


def load_source_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.source_version, f.fdc_id, f.food_category_id, f.description,
               GROUP_CONCAT(l.name, char(31)) AS localized_names,
               COUNT(n.rowid) AS nutrient_count
        FROM source_food f
        JOIN source_release r ON r.release_id = f.source_release_id
        LEFT JOIN source_localized_name l
          ON l.source_release_id = f.source_release_id
         AND l.fdc_id = f.fdc_id AND l.locale = 'zh-CN'
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id = f.source_release_id AND n.fdc_id = f.fdc_id
        GROUP BY r.source_version, f.fdc_id, f.food_category_id, f.description
        ORDER BY r.source_version, f.fdc_id
        """
    ).fetchall()
    result = []
    for version, fdc_id, category_id, description, localized_names, nutrient_count in rows:
        parsed = parse_identity(str(description), int(category_id) if category_id is not None else None)
        names = sorted({str(name) for name in str(localized_names or "").split(chr(31)) if name})
        result.append({
            "source_version": str(version),
            "fdc_id": int(fdc_id),
            "food_category_id": int(category_id) if category_id is not None else None,
            "description": str(description),
            "localized_names": names,
            "normalized_localized_names": [normalize_text(name) for name in names],
            "nutrient_count": int(nutrient_count),
            **parsed,
        })
    return result


def load_route(path: Path, expected_route: str) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("contract") != ROUTE_CONTRACT or payload.get("route") != expected_route:
        raise ValueError(f"阶段一路由合同不匹配：{expected_route}")
    return list(payload.get("items", []))


def build_candidate_indexes(
    source_rows: list[dict[str, Any]],
) -> tuple[dict[tuple[str, str | None], list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    identity_index: dict[tuple[str, str | None], list[dict[str, Any]]] = defaultdict(list)
    localized_index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in source_rows:
        identity_index[(str(row["base_identity"]), row["species"])].append(row)
        if row["species"] is not None:
            identity_index[(str(row["base_identity"]), None)].append(row)
        for localized in row["normalized_localized_names"]:
            localized_index[localized].append(row)
            boundaries = [
                position for separator in (",", "，", "(", "（")
                if (position := localized.find(separator)) > 0
            ]
            if boundaries:
                localized_index[localized[: min(boundaries)]].append(row)
    return identity_index, localized_index


def candidate_rows(
    item: dict[str, Any],
    identity_index: dict[tuple[str, str | None], list[dict[str, Any]]],
    localized_index: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    name = normalize_text(str(item["cleaned_name"]))
    expectation = IDENTITY_EXPECTATIONS.get(name)
    if expectation:
        base_identity, species = expectation
        return [
            row for row in identity_index.get((base_identity, species), [])
            if row["category_code"] is not None
        ]
    return list(localized_index.get(name, []))


def selectable_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "source_description": row["description"],
        "preparation_state": row["preparation_state"],
        "is_default": False,
        "variant_id": f"source_{row['source_version']}_{row['fdc_id']}",
    }


def stage2_source_score(row: dict[str, Any]) -> tuple[Any, ...]:
    """在通用可烹调排序前，优先选择基础身份最自然的来源形态。"""
    description = str(row["description"]).lower()
    identity_rank = 0
    if row["base_identity"] == "milk":
        if re.match(r"^milk,\s*(?:producer|whole)\b", description):
            identity_rank = 0
        elif re.search(r"\bfluid\b", description):
            identity_rank = 1
        else:
            identity_rank = 2
    return (identity_rank, *candidate_score(row))


def build_stage2(
    source_rows: list[dict[str, Any]],
    recipe_items: list[dict[str, Any]],
    catalog: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in source_rows:
        clusters[str(row["cluster_id"])].append(row)
    identity_index, localized_index = build_candidate_indexes(source_rows)

    source_owners: dict[tuple[str, int], str] = {}
    for concept in catalog.get("items", []):
        for variant in concept.get("variants", concept.get("nutrition_candidates", [])):
            source_owners[(str(variant["source_version"]), int(variant["fdc_id"]))] = str(concept["concept_id"])

    candidates: list[dict[str, Any]] = []
    accepted: dict[str, list[dict[str, Any]]] = defaultdict(list)
    reason_terms: dict[str, int] = defaultdict(int)
    reason_occurrences: dict[str, int] = defaultdict(int)
    for item in recipe_items:
        rows = candidate_rows(item, identity_index, localized_index)
        candidate_cluster_ids = sorted({str(row["cluster_id"]) for row in rows})
        controlled_identity = normalize_text(str(item["cleaned_name"])) in IDENTITY_EXPECTATIONS
        if not rows:
            reason = "no_source_candidate"
        elif len(candidate_cluster_ids) != 1:
            reason = "multiple_source_identities"
        elif rows[0]["category_code"] is None:
            reason = "unsupported_source_category"
        elif not any(int(row["nutrient_count"]) > 0 for row in rows):
            reason = "source_missing"
        elif not controlled_identity:
            reason = "bridge_only_unverified"
        else:
            reason = "unique_source_identity"
            accepted[candidate_cluster_ids[0]].append(item)
        reason_terms[reason] += 1
        reason_occurrences[reason] += int(item["occurrence_count"])
        candidates.append({
            **item,
            "stage2_status": reason,
            "candidate_cluster_ids": candidate_cluster_ids,
            "candidate_source_count": len(rows),
        })

    decisions = []
    selected_sources: set[tuple[str, int]] = set()
    for cluster_id, mentions in sorted(accepted.items()):
        rows = clusters[cluster_id]
        selectable = [row for row in rows if int(row["nutrient_count"]) > 0]
        selected = sorted((selectable_row(row) for row in selectable), key=stage2_source_score)[0]
        source_key = (str(selected["source_version"]), int(selected["fdc_id"]))
        if source_key in selected_sources:
            raise ValueError(f"阶段二重复选择营养来源：{source_key}")
        selected_sources.add(source_key)
        existing_owner = source_owners.get(source_key)
        decisions.append({
            "cluster_id": cluster_id,
            "base_identity": selected["base_identity"],
            "species": selected["species"],
            "part": selected["part"],
            "category_code": selected["category_code"],
            "decision": "mapped_existing_source" if existing_owner else "new_source_cluster",
            "existing_concept_id": existing_owner,
            "recipe_terms": sorted(
                ({"cleaned_name": item["cleaned_name"], "occurrence_count": item["occurrence_count"]} for item in mentions),
                key=lambda item: (-int(item["occurrence_count"]), str(item["cleaned_name"])),
            ),
            "recipe_occurrence_count": sum(int(item["occurrence_count"]) for item in mentions),
            "source_candidate_count": len(selectable),
            "selected_source": {
                "source_version": selected["source_version"],
                "fdc_id": selected["fdc_id"],
                "description": selected["description"],
                "preparation_state": selected["preparation_state"],
                "score": score_explanation(selected),
            },
        })

    cluster_documents = []
    for cluster_id, rows in sorted(clusters.items()):
        first = rows[0]
        cluster_documents.append({
            "cluster_id": cluster_id,
            "base_identity": first["base_identity"],
            "species": first["species"],
            "part": first["part"],
            "category_code": first["category_code"],
            "source_count": len(rows),
            "sources": [
                {
                    "source_version": row["source_version"],
                    "fdc_id": row["fdc_id"],
                    "description": row["description"],
                    "localized_names": row["localized_names"],
                    "preparation_state": row["preparation_state"],
                    "bone_state": row["bone_state"],
                    "skin_state": row["skin_state"],
                    "added_processing": row["added_processing"],
                }
                for row in rows
            ],
        })

    cluster_document = {"contract": CLUSTER_CONTRACT, "policy_id": POLICY_ID, "items": cluster_documents}
    candidate_document = {"contract": CANDIDATE_CONTRACT, "policy_id": POLICY_ID, "items": candidates}
    decision_document = {"contract": DECISION_CONTRACT, "policy_id": POLICY_ID, "items": decisions}
    report = {
        "report_contract": REPORT_CONTRACT,
        "clustering_policy_id": POLICY_ID,
        "source_food_count": len(source_rows),
        "source_food_with_nutrients_count": sum(
            int(row["nutrient_count"]) > 0 for row in source_rows
        ),
        "source_cluster_count": len(clusters),
        "recipe_term_count": len(recipe_items),
        "recipe_occurrence_count": sum(int(item["occurrence_count"]) for item in recipe_items),
        "status_term_counts": dict(sorted(reason_terms.items())),
        "status_occurrence_counts": dict(sorted(reason_occurrences.items())),
        "accepted_cluster_count": len(decisions),
        "accepted_term_count": sum(len(items) for items in accepted.values()),
        "accepted_occurrence_count": sum(item["recipe_occurrence_count"] for item in decisions),
        "selected_source_count": len(selected_sources),
        "duplicate_selected_source_count": 0,
    }
    return cluster_document, candidate_document, decision_document, report


def encoded(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--source-exact", type=Path, required=True)
    parser.add_argument("--identity-candidates", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not all(path.is_file() for path in (args.sqlite, args.catalog, args.source_exact, args.identity_candidates)):
        print("阶段二输入文件不完整", file=sys.stderr)
        return 2
    if args.out_dir.exists():
        print("拒绝覆盖已有阶段二产物目录", file=sys.stderr)
        return 2
    try:
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        recipe_items = load_route(args.source_exact, "source_exact") + load_route(
            args.identity_candidates, "identity_candidate"
        )
        with sqlite3.connect(args.sqlite) as conn:
            source_rows = load_source_rows(conn)
        clusters, candidates, decisions, report = build_stage2(source_rows, recipe_items, catalog)
        args.out_dir.mkdir(parents=True)
        documents = {
            "source-identity-clusters.json": clusters,
            "mapping-candidates.json": candidates,
            "mapping-decisions.json": decisions,
        }
        report["artifact_sha256"] = {}
        for filename, document in documents.items():
            content = encoded(document)
            (args.out_dir / filename).write_bytes(content)
            report["artifact_sha256"][filename] = hashlib.sha256(content).hexdigest()
        (args.out_dir / "report.json").write_bytes(encoded(report))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        print(f"阶段二来源身份聚类失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
