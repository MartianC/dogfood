#!/usr/bin/env python3
"""整理尚未进入目录的 USDA 营养档案，按基础身份去重并生成完整目录候选。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

from cluster_source_food_identities import english_key, parse_identity
from select_preferred_ingredient_sources import candidate_score, score_explanation


POLICY_ID = "completeUsdaIngredientCatalog/v1"
MAX_CANONICAL_NAME_LENGTH = 24
SOURCE_VERSIONS = {"foundation", "sr_legacy_2018_04"}
BASE_CATEGORY_CODES = {
    1: "dairy",
    4: "oil",
    5: "meat",
    9: "fruit",
    10: "meat",
    11: "vegetable",
    12: "legume",
    13: "meat",
    15: "seafood",
    16: "legume",
    17: "meat",
    19: "carb",
    20: "carb",
}
SWEET_BASE_IDENTITIES = {
    "cocoa_powder", "fructose", "glucose", "honey", "molasses", "sugar",
    "sugars", "syrup", "syrups",
}
COMPOSITE_BASE_PATTERN = re.compile(
    r"(?:baby|cand|cake|cookie|dessert|dressing|formula|ice_cream|meal|pie|"
    r"pizza|pudding|restaurant|sandwich|snack|soup|waffle)"
)
PART_LABELS = {
    "back": "背肉", "brain": "脑", "breast": "胸肉", "chuck": "肩胛",
    "feet": "脚", "foot": "脚", "heart": "心", "hock": "肘",
    "kidney": "肾", "leg": "腿", "liver": "肝", "loin": "里脊",
    "neck": "颈", "rib": "肋", "ribs": "肋", "round": "后腿",
    "shoulder": "肩", "sirloin": "西冷", "tenderloin": "菲力",
    "thigh": "大腿", "tongue": "舌", "wing": "翅",
}
STATE_LABELS = {
    "raw": "生", "fresh": "鲜", "dry": "干制", "dried": "干制",
    "frozen": "冷冻", "boiled": "水煮", "cooked": "熟制",
    "canned": "罐装", "unspecified": "来源状态未注明",
}
LEADING_STATE_PATTERN = re.compile(
    r"^(?:生鲜|生的|生|鲜|冷冻|速冻|罐装|煮熟|熟制|熟)(?=[\u4e00-\u9fff]{2,})"
)
BROAD_IDENTITIES_REQUIRING_SUBTYPE = {
    "beans", "beef", "cabbage", "cheese", "chicken", "duck", "flour",
    "eggs", "goose", "lamb", "lettuce", "melons", "milk", "mushroom",
    "noodles", "oil", "pasta", "peas", "pepper", "pork", "rice", "seaweed",
    "squash", "turkey", "watermelon", "wheat_flour", "yogurt",
}
IGNORED_SUBTYPE_PATTERN = re.compile(
    r"^(?:all(?:_grades)?|australian|boneless|broilers?_or_fryers?|canned|choice|commercial|composite(?:_of.*)?|"
    r"baked|boiled|braised|broiled|cooked|dry|dried|fresh|fried|frozen|grade_[a-z]|grilled|"
    r"grass_fed|imported|large|lean|meat_and_skin|meat_only|new_zealand|prepared|raw|regular|retail_cuts|roasted|"
    r"seedless|separable_lean(?:_and_fat)?|simmered|skinless|"
    r"select|prime|usda_(?:choice|select|prime)|trimmed(?:_to.*)?|uncooked|unprepared|"
    r"variety_meats_and_by_products|wagyu|with.*|without.*)$"
)
TECHNICAL_NAME_SEGMENT_PATTERN = re.compile(
    r"(?:可分[離离]|仅可分|瘦肉和脂肪|瘦肉和肥肉|修剪到|所有等级|美国农业部|"
    r"固体和液体|肉鸡或油炸锅|原味调味料|"
    r"^(?:生|生的|未煮熟|煮熟|熟制|烤制|烤熟|烤|红烧|炖煮|油炸|煎烤|煎炸|"
    r"无骨|带骨|去骨|去皮|带皮|只有肉|肉和皮|选择|精选|优质|罐装|冷冻|"
    r"沥干的固体|未准备|新鲜|进口|澳大利亚|新西兰)$)"
)
LEADING_SOURCE_MODIFIER_PATTERN = re.compile(
    r"^(?:(?:生鲜|生的|生|鲜|冷冻|速冻|罐装|煮熟|熟制|熟|烤制|烤熟|烤|"
    r"去骨|无骨|带骨|去皮|带皮)+)"
)
FORBIDDEN_CANONICAL_NAME_PATTERN = re.compile(
    r"(?:可分[離离]|修剪到|所有等级|美国农业部食品分配计划)"
)


def stable_id(prefix: str, *values: str) -> str:
    raw = "\0".join(values)
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:20]}"


def normalized_alias(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def preparation_state_label(value: str) -> str:
    return STATE_LABELS.get(value, "来源状态未注明")


def identity_subtype(description: str, base_identity: str, part: str | None) -> str | None:
    is_animal_cut = any(
        base_identity.startswith(f"{prefix}_")
        for prefix in ("beef", "chicken", "duck", "goose", "lamb", "pork", "turkey")
    )
    if base_identity not in BROAD_IDENTITIES_REQUIRING_SUBTYPE and not is_animal_cut:
        return None
    normalized_description = description.lower()
    if base_identity == "milk":
        if re.search(r"\b(?:dry|dried|powder)\b", normalized_description):
            return "dry"
        if "evaporated" in normalized_description:
            return "evaporated"
        if "condensed" in normalized_description:
            return "condensed"
        return None
    segments = [english_key(value) for value in description.split(",")[1:]]
    significant: list[str] = []
    for segment in segments:
        if (
            not segment
            or segment == english_key(str(part or ""))
            or IGNORED_SUBTYPE_PATTERN.match(segment)
        ):
            continue
        significant.append(segment)
        if len(significant) == 2:
            break
    return "_".join(significant) or None


def combine_skin_bone_state(row: dict[str, Any]) -> str | None:
    values = [
        value for value in (str(row.get("bone_state") or ""), str(row.get("skin_state") or ""))
        if value and value != "unknown"
    ]
    return "_".join(values) or None


def load_usda_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.source_version, f.fdc_id, f.food_category_id, f.description,
               GROUP_CONCAT(l.name, char(31)) AS localized_names,
               COUNT(n.source_record_id) AS nutrient_count
        FROM source_food f
        JOIN source_release r ON r.release_id = f.source_release_id
        LEFT JOIN source_localized_name l
          ON l.source_release_id = f.source_release_id
         AND l.fdc_id = f.fdc_id AND l.locale = 'zh-CN'
        LEFT JOIN source_food_nutrient n
          ON n.source_release_id = f.source_release_id AND n.fdc_id = f.fdc_id
        WHERE r.source_version IN ('foundation', 'sr_legacy_2018_04')
        GROUP BY r.source_version, f.fdc_id, f.food_category_id, f.description
        ORDER BY r.source_version, f.fdc_id
        """
    ).fetchall()
    result: list[dict[str, Any]] = []
    for source_version, fdc_id, category_id, description, names, nutrient_count in rows:
        parsed = parse_identity(str(description), int(category_id) if category_id is not None else None)
        category_code = BASE_CATEGORY_CODES.get(int(category_id)) if category_id is not None else None
        subtype = identity_subtype(
            str(description), str(parsed["base_identity"]), parsed.get("part")
        )
        cluster_key = "|".join([
            str(category_code or "unsupported"), str(parsed["base_identity"]),
            str(parsed.get("species") or ""), str(parsed.get("part") or ""),
            str(subtype or ""),
        ])
        result.append({
            **parsed,
            "source_version": str(source_version),
            "fdc_id": int(fdc_id),
            "food_category_id": int(category_id) if category_id is not None else None,
            "category_code": category_code,
            "description": str(description),
            "localized_names": sorted({
                str(name).strip() for name in str(names or "").split(chr(31)) if str(name).strip()
            }),
            "nutrient_count": int(nutrient_count),
            "identity_subtype": subtype,
            "cluster_key": cluster_key,
            "cluster_id": stable_id("usda_identity", cluster_key),
        })
    return result


