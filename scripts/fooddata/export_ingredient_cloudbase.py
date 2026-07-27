#!/usr/bin/env python3
"""从食材知识层离线主库导出可安全生成的 CloudBase 只读投影。"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterator


MAX_DOCUMENT_BYTES = 512 * 1024
REQUIRED_TABLES = {
    "data_build",
    "source_release",
    "source_food",
    "source_nutrient",
    "source_food_nutrient",
    "ingredient_concept",
    "ingredient_alias",
    "ingredient_variant",
    "canine_ingredient_policy",
    "nutrient_ranking",
    "nutrient_ranking_item",
    "recipe_mapping_release",
    "ingredient_mapping_decision",
    "ingredient_mapping_component",
    "human_recipe",
    "human_recipe_ingredient_mention",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出食材知识层 CloudBase 投影")
    parser.add_argument("--sqlite", required=True, help="食材知识层离线 SQLite 路径")
    parser.add_argument("--out-dir", required=True, help="输出 JSONL 目录")
    return parser.parse_args()


def stable_export_timestamp(release_id: str) -> str:
    if len(release_id) >= 10 and release_id[4] == "-" and release_id[7] == "-":
        return f"{release_id[:10]}T00:00:00Z"
    return release_id


def release_slug(value: str) -> str:
    slug = "".join(character if character.isalnum() else "_" for character in value)
    return slug.strip("_") or "release"


def document_bytes(document: dict[str, Any]) -> bytes:
    return json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_database(conn: sqlite3.Connection) -> tuple[str, int]:
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"离线主库缺少必要表：{', '.join(missing)}")
    builds = conn.execute(
        "SELECT release_id, schema_version FROM data_build ORDER BY release_id"
    ).fetchall()
    if len(builds) != 1:
        raise ValueError("data_build 必须且只能包含一个构建版本")
    foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_errors:
        raise ValueError(f"离线主库外键校验失败：{foreign_key_errors[:3]}")
    return str(builds[0][0]), int(builds[0][1])


def source_release_documents(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    return [
        {
            "release_id": row["release_id"],
            "source_kind": row["source_kind"],
            "source_version": row["source_version"],
            "source_sha256": row["source_sha256"],
            "license_status": row["license_status"],
        }
        for row in conn.execute(
            """
            SELECT release_id, source_kind, source_version, source_sha256, license_status
            FROM source_release
            ORDER BY release_id
            """
        )
    ]


def nutrition_rows(conn: sqlite3.Connection) -> Iterator[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    yield from conn.execute(
        """
        SELECT
          f.source_release_id,
          f.fdc_id,
          f.data_type,
          f.description,
          f.publication_date,
          r.source_version,
          r.source_sha256,
          fn.source_record_id,
          fn.nutrient_id,
          n.name AS nutrient_name,
          n.unit_name,
          n.rank,
          fn.amount
        FROM source_food f
        JOIN source_release r ON r.release_id = f.source_release_id
        LEFT JOIN source_food_nutrient fn
          ON fn.source_release_id = f.source_release_id
         AND fn.fdc_id = f.fdc_id
        LEFT JOIN source_nutrient n
          ON n.source_release_id = fn.source_release_id
         AND n.nutrient_id = fn.nutrient_id
        ORDER BY
          f.source_release_id,
          f.fdc_id,
          COALESCE(n.rank, 999999),
          fn.nutrient_id,
          fn.source_record_id
        """
    )


def add_nutrient(
    nutrients: dict[str, dict[str, Any]],
    row: sqlite3.Row,
) -> None:
    if row["nutrient_id"] is None:
        return
    key = str(row["nutrient_id"])
    amount = row["amount"]
    candidate = {
        "name": row["nutrient_name"],
        "unit": row["unit_name"],
        "amount": amount,
        "value_status": "known" if amount is not None else "unknown",
    }
    existing = nutrients.get(key)
    if existing is None:
        nutrients[key] = candidate
        return
    if existing != candidate:
        raise ValueError(
            "同一来源食物的营养素存在冲突值："
            f"{row['source_release_id']} / {row['fdc_id']} / {row['nutrient_id']}"
        )


def build_profile_document(
    release_id: str,
    row: sqlite3.Row,
    nutrients: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    known_count = sum(
        1 for nutrient in nutrients.values() if nutrient["value_status"] == "known"
    )
    return {
        "_id": f"{release_slug(release_id)}_food_profile_{row['fdc_id']}",
        "release_id": release_id,
        "food_id": f"food_{row['fdc_id']}",
        "fdc_id": row["fdc_id"],
        "data_type": row["data_type"],
        "description": row["description"],
        "publication_date": row["publication_date"],
        "source_release_id": row["source_release_id"],
        "source_version": row["source_version"],
        "source_sha256": row["source_sha256"],
        "nutrient_count": len(nutrients),
        "known_nutrient_count": known_count,
        "nutrients": nutrients,
    }


def profile_documents(conn: sqlite3.Connection, release_id: str) -> Iterator[dict[str, Any]]:
    current_key: tuple[str, int] | None = None
    current_row: sqlite3.Row | None = None
    current_nutrients: dict[str, dict[str, Any]] = {}
    for row in nutrition_rows(conn):
        key = (str(row["source_release_id"]), int(row["fdc_id"]))
        if current_key is not None and key != current_key:
            if current_row is None:
                raise ValueError("营养快照构建状态异常")
            yield build_profile_document(release_id, current_row, current_nutrients)
            current_nutrients = {}
        current_key = key
        current_row = row
        add_nutrient(current_nutrients, row)
    if current_row is not None:
        yield build_profile_document(release_id, current_row, current_nutrients)


def catalog_version(conn: sqlite3.Connection) -> str | None:
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
    if not versions:
        return None
    if len(versions) != 1:
        raise ValueError(f"同一发布包只能包含一个食材目录版本：{versions}")
    return versions[0]


def policy_version(conn: sqlite3.Connection, compatible_catalog_version: str | None) -> str | None:
    versions = [
        (str(row[0]), str(row[1]))
        for row in conn.execute(
            """
            SELECT DISTINCT policy_version, compatible_catalog_version
            FROM canine_ingredient_policy
            WHERE review_status = 'approved'
            ORDER BY policy_version, compatible_catalog_version
            """
        )
    ]
    if not versions:
        return None
    if len(versions) != 1:
        raise ValueError(f"同一发布包只能包含一个安全策略版本：{versions}")
    version, catalog = versions[0]
    if compatible_catalog_version != catalog:
        raise ValueError(
            "安全策略与目录版本不兼容："
            f"policy={catalog}, catalog={compatible_catalog_version}"
        )
    return version


def effective_policy_map(
    conn: sqlite3.Connection,
    version: str | None,
) -> tuple[dict[str, sqlite3.Row], dict[str, sqlite3.Row]]:
    if version is None:
        return {}, {}
    conn.row_factory = sqlite3.Row
    concepts: dict[str, sqlite3.Row] = {}
    variants: dict[str, sqlite3.Row] = {}
    for row in conn.execute(
        """
        SELECT *
        FROM canine_ingredient_policy
        WHERE policy_version = ? AND review_status = 'approved'
        ORDER BY subject_key
        """,
        (version,),
    ):
        if row["variant_id"] is None:
            concepts[str(row["concept_id"])] = row
        else:
            variants[str(row["variant_id"])] = row
    return concepts, variants


def ranking_version(
    conn: sqlite3.Connection,
    compatible_catalog_version: str | None,
    compatible_policy_version: str | None,
) -> str | None:
    versions = [
        (str(row[0]), str(row[1]), str(row[2]))
        for row in conn.execute(
            """
            SELECT DISTINCT
              ranking_version, compatible_catalog_version, compatible_policy_version
            FROM nutrient_ranking
            ORDER BY ranking_version
            """
        )
    ]
    if not versions:
        return None
    if len(versions) != 1:
        raise ValueError(f"同一发布包只能包含一个营养排行版本：{versions}")
    version, catalog, policy = versions[0]
    if catalog != compatible_catalog_version or policy != compatible_policy_version:
        raise ValueError(
            "营养排行兼容版本不匹配："
            f"ranking=({catalog}, {policy}), release=({compatible_catalog_version}, {compatible_policy_version})"
        )
    return version


def recipe_mapping_release(
    conn: sqlite3.Connection,
    compatible_catalog_version: str | None,
    compatible_policy_version: str | None,
) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    rows = list(
        conn.execute(
            """
            SELECT *
            FROM recipe_mapping_release
            ORDER BY mapping_version
            """
        )
    )
    if not rows:
        return None
    if len(rows) != 1:
        raise ValueError("同一发布包只能包含一个菜谱映射版本")
    row = rows[0]
    if (
        row["compatible_catalog_version"] != compatible_catalog_version
        or row["compatible_policy_version"] != compatible_policy_version
    ):
        raise ValueError(
            "菜谱映射兼容版本不匹配："
            f"mapping=({row['compatible_catalog_version']}, {row['compatible_policy_version']}), "
            f"release=({compatible_catalog_version}, {compatible_policy_version})"
        )
    source = conn.execute(
        """
        SELECT source_sha256, license_status
        FROM source_release
        WHERE release_id=? AND source_kind='human_recipe'
        """,
        (row["source_release_id"],),
    ).fetchone()
    if source is None:
        raise ValueError("菜谱映射引用不存在的人饭菜谱来源")
    if source["source_sha256"] != row["source_sha256"]:
        raise ValueError("菜谱映射来源 SHA-256 与当前离线主库不一致")
    if source["license_status"] != "verified" or row["license_status"] != "verified":
        raise ValueError("菜谱来源授权未验证，禁止生成 human_recipes")
    term_count = conn.execute("SELECT COUNT(*) FROM recipe_ingredient_term").fetchone()[0]
    decision_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM ingredient_mapping_decision
        WHERE decision_version=?
        """,
        (row["mapping_version"],),
    ).fetchone()[0]
    if decision_count != term_count:
        raise ValueError(
            f"菜谱原料映射不是完整快照：terms={term_count}, decisions={decision_count}"
        )
    return row


