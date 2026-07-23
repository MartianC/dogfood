#!/usr/bin/env python3
"""把已复核的首批标准食材概念、别名和形态写入离线主库。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path
from typing import Any


REQUIRED_TABLES = {
    "source_release",
    "source_food",
    "ingredient_concept",
    "ingredient_alias",
    "ingredient_variant",
}

ALLOWED_CATEGORY_CODES = {
    "carb",
    "dairy",
    "egg",
    "fish",
    "fruit",
    "legume",
    "meat",
    "oil",
    "organ",
    "seafood",
    "vegetable",
}


def normalize_alias(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def alias_id(concept_id: str, normalized_alias: str) -> str:
    digest = hashlib.sha256(
        f"{concept_id}\0{normalized_alias}".encode("utf-8")
    ).hexdigest()[:16]
    return f"alias_{digest}"


def validate_tables(conn: sqlite3.Connection) -> None:
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"离线主库缺少必要表：{', '.join(missing)}")


def load_seed(path: Path) -> dict[str, Any]:
    seed = json.loads(path.read_text(encoding="utf-8"))
    if not seed.get("catalog_version") or not isinstance(seed.get("items"), list):
        raise ValueError("目录种子缺少 catalog_version 或 items")
    if not seed["items"]:
        raise ValueError("目录种子不能为空")
    return seed


def resolve_source_food(
    conn: sqlite3.Connection,
    source_version: str,
    fdc_id: int,
    description_contains: str,
) -> tuple[str, str]:
    rows = conn.execute(
        """
        SELECT r.release_id, f.description
        FROM source_release r
        JOIN source_food f ON f.source_release_id = r.release_id
        WHERE r.source_version = ? AND f.fdc_id = ?
        """,
        (source_version, fdc_id),
    ).fetchall()
    if len(rows) != 1:
        raise ValueError(
            f"营养来源必须唯一：source_version={source_version}, fdc_id={fdc_id}"
        )
    source_release_id, description = str(rows[0][0]), str(rows[0][1])
    if description_contains not in description:
        raise ValueError(
            f"营养来源描述不匹配：fdc_id={fdc_id}，"
            f"期望包含 {description_contains!r}，实际为 {description!r}"
        )
    nutrient_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM source_food_nutrient
        WHERE source_release_id = ? AND fdc_id = ?
        """,
        (source_release_id, fdc_id),
    ).fetchone()[0]
    if nutrient_count <= 0:
        raise ValueError(f"营养来源没有营养记录：fdc_id={fdc_id}")
    return source_release_id, description


def validate_seed_shape(seed: dict[str, Any]) -> None:
    concept_ids: set[str] = set()
    variant_ids: set[str] = set()
    source_keys: set[tuple[str, int]] = set()
    alias_owners: dict[str, str] = {}
    for item in seed["items"]:
        concept_id = str(item.get("concept_id", ""))
        if not concept_id or concept_id in concept_ids:
            raise ValueError(f"concept_id 缺失或重复：{concept_id!r}")
        concept_ids.add(concept_id)
        if not item.get("canonical_name_zh") or not item.get("category_code"):
            raise ValueError(f"标准食材概念缺少名称或分类：{concept_id}")
        category_code = str(item["category_code"])
        if category_code not in ALLOWED_CATEGORY_CODES:
            raise ValueError(
                f"标准食材概念使用了未受控的一级分类：{concept_id}={category_code}"
            )
        for alias in [item["canonical_name_zh"], *item.get("aliases", [])]:
            normalized = normalize_alias(str(alias))
            if not normalized:
                raise ValueError(f"标准食材概念包含空别名：{concept_id}")
            previous_owner = alias_owners.get(normalized)
            if previous_owner and previous_owner != concept_id:
                raise ValueError(
                    f"规范化别名跨概念冲突：{alias!r} 同时属于 "
                    f"{previous_owner} 和 {concept_id}"
                )
            alias_owners[normalized] = concept_id
        variants = item.get("variants")
        if not isinstance(variants, list) or not variants:
            raise ValueError(f"标准食材概念没有形态：{concept_id}")
        default_count = sum(bool(variant.get("is_default")) for variant in variants)
        if default_count != 1:
            raise ValueError(f"每个概念必须且只能有一个默认形态：{concept_id}")
        for variant in variants:
            variant_id = str(variant.get("variant_id", ""))
            if not variant_id or variant_id in variant_ids:
                raise ValueError(f"variant_id 缺失或重复：{variant_id!r}")
            variant_ids.add(variant_id)
            source_key = (str(variant.get("source_version", "")), int(variant["fdc_id"]))
            if source_key in source_keys:
                raise ValueError(f"营养来源被多个形态重复占用：{source_key}")
            source_keys.add(source_key)
            if not variant.get("display_name_zh") or not variant.get(
                "description_contains"
            ):
                raise ValueError(f"食材形态缺少显示名称或来源描述：{variant_id}")