def candidate_from_row(row: dict[str, Any], canonical_name: str) -> dict[str, Any]:
    source_version = str(row["source_version"])
    fdc_id = int(row["fdc_id"])
    return {
        "variant_id": stable_id("variant_usda", source_version, str(fdc_id)),
        "display_name_zh": f"{canonical_name}（{preparation_state_label(str(row['preparation_state']))}）",
        "preparation_state": row["preparation_state"],
        "part_or_cut": row.get("part"),
        "skin_bone_state": combine_skin_bone_state(row),
        "source_version": source_version,
        "fdc_id": fdc_id,
        "description_contains": row["description"],
        "is_default": False,
        "source_description": row["description"],
        "nutrient_count": int(row["nutrient_count"]),
    }


def preferred_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [candidate_from_row(row, "候选") for row in rows if int(row["nutrient_count"]) > 0]
    if not candidates:
        raise ValueError("USDA 身份簇没有可用营养记录")
    selected = sorted(candidates, key=candidate_score)[0]
    key = (str(selected["source_version"]), int(selected["fdc_id"]))
    return next(row for row in rows if (str(row["source_version"]), int(row["fdc_id"])) == key)


def simplified_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    head = re.split(r"[,，、;；]", normalized, maxsplit=1)[0].strip()
    head = LEADING_STATE_PATTERN.sub("", head).strip()
    return head or normalized