def catalog_documents(
    conn: sqlite3.Connection,
    release_id: str,
    version: str | None,
    safety_version: str | None,
) -> Iterator[dict[str, Any]]:
    if version is None:
        return
    conn.row_factory = sqlite3.Row
    concept_policies, variant_policies = effective_policy_map(conn, safety_version)
    alias_map: dict[str, list[str]] = {}
    for row in conn.execute(
        """
        SELECT concept_id, alias
        FROM ingredient_alias
        WHERE review_status = 'approved'
        ORDER BY concept_id, alias
        """
    ):
        alias_map.setdefault(str(row["concept_id"]), []).append(str(row["alias"]))

    for row in conn.execute(
        """
        SELECT
          c.concept_id,
          c.canonical_name_zh,
          c.category_code,
          c.subcategory_code,
          v.variant_id,
          v.display_name_zh,
          v.preparation_state,
          v.part_or_cut,
          v.skin_bone_state,
          v.source_food_id,
          v.is_default,
          r.release_id AS source_release_id,
          r.source_version,
          f.description AS source_description
        FROM ingredient_concept c
        JOIN ingredient_variant v ON v.concept_id = c.concept_id
        JOIN source_release r ON r.release_id = v.source_release_id
        JOIN source_food f
          ON f.source_release_id = v.source_release_id
         AND f.fdc_id = v.source_food_id
        WHERE c.status IN ('reviewed', 'published')
          AND v.status IN ('reviewed', 'published')
        ORDER BY c.category_code, c.canonical_name_zh, v.is_default DESC, v.variant_id
        """
    ):
        policy = variant_policies.get(str(row["variant_id"])) or concept_policies.get(
            str(row["concept_id"])
        )
        decision = str(policy["decision"]) if policy is not None else "unknown"
        conditions = (
            json.loads(str(policy["conditions_json"])) if policy is not None else {}
        )
        is_selectable = decision == "allowed" or (
            decision == "conditional" and conditions.get("enforceable") is True
        )
        aliases = [
            alias
            for alias in alias_map.get(str(row["concept_id"]), [])
            if alias != row["canonical_name_zh"]
        ]
        yield {
            "_id": f"{release_slug(release_id)}_{row['variant_id']}",
            "release_id": release_id,
            "catalog_version": version,
            "policy_version": safety_version,
            "concept_id": row["concept_id"],
            "variant_id": row["variant_id"],
            "canonical_name_zh": row["canonical_name_zh"],
            "display_name_zh": row["display_name_zh"],
            "aliases": aliases,
            "category_code": row["category_code"],
            "subcategory_code": row["subcategory_code"],
            "preparation_state": row["preparation_state"],
            "part_or_cut": row["part_or_cut"],
            "skin_bone_state": row["skin_bone_state"],
            "food_id": f"food_{row['source_food_id']}",
            "fdc_id": row["source_food_id"],
            "source_release_id": row["source_release_id"],
            "source_version": row["source_version"],
            "source_description": row["source_description"],
            "is_default": bool(row["is_default"]),
            "review_status": "reviewed",
            "policy_status": decision,
            "is_searchable": True,
            "is_selectable": is_selectable,
        }