def seed_catalog(conn: sqlite3.Connection, seed: dict[str, Any]) -> dict[str, int]:
    validate_tables(conn)
    validate_seed_shape(seed)
    catalog_version = str(seed["catalog_version"])
    date_value = catalog_version[:10]
    concept_count = alias_count = variant_count = 0

    for item in seed["items"]:
        concept_id = str(item["concept_id"])
        conn.execute(
            """
            INSERT INTO ingredient_concept (
              concept_id, canonical_name_zh, category_code, subcategory_code,
              status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'reviewed', ?, ?)
            ON CONFLICT(concept_id) DO UPDATE SET
              canonical_name_zh = excluded.canonical_name_zh,
              category_code = excluded.category_code,
              subcategory_code = excluded.subcategory_code,
              status = excluded.status,
              updated_at = excluded.updated_at
            """,
            (
                concept_id,
                item["canonical_name_zh"],
                item["category_code"],
                item.get("subcategory_code"),
                date_value,
                date_value,
            ),
        )
        concept_count += 1

        aliases = [item["canonical_name_zh"], *item.get("aliases", [])]
        seen_aliases: set[str] = set()
        for alias in aliases:
            normalized = normalize_alias(str(alias))
            if not normalized or normalized in seen_aliases:
                continue
            seen_aliases.add(normalized)
            conn.execute(
                """
                INSERT INTO ingredient_alias (
                  alias_id, concept_id, alias, normalized_alias, source,
                  review_status, confidence, decision_version
                ) VALUES (?, ?, ?, ?, 'catalog_seed', 'approved', 1.0, ?)
                ON CONFLICT(normalized_alias, concept_id) DO UPDATE SET
                  alias = excluded.alias,
                  source = excluded.source,
                  review_status = excluded.review_status,
                  confidence = excluded.confidence,
                  decision_version = excluded.decision_version
                """,
                (
                    alias_id(concept_id, normalized),
                    concept_id,
                    str(alias),
                    normalized,
                    catalog_version,
                ),
            )
            alias_count += 1

        for variant in item["variants"]:
            fdc_id = int(variant["fdc_id"])
            source_release_id, _ = resolve_source_food(
                conn,
                str(variant["source_version"]),
                fdc_id,
                str(variant["description_contains"]),
            )
            conn.execute(
                """
                INSERT INTO ingredient_variant (
                  variant_id, concept_id, display_name_zh, preparation_state,
                  part_or_cut, skin_bone_state, source_release_id, source_food_id,
                  is_default, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewed')
                ON CONFLICT(variant_id) DO UPDATE SET
                  concept_id = excluded.concept_id,
                  display_name_zh = excluded.display_name_zh,
                  preparation_state = excluded.preparation_state,
                  part_or_cut = excluded.part_or_cut,
                  skin_bone_state = excluded.skin_bone_state,
                  source_release_id = excluded.source_release_id,
                  source_food_id = excluded.source_food_id,
                  is_default = excluded.is_default,
                  status = excluded.status
                """,
                (
                    variant["variant_id"],
                    concept_id,
                    variant["display_name_zh"],
                    variant.get("preparation_state"),
                    variant.get("part_or_cut"),
                    variant.get("skin_bone_state"),
                    source_release_id,
                    fdc_id,
                    int(bool(variant.get("is_default"))),
                ),
            )
            variant_count += 1

    foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_errors:
        raise ValueError(f"写入后外键校验失败：{foreign_key_errors[:3]}")
    return {
        "ingredient_concept": concept_count,
        "ingredient_alias": alias_count,
        "ingredient_variant": variant_count,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if not args.seed.is_file():
        print(f"目录种子不存在：{args.seed}", file=sys.stderr)
        return 2
    try:
        seed = load_seed(args.seed)
        with sqlite3.connect(args.sqlite) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            with conn:
                summary = seed_catalog(conn, seed)
        print(
            json.dumps(
                {"catalog_version": seed["catalog_version"], "counts": summary},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        print(f"目录写入失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