def concise_name_segments(value: str) -> list[str]:
    """从 USDA 本地化来源描述中保留食材身份，去掉来源技术元数据。"""
    normalized = unicodedata.normalize("NFKC", value).strip()
    normalized = re.sub(
        r"[（(](?:包括美国农业部|includes foods for usda)[^）)]*[）)]",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    parts = [part.strip() for part in re.split(r"[,，、;；]", normalized) if part.strip()]
    result: list[str] = []
    for part in parts:
        part = re.sub(r"[（(][^）)]*[）)]", "", part).strip()
        part = LEADING_SOURCE_MODIFIER_PATTERN.sub("", part).strip()
        if not part or TECHNICAL_NAME_SEGMENT_PATTERN.search(part):
            continue
        if part not in result:
            result.append(part)
    return result


def valid_catalog_name(value: str) -> bool:
    return (
        bool(re.search(r"[\u4e00-\u9fff]", value))
        and len(value) <= MAX_CANONICAL_NAME_LENGTH
        and FORBIDDEN_CANONICAL_NAME_PATTERN.search(value) is None
    )


def catalog_name_candidates(row: dict[str, Any]) -> list[str]:
    names = sorted(
        (name for name in row.get("localized_names", []) if re.search(r"[\u4e00-\u9fff]", name)),
        key=lambda value: (len(simplified_name(value)), len(value), value),
    )
    if not names:
        return []
    segments = concise_name_segments(names[0])
    base = simplified_name(names[0])
    part = PART_LABELS.get(str(row.get("part") or ""))
    candidates: list[str] = []
    base_identity = str(row.get("base_identity") or "")
    needs_specific_name = (
        base_identity in BROAD_IDENTITIES_REQUIRING_SUBTYPE
        or base_identity.startswith(("nuts_", "seeds_", "fish_", "mollusks_", "crustaceans_"))
        or any(base_identity.startswith(f"{prefix}_") for prefix in (
            "beef", "chicken", "duck", "goose", "lamb", "pork", "turkey"
        ))
    )
    if not needs_specific_name:
        candidates.append(base)
    if segments:
        for count in range(len(segments), 0, -1):
            candidates.append("".join(segments[:count]))
    if part and part not in base:
        candidates.append(f"{base}（{part}）")
    candidates.append(base)
    return [
        value for value in dict.fromkeys(candidates)
        if valid_catalog_name(value)
    ]


def choose_name(row: dict[str, Any], occupied: set[str]) -> str | None:
    candidates = catalog_name_candidates(row)
    for candidate in candidates:
        normalized = normalized_alias(candidate)
        if normalized and normalized not in occupied:
            return candidate
    return None


def is_catalog_identity(rows: list[dict[str, Any]]) -> tuple[bool, str]:
    first = rows[0]
    if first.get("category_code") is None:
        return False, "unsupported_or_composite_category"
    if not any(int(row["nutrient_count"]) > 0 for row in rows):
        return False, "missing_nutrients"
    base_identity = str(first["base_identity"])
    if int(first.get("food_category_id") or 0) == 19 and base_identity not in SWEET_BASE_IDENTITIES:
        return False, "composite_sweet_food"
    if COMPOSITE_BASE_PATTERN.search(base_identity):
        return False, "composite_food_identity"
    return True, "base_food_identity"


def source_key_from_variant(variant: dict[str, Any]) -> tuple[str, int]:
    return str(variant["source_version"]), int(variant["fdc_id"])


def prepare_catalog(
    conn: sqlite3.Connection,
    base_catalog: dict[str, Any],
    catalog_version: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    rows = load_usda_rows(conn)
    row_by_key = {(str(row["source_version"]), int(row["fdc_id"])): row for row in rows}
    clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        clusters[str(row["cluster_id"])].append(row)

    output = deepcopy(base_catalog)
    output["catalog_version"] = catalog_version
    output["catalog_schema_version"] = 2
    output["complete_usda_integration"] = {
        "policy_id": POLICY_ID,
        "base_catalog_version": str(base_catalog["catalog_version"]),
        "source_versions": sorted(SOURCE_VERSIONS),
    }
    items_by_id = {str(item["concept_id"]): item for item in output["items"]}

    owners_by_cluster: dict[str, set[str]] = defaultdict(set)
    source_owner_by_key: dict[tuple[str, int], str] = {}
    existing_source_keys: set[tuple[str, int]] = set()
    for item in output["items"]:
        for variant in item.get("variants", []):
            key = source_key_from_variant(variant)
            if key not in row_by_key:
                continue
            existing_source_keys.add(key)
            concept_id = str(item["concept_id"])
            source_owner_by_key[key] = concept_id
            owners_by_cluster[str(row_by_key[key]["cluster_id"])].add(concept_id)

    merged_concept_redirects: dict[str, str] = {}
    for cluster_id, owners in sorted(owners_by_cluster.items()):
        if len(owners) <= 1:
            continue
        owner_candidates = []
        for owner in sorted(owners):
            item = items_by_id[owner]
            for variant in item.get("variants", []):
                key = source_key_from_variant(variant)
                row = row_by_key.get(key)
                if row and str(row["cluster_id"]) == cluster_id:
                    owner_candidates.append((candidate_score(candidate_from_row(row, str(item["canonical_name_zh"]))), owner))
        if not owner_candidates:
            continue
        winner = min(owner_candidates)[1]
        winner_item = items_by_id[winner]
        merged_aliases = list(winner_item.get("aliases", []))
        seen_aliases = {
            normalized_alias(str(value))
            for value in [winner_item["canonical_name_zh"], *merged_aliases]
        }
        for loser in sorted(owners - {winner}):
            loser_item = items_by_id.pop(loser)
            merged_concept_redirects[loser] = winner
            for value in [loser_item["canonical_name_zh"], *loser_item.get("aliases", [])]:
                normalized = normalized_alias(str(value))
                if normalized and normalized not in seen_aliases:
                    seen_aliases.add(normalized)
                    merged_aliases.append(str(value))
        winner_item["aliases"] = merged_aliases
        owners_by_cluster[cluster_id] = {winner}

    if merged_concept_redirects:
        output["items"] = [
            item for item in output["items"]
            if str(item["concept_id"]) not in merged_concept_redirects
        ]
    occupied_aliases = {
        normalized_alias(str(alias))
        for item in output["items"]
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]
    }
    alias_owners = {
        normalized_alias(str(alias)): str(item["concept_id"])
        for item in output["items"]
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]
    }

    classifications: Counter[str] = Counter()
    isolated: list[dict[str, Any]] = []
    integrated_clusters: list[dict[str, Any]] = []
    new_concept_ids: list[str] = []
    changed_source_concept_ids: list[str] = []
    candidate_source_keys: set[tuple[str, int]] = set()

    for cluster_id, cluster_rows in sorted(clusters.items()):
        remaining_rows = [
            row for row in cluster_rows
            if (str(row["source_version"]), int(row["fdc_id"])) not in existing_source_keys
        ]
        classifications["existing_catalog_source"] += len(cluster_rows) - len(remaining_rows)
        if not remaining_rows:
            continue
        missing_nutrient_rows = [row for row in remaining_rows if int(row["nutrient_count"]) <= 0]
        remaining_rows = [row for row in remaining_rows if int(row["nutrient_count"]) > 0]
        if missing_nutrient_rows:
            classifications["missing_nutrients"] += len(missing_nutrient_rows)
            isolated.append({
                "cluster_id": cluster_id,
                "base_identity": cluster_rows[0]["base_identity"],
                "reason": "missing_nutrients",
                "source_count": len(missing_nutrient_rows),
                "sources": [
                    {"source_version": row["source_version"], "fdc_id": row["fdc_id"], "description": row["description"]}
                    for row in missing_nutrient_rows
                ],
            })
        if not remaining_rows:
            continue
        eligible, reason = is_catalog_identity(cluster_rows)
        owners = owners_by_cluster.get(cluster_id, set())
        if len(owners) > 1:
            eligible, reason = False, "existing_identity_conflict"
        if not eligible:
            classifications[reason] += len(remaining_rows)
            isolated.append({
                "cluster_id": cluster_id,
                "base_identity": cluster_rows[0]["base_identity"],
                "reason": reason,
                "source_count": len(remaining_rows),
                "sources": [
                    {"source_version": row["source_version"], "fdc_id": row["fdc_id"], "description": row["description"]}
                    for row in remaining_rows
                ],
            })
            continue

        selected_row = preferred_row(cluster_rows)
        owner = next(iter(owners), None)
        if owner:
            item = items_by_id[owner]
            canonical_name = str(item["canonical_name_zh"])
        else:
            name_candidates = catalog_name_candidates(selected_row)
            most_specific_name = name_candidates[0] if name_candidates else None
            existing_name_owner = (
                alias_owners.get(normalized_alias(most_specific_name))
                if most_specific_name else None
            )
            canonical_name = None if existing_name_owner else choose_name(selected_row, occupied_aliases)
            if canonical_name is None:
                if not name_candidates:
                    classifications["catalog_name_quality_gate"] += len(remaining_rows)
                    isolated.append({
                        "cluster_id": cluster_id,
                        "base_identity": cluster_rows[0]["base_identity"],
                        "reason": "catalog_name_quality_gate",
                        "source_count": len(remaining_rows),
                        "sources": [
                            {"source_version": row["source_version"], "fdc_id": row["fdc_id"], "description": row["description"]}
                            for row in remaining_rows
                        ],
                    })
                    continue
                if existing_name_owner:
                    owner = existing_name_owner
                    item = items_by_id[owner]
                    canonical_name = str(item["canonical_name_zh"])
                else:
                    classifications["localized_identity_conflict"] += len(remaining_rows)
                    isolated.append({
                        "cluster_id": cluster_id,
                        "base_identity": cluster_rows[0]["base_identity"],
                        "reason": "localized_identity_conflict",
                        "source_count": len(remaining_rows),
                        "sources": [
                            {"source_version": row["source_version"], "fdc_id": row["fdc_id"], "description": row["description"]}
                            for row in remaining_rows
                        ],
                    })
                    continue
            else:
                occupied_aliases.add(normalized_alias(canonical_name))
                concept_id = stable_id("ingredient_usda", str(cluster_rows[0]["cluster_key"]))
                item = {
                    "concept_id": concept_id,
                    "canonical_name_zh": canonical_name,
                    "category_code": cluster_rows[0]["category_code"],
                    "subcategory_code": None,
                    "aliases": [],
                    "nutrition_candidates": [],
                }
                output["items"].append(item)
                items_by_id[concept_id] = item
                alias_owners[normalized_alias(canonical_name)] = concept_id
                new_concept_ids.append(concept_id)

        selected_key = (str(selected_row["source_version"]), int(selected_row["fdc_id"]))
        item_source_keys = {
            source_key_from_variant(value)
            for value in item.get("nutrition_candidates", item.get("variants", []))
        }
        if (
            str(item["concept_id"]) not in new_concept_ids
            and selected_key not in item_source_keys
            and str(item["concept_id"]) not in changed_source_concept_ids
        ):
            changed_source_concept_ids.append(str(item["concept_id"]))

        existing_candidates = item.get("nutrition_candidates", item.get("variants", []))
        candidates_by_key = {source_key_from_variant(value): deepcopy(value) for value in existing_candidates}
        usable_cluster_rows = [row for row in cluster_rows if int(row["nutrient_count"]) > 0]
        for row in usable_cluster_rows:
            key = (str(row["source_version"]), int(row["fdc_id"]))
            if key not in candidates_by_key:
                candidates_by_key[key] = candidate_from_row(row, canonical_name)
            candidate_source_keys.add(key)
        item["nutrition_candidates"] = [candidates_by_key[key] for key in sorted(candidates_by_key)]
        item.pop("variants", None)
        classifications["catalog_candidate_source"] += len(remaining_rows)
        integrated_clusters.append({
            "cluster_id": cluster_id,
            "concept_id": item["concept_id"],
            "canonical_name_zh": canonical_name,
            "new_concept": str(item["concept_id"]) in new_concept_ids,
            "source_count": len(usable_cluster_rows),
            "preferred_source": {
                "source_version": selected_row["source_version"],
                "fdc_id": selected_row["fdc_id"],
                "description": selected_row["description"],
                "score": score_explanation(candidate_from_row(selected_row, canonical_name)),
            },
        })

    output["items"].sort(key=lambda item: str(item["concept_id"]))
    invalid_names = [
        str(item["canonical_name_zh"])
        for item in output["items"]
        if not valid_catalog_name(str(item["canonical_name_zh"]))
    ]
    if invalid_names:
        raise ValueError(f"目录标准名未通过质量门禁：{invalid_names[:5]}")
    output["complete_usda_integration"]["merged_concept_redirects"] = dict(
        sorted(merged_concept_redirects.items())
    )
    remaining_count = len(rows) - len(existing_source_keys)
    accounted_remaining = sum(
        count for key, count in classifications.items() if key != "existing_catalog_source"
    )
    if accounted_remaining != remaining_count:
        raise ValueError(
            f"USDA 剩余来源未完整归类：remaining={remaining_count}, accounted={accounted_remaining}"
        )
    report = {
        "report_contract": "completeUsdaIngredientCatalogReport/v1",
        "policy_id": POLICY_ID,
        "base_catalog_version": str(base_catalog["catalog_version"]),
        "catalog_version": catalog_version,
        "source_food_count": len(rows),
        "existing_catalog_source_count": len(existing_source_keys),
        "remaining_source_count": remaining_count,
        "accounted_remaining_source_count": accounted_remaining,
        "source_cluster_count": len(clusters),
        "integrated_cluster_count": len(integrated_clusters),
        "new_concept_count": len(new_concept_ids),
        "merged_existing_concept_count": len(merged_concept_redirects),
        "merged_existing_concept_redirects": dict(sorted(merged_concept_redirects.items())),
        "changed_source_concept_count": len(changed_source_concept_ids),
        "candidate_source_count": len(candidate_source_keys),
        "isolated_cluster_count": len(isolated),
        "classification_counts": dict(sorted(classifications.items())),
        "integrated_clusters": integrated_clusters,
        "isolated_clusters": isolated,
    }
    safety_review = {
        "contract": "canineIngredientSafetyReviewQueue/v1",
        "catalog_version": catalog_version,
        "review_policy": "新增 USDA 身份在公开证据复核前保持 unknown，不自动生成 allowed 或 blocked。",
        "items": [
            {
                "concept_id": concept_id,
                "canonical_name_zh": items_by_id[concept_id]["canonical_name_zh"],
                "category_code": items_by_id[concept_id]["category_code"],
                "review_status": "pending",
                "default_decision": "unknown",
                "reason": "新增 USDA 标准食材身份尚未完成犬食安全证据复核。",
                "review_scope": "new_concept",
            }
            for concept_id in sorted(new_concept_ids)
        ] + [
            {
                "concept_id": concept_id,
                "canonical_name_zh": items_by_id[concept_id]["canonical_name_zh"],
                "category_code": items_by_id[concept_id]["category_code"],
                "review_status": "pending",
                "default_decision": "unknown",
                "reason": "唯一营养来源发生变化，旧形态级策略不能直接继承。",
                "review_scope": "nutrition_source_changed",
            }
            for concept_id in sorted(changed_source_concept_ids)
        ],
    }
    return output, report, safety_review