def policy_documents(
    conn: sqlite3.Connection,
    release_id: str,
    version: str | None,
) -> Iterator[dict[str, Any]]:
    if version is None:
        return
    conn.row_factory = sqlite3.Row
    for row in conn.execute(
        """
        SELECT *
        FROM canine_ingredient_policy
        WHERE policy_version = ? AND review_status = 'approved'
        ORDER BY subject_key
        """,
        (version,),
    ):
        yield {
            "_id": f"{release_slug(version)}_{row['policy_id']}",
            "release_id": release_id,
            "policy_id": row["policy_id"],
            "policy_version": row["policy_version"],
            "compatible_catalog_version": row["compatible_catalog_version"],
            "subject_key": row["subject_key"],
            "concept_id": row["concept_id"],
            "variant_id": row["variant_id"],
            "decision": row["decision"],
            "hazard_type": row["hazard_type"],
            "conditions": json.loads(str(row["conditions_json"])),
            "evidence": json.loads(str(row["evidence_json"])),
            "rationale": row["rationale"],
            "review_status": row["review_status"],
            "reviewed_by": row["reviewed_by"],
            "reviewed_at": row["reviewed_at"],
            "next_review_at": row["next_review_at"],
        }


def ranking_documents(
    conn: sqlite3.Connection,
    release_id: str,
    version: str | None,
) -> Iterator[dict[str, Any]]:
    if version is None:
        return
    conn.row_factory = sqlite3.Row
    for ranking in conn.execute(
        """
        SELECT *
        FROM nutrient_ranking
        WHERE ranking_version = ?
        ORDER BY nutrient_code
        """,
        (version,),
    ):
        items = []
        for item in conn.execute(
            """
            SELECT
              i.rank_position,
              i.concept_id,
              i.variant_id,
              i.source_release_id,
              i.source_food_id,
              i.amount_per_100g,
              i.component_values_json,
              c.canonical_name_zh,
              c.category_code,
              c.subcategory_code,
              v.display_name_zh,
              v.preparation_state
            FROM nutrient_ranking_item i
            JOIN ingredient_concept c ON c.concept_id = i.concept_id
            JOIN ingredient_variant v ON v.variant_id = i.variant_id
            WHERE i.ranking_version = ? AND i.nutrient_code = ?
            ORDER BY i.rank_position
            """,
            (version, ranking["nutrient_code"]),
        ):
            items.append(
                {
                    "rank": item["rank_position"],
                    "catalog_id": f"{release_slug(release_id)}_{item['variant_id']}",
                    "concept_id": item["concept_id"],
                    "variant_id": item["variant_id"],
                    "food_id": f"food_{item['source_food_id']}",
                    "canonical_name_zh": item["canonical_name_zh"],
                    "display_name_zh": item["display_name_zh"],
                    "category_code": item["category_code"],
                    "subcategory_code": item["subcategory_code"],
                    "preparation_state": item["preparation_state"],
                    "amount_per_100g": item["amount_per_100g"],
                    "component_values": json.loads(str(item["component_values_json"])),
                }
            )
        yield {
            "_id": f"{release_slug(version)}_nutrient_{release_slug(str(ranking['nutrient_code']))}",
            "release_id": release_id,
            "ranking_version": ranking["ranking_version"],
            "compatible_catalog_version": ranking["compatible_catalog_version"],
            "compatible_policy_version": ranking["compatible_policy_version"],
            "nutrient_code": ranking["nutrient_code"],
            "nutrient_name_zh": ranking["nutrient_name_zh"],
            "unit_name": ranking["unit_name"],
            "basis": "per_100g_edible_portion_as_served",
            "formula": json.loads(str(ranking["formula_json"])),
            "candidate_count": ranking["candidate_count"],
            "ranked_count": ranking["ranked_count"],
            "generated_at": ranking["generated_at"],
            "items": items,
        }


def policy_projection(
    policy: sqlite3.Row | None,
) -> tuple[str, bool]:
    if policy is None:
        return "unknown", False
    decision = str(policy["decision"])
    conditions = json.loads(str(policy["conditions_json"]))
    selectable = decision == "allowed" or (
        decision == "conditional" and conditions.get("enforceable") is True
    )
    return decision, selectable


def human_recipe_rows(
    conn: sqlite3.Connection,
    source_release_id: str,
) -> Iterator[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    yield from conn.execute(
        """
        SELECT
          r.source_release_id,
          r.recipe_id,
          r.categories_json,
          r.primary_category_raw,
          r.title,
          r.normalized_title,
          r.ingredient_count AS source_ingredient_count,
          r.amount_count AS source_amount_count,
          r.amount_alignment_status,
          m.position AS mention_position,
          m.raw_name,
          m.normalized_name,
          m.amount_raw,
          d.mapping_status,
          d.rule_id,
          mc.position AS component_position,
          mc.concept_id,
          mc.variant_id,
          c.canonical_name_zh,
          c.category_code,
          c.subcategory_code,
          v.display_name_zh,
          v.preparation_state,
          v.part_or_cut,
          v.skin_bone_state,
          v.source_release_id AS food_source_release_id,
          v.source_food_id
        FROM human_recipe r
        LEFT JOIN human_recipe_ingredient_mention m
          ON m.source_release_id = r.source_release_id
         AND m.recipe_id = r.recipe_id
        LEFT JOIN ingredient_mapping_decision d
          ON d.normalized_name = m.normalized_name
        LEFT JOIN ingredient_mapping_component mc
          ON mc.normalized_name = d.normalized_name
        LEFT JOIN ingredient_concept c ON c.concept_id = mc.concept_id
        LEFT JOIN ingredient_variant v ON v.variant_id = mc.variant_id
        WHERE r.source_release_id = ?
        ORDER BY r.recipe_id, m.position, mc.position
        """,
        (source_release_id,),
    )


def build_human_recipe_document(
    release_id: str,
    mapping: sqlite3.Row,
    recipe: dict[str, Any],
) -> dict[str, Any]:
    ingredients = recipe.pop("ingredients")
    selectable_component_count = sum(
        1
        for ingredient in ingredients
        for component in ingredient["components"]
        if component["is_selectable"]
    )
    blocked_component_count = sum(
        1
        for ingredient in ingredients
        for component in ingredient["components"]
        if component["policy_status"] == "blocked"
    )
    mapped_ingredient_count = sum(
        1 for ingredient in ingredients if ingredient["components"]
    )
    unresolved_ingredient_count = sum(
        1
        for ingredient in ingredients
        if ingredient["mapping_status"] in {"unmatched", "ambiguous"}
        or not ingredient["components"]
    )
    search_values = [
        recipe["normalized_title"],
        *recipe["categories"],
        *[ingredient["normalized_name"] for ingredient in ingredients],
        *[
            component["canonical_name_zh"]
            for ingredient in ingredients
            for component in ingredient["components"]
        ],
    ]
    search_text = " ".join(dict.fromkeys(value for value in search_values if value))
    return {
        "_id": (
            f"{release_slug(str(mapping['mapping_version']))}_recipe_"
            f"{release_slug(str(recipe['source_recipe_id']))}"
        ),
        "release_id": release_id,
        "recipe_version": mapping["mapping_version"],
        "mapping_version": mapping["mapping_version"],
        "compatible_catalog_version": mapping["compatible_catalog_version"],
        "compatible_policy_version": mapping["compatible_policy_version"],
        "source_release_id": mapping["source_release_id"],
        "source_license_status": mapping["license_status"],
        **recipe,
        "search_text": search_text,
        "ingredients": ingredients,
        "mapped_ingredient_count": mapped_ingredient_count,
        "unresolved_ingredient_count": unresolved_ingredient_count,
        "selectable_component_count": selectable_component_count,
        "blocked_component_count": blocked_component_count,
        "has_selectable_ingredients": selectable_component_count > 0,
        "is_searchable": selectable_component_count > 0,
        "amounts_are_reference_only": True,
        "status": (
            "ready" if selectable_component_count > 0 else "no_selectable_ingredients"
        ),
        "generated_at": mapping["generated_at"],
    }


def human_recipe_documents(
    conn: sqlite3.Connection,
    release_id: str,
    mapping: sqlite3.Row | None,
    safety_version: str | None,
) -> Iterator[dict[str, Any]]:
    if mapping is None or safety_version is None:
        return
    concept_policies, variant_policies = effective_policy_map(conn, safety_version)
    current_recipe_key: tuple[str, str] | None = None
    current_recipe: dict[str, Any] | None = None
    current_mention_position: int | None = None
    current_ingredient: dict[str, Any] | None = None

    for row in human_recipe_rows(conn, str(mapping["source_release_id"])):
        recipe_key = (str(row["source_release_id"]), str(row["recipe_id"]))
        if current_recipe_key is not None and recipe_key != current_recipe_key:
            if current_recipe is None:
                raise ValueError("菜谱投影构建状态异常")
            document = build_human_recipe_document(release_id, mapping, current_recipe)
            if document["is_searchable"]:
                yield document
            current_recipe = None
            current_mention_position = None
            current_ingredient = None
        if current_recipe is None:
            current_recipe_key = recipe_key
            current_recipe = {
                "source_recipe_id": str(row["recipe_id"]),
                "title": row["title"],
                "normalized_title": row["normalized_title"],
                "categories": json.loads(str(row["categories_json"])),
                "primary_category": row["primary_category_raw"],
                "source_ingredient_count": row["source_ingredient_count"],
                "source_amount_count": row["source_amount_count"],
                "amount_alignment_status": row["amount_alignment_status"],
                "ingredients": [],
            }

        mention_position = row["mention_position"]
        if mention_position is None:
            continue
        mention_position = int(mention_position)
        if current_mention_position != mention_position:
            current_mention_position = mention_position
            current_ingredient = {
                "position": mention_position,
                "raw_name": row["raw_name"],
                "normalized_name": row["normalized_name"],
                "amount_raw": row["amount_raw"],
                "amount_is_reference_only": True,
                "mapping_status": row["mapping_status"] or "unmatched",
                "mapping_rule": row["rule_id"],
                "components": [],
            }
            current_recipe["ingredients"].append(current_ingredient)

        if row["concept_id"] is None:
            continue
        if current_ingredient is None:
            raise ValueError("菜谱原料投影构建状态异常")
        policy = variant_policies.get(str(row["variant_id"])) or concept_policies.get(
            str(row["concept_id"])
        )
        policy_status, is_selectable = policy_projection(policy)
        current_ingredient["components"].append(
            {
                "position": row["component_position"],
                "concept_id": row["concept_id"],
                "variant_id": row["variant_id"],
                "food_id": f"food_{row['source_food_id']}",
                "canonical_name_zh": row["canonical_name_zh"],
                "display_name_zh": row["display_name_zh"],
                "category_code": row["category_code"],
                "subcategory_code": row["subcategory_code"],
                "preparation_state": row["preparation_state"],
                "part_or_cut": row["part_or_cut"],
                "skin_bone_state": row["skin_bone_state"],
                "policy_status": policy_status,
                "is_selectable": is_selectable,
            }
        )

    if current_recipe is not None:
        document = build_human_recipe_document(release_id, mapping, current_recipe)
        if document["is_searchable"]:
            yield document


def write_jsonl(
    path: Path,
    documents: Iterator[dict[str, Any]],
) -> dict[str, Any]:
    rows = 0
    max_bytes = 0
    with path.open("wb") as file:
        for document in documents:
            encoded = document_bytes(document)
            if len(encoded) > MAX_DOCUMENT_BYTES:
                raise ValueError(
                    f"{path.name} 文档 {document.get('_id')} 过大：{len(encoded)} bytes"
                )
            file.write(encoded)
            file.write(b"\n")
            rows += 1
            max_bytes = max(max_bytes, len(encoded))
    return {
        "file": path.name,
        "rows": rows,
        "max_document_bytes": max_bytes,
        "sha256": sha256_file(path),
    }


def one_document(document: dict[str, Any]) -> Iterator[dict[str, Any]]:
    yield document


def export_documents(sqlite_path: Path, out_dir: Path) -> dict[str, Any]:
    with sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True) as conn:
        release_id, schema_version = validate_database(conn)
        sources = source_release_documents(conn)
        profile_count = conn.execute("SELECT COUNT(*) FROM source_food").fetchone()[0]
        catalog_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM ingredient_variant v
            JOIN ingredient_concept c ON c.concept_id = v.concept_id
            WHERE c.status IN ('reviewed', 'published')
              AND v.status IN ('reviewed', 'published')
            """
        ).fetchone()[0]
        version = catalog_version(conn)
        if bool(catalog_count) != bool(version):
            raise ValueError("食材目录内容与 catalog_version 状态不一致")
        safety_version = policy_version(conn, version)
        policy_count = conn.execute(
            """
            SELECT COUNT(*) FROM canine_ingredient_policy
            WHERE policy_version = ? AND review_status = 'approved'
            """,
            (safety_version,),
        ).fetchone()[0] if safety_version else 0
        nutrient_ranking_version = ranking_version(conn, version, safety_version)
        ranking_count = conn.execute(
            "SELECT COUNT(*) FROM nutrient_ranking WHERE ranking_version = ?",
            (nutrient_ranking_version,),
        ).fetchone()[0] if nutrient_ranking_version else 0
        recipe_mapping = recipe_mapping_release(conn, version, safety_version)
        recipe_version = (
            str(recipe_mapping["mapping_version"]) if recipe_mapping is not None else None
        )
        source_recipe_count = conn.execute(
            "SELECT COUNT(*) FROM human_recipe WHERE source_release_id=?",
            (recipe_mapping["source_release_id"],),
        ).fetchone()[0] if recipe_mapping is not None else 0
        human_recipe_count = sum(
            1
            for _ in human_recipe_documents(
                conn, release_id, recipe_mapping, safety_version
            )
        )
        release_document = {
            "_id": f"ingredient_release_{release_slug(release_id)}",
            "release_id": release_id,
            "schema_version": schema_version,
            "status": "staging",
            "catalog_version": version,
            "policy_version": safety_version,
            "ranking_version": nutrient_ranking_version,
            "recipe_version": recipe_version,
            "recipe_source_count": source_recipe_count,
            "generated_at": stable_export_timestamp(release_id),
            "sources": sources,
            "collections": {
                "food_nutrition_profiles": profile_count,
                "ingredient_catalog": catalog_count,
                "canine_ingredient_policies": policy_count,
                "nutrient_rankings": ranking_count,
                "human_recipes": human_recipe_count,
            },
        }

        out_dir.mkdir(parents=True, exist_ok=True)
        targets = {
            "data_releases": out_dir / "data_releases.jsonl",
            "food_nutrition_profiles": out_dir / "food_nutrition_profiles.jsonl",
            "ingredient_catalog": out_dir / "ingredient_catalog.jsonl",
            "canine_ingredient_policies": out_dir / "canine_ingredient_policies.jsonl",
            "nutrient_rankings": out_dir / "nutrient_rankings.jsonl",
            "human_recipes": out_dir / "human_recipes.jsonl",
            "manifest": out_dir / "cloudbase-ingredient-import-manifest.json",
        }
        existing = [path for path in targets.values() if path.exists()]
        if existing:
            raise ValueError(
                "输出文件已存在，拒绝覆盖：" + ", ".join(str(path) for path in existing)
            )

        temporary_paths: dict[str, Path] = {}
        try:
            for key, target in targets.items():
                descriptor, name = tempfile.mkstemp(
                    prefix=f".{target.name}-",
                    suffix=".tmp",
                    dir=out_dir,
                )
                os.close(descriptor)
                temporary_paths[key] = Path(name)

            collections = {
                "data_releases": write_jsonl(
                    temporary_paths["data_releases"],
                    one_document(release_document),
                ),
                "food_nutrition_profiles": write_jsonl(
                    temporary_paths["food_nutrition_profiles"],
                    profile_documents(conn, release_id),
                ),
                "ingredient_catalog": write_jsonl(
                    temporary_paths["ingredient_catalog"],
                    catalog_documents(conn, release_id, version, safety_version),
                ),
                "canine_ingredient_policies": write_jsonl(
                    temporary_paths["canine_ingredient_policies"],
                    policy_documents(conn, release_id, safety_version),
                ),
                "nutrient_rankings": write_jsonl(
                    temporary_paths["nutrient_rankings"],
                    ranking_documents(conn, release_id, nutrient_ranking_version),
                ),
                "human_recipes": write_jsonl(
                    temporary_paths["human_recipes"],
                    human_recipe_documents(
                        conn, release_id, recipe_mapping, safety_version
                    ),
                ),
            }
            collections["data_releases"]["file"] = targets["data_releases"].name
            collections["food_nutrition_profiles"]["file"] = targets[
                "food_nutrition_profiles"
            ].name
            collections["ingredient_catalog"]["file"] = targets[
                "ingredient_catalog"
            ].name
            collections["canine_ingredient_policies"]["file"] = targets[
                "canine_ingredient_policies"
            ].name
            collections["nutrient_rankings"]["file"] = targets[
                "nutrient_rankings"
            ].name
            collections["human_recipes"]["file"] = targets["human_recipes"].name
            pending_collections = []
            if human_recipe_count == 0:
                pending_collections.append("human_recipes")
            if ranking_count == 0:
                pending_collections.insert(0, "nutrient_rankings")
            if policy_count == 0:
                pending_collections.insert(0, "canine_ingredient_policies")
            if catalog_count == 0:
                pending_collections.insert(1, "ingredient_catalog")
            manifest = {
                "release_id": release_id,
                "schema_version": schema_version,
                "generated_at": stable_export_timestamp(release_id),
                "sources": sources,
                "collections": collections,
                "pending_collections": pending_collections,
            }
            temporary_paths["manifest"].write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            for key, target in targets.items():
                temporary_paths[key].replace(target)
            return manifest
        except Exception:
            for temporary_path in temporary_paths.values():
                temporary_path.unlink(missing_ok=True)
            raise


def main() -> int:
    args = parse_args()
    sqlite_path = Path(args.sqlite)
    out_dir = Path(args.out_dir)
    if not sqlite_path.is_file():
        print(f"离线 SQLite 不存在：{sqlite_path}", file=sys.stderr)
        return 2
    try:
        manifest = export_documents(sqlite_path, out_dir)
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