def encoded(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--base-catalog", type=Path, required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-candidate", type=Path, required=True)
    parser.add_argument("--out-report", type=Path, required=True)
    parser.add_argument("--out-safety-review", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inputs = (args.sqlite, args.base_catalog)
    outputs = (args.out_candidate, args.out_report, args.out_safety_review)
    if not all(path.is_file() for path in inputs):
        print("USDA 全量目录输入不完整", file=sys.stderr)
        return 2
    if any(path.exists() for path in outputs):
        print("拒绝覆盖已有 USDA 全量目录产物", file=sys.stderr)
        return 2
    try:
        base_catalog = json.loads(args.base_catalog.read_text(encoding="utf-8"))
        with sqlite3.connect(args.sqlite) as conn:
            candidate, report, safety_review = prepare_catalog(
                conn, base_catalog, args.catalog_version
            )
        for path in outputs:
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_candidate.write_text(encoded(candidate), encoding="utf-8")
        args.out_report.write_text(encoded(report), encoding="utf-8")
        args.out_safety_review.write_text(encoded(safety_review), encoding="utf-8")
        print(json.dumps({
            "catalog_version": args.catalog_version,
            "source_foods": report["source_food_count"],
            "remaining_sources": report["remaining_source_count"],
            "accounted_remaining_sources": report["accounted_remaining_source_count"],
            "integrated_clusters": report["integrated_cluster_count"],
            "new_concepts": report["new_concept_count"],
            "safety_reviews": len(safety_review["items"]),
        }, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, KeyError, json.JSONDecodeError) as error:
        for path in outputs:
            path.unlink(missing_ok=True)
        print(f"USDA 全量目录准备失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
