#!/usr/bin/env python3
"""将 FoodData SQLite 导出为腾讯云开发数据库可导入的 JSON Lines 文件。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


SOURCE_LABEL = "USDA FoodData Central Foundation Foods + GB/T 31216-2014"
MAX_DOCUMENT_BYTES = 512 * 1024

REQUIRED_TABLES = {
    "food",
    "nutrient",
    "food_nutrient",
    "food_localized_name",
    "pet_nutrition_standard",
    "pet_nutrition_profile",
    "pet_nutrient",
    "pet_nutrient_requirement",
}

REQUIRED_COLUMNS = {
    "food": {"fdc_id", "data_type", "description", "food_category_id", "publication_date"},
    "nutrient": {"id", "name", "unit_name", "nutrient_nbr", "rank"},
    "food_nutrient": {
        "id",
        "fdc_id",
        "nutrient_id",
        "amount",
        "data_points",
        "derivation_id",
        "min",
        "max",
        "median",
        "footnote",
        "min_year_acquired",
    },
    "food_localized_name": {
        "id",
        "fdc_id",
        "locale",
        "name",
        "name_type",
        "confidence",
        "created_at",
        "updated_at",
    },
    "pet_nutrition_standard": {
        "id",
        "region_code",
        "authority",
        "standard_code",
        "title",
        "version",
        "publication_date",
        "effective_date",
        "status",
        "source_url",
        "notes",
        "created_at",
        "updated_at",
    },
    "pet_nutrition_profile": {
        "id",
        "standard_id",
        "species",
        "profile_code",
        "profile_name",
        "life_stage",
        "product_scope",
        "food_form",
        "default_basis",
        "energy_density_kcal_per_kg",
        "energy_density_basis",
        "moisture_basis_percent",
        "notes",
        "created_at",
        "updated_at",
    },
    "pet_nutrient": {
        "id",
        "code",
        "name_en",
        "name_zh",
        "category",
        "nutrient_kind",
        "expression_json",
        "notes",
        "created_at",
        "updated_at",
    },
    "pet_nutrient_requirement": {
        "id",
        "profile_id",
        "pet_nutrient_id",
        "requirement_type",
        "value",
        "value_text",
        "unit",
        "basis",
        "condition_code",
        "condition_json",
        "applies_when",
        "notes",
        "created_at",
        "updated_at",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出 FoodData CloudBase JSONL")
    parser.add_argument("--sqlite", required=True, help="SQLite 数据库路径")
    parser.add_argument("--out-dir", required=True, help="输出目录")
    parser.add_argument("--data-version", required=True, help="数据版本，例如 2026-07-09")
    return parser.parse_args()


def stable_export_timestamp(data_version: str) -> str:
    if len(data_version) == 10 and data_version[4] == "-" and data_version[7] == "-":
        return f"{data_version}T00:00:00Z"
    return data_version


def dict_rows(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def write_jsonl(path: Path, docs: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for doc in docs:
            file.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
            file.write("\n")


def food_doc_id(fdc_id: int) -> str:
    return f"food_{fdc_id}"


def food_nutrient_doc_id(food_nutrient_id: int) -> str:
    return f"food_nutrient_{food_nutrient_id}"


def food_localized_name_doc_id(localized_name_id: int) -> str:
    return f"food_localized_name_{localized_name_id}"


def build_food_documents(conn: sqlite3.Connection, data_version: str) -> list[dict[str, Any]]:
    foods = dict_rows(conn, "SELECT * FROM food ORDER BY fdc_id")
    docs: list[dict[str, Any]] = []
    for food in foods:
        fdc_id = food["fdc_id"]
        docs.append({
            "_id": food_doc_id(fdc_id),
            "fdc_id": fdc_id,
            "data_type": food["data_type"],
            "description": food["description"],
            "food_category_id": food["food_category_id"],
            "publication_date": food["publication_date"],
            "data_version": data_version,
            "source": SOURCE_LABEL,
        })
    return docs


def build_food_nutrient_documents(conn: sqlite3.Connection, data_version: str) -> list[dict[str, Any]]:
    rows = dict_rows(
        conn,
        """
        SELECT
          fn.id,
          fn.fdc_id,
          fn.nutrient_id,
          n.name,
          n.unit_name,
          fn.amount,
          fn.data_points,
          fn.derivation_id,
          fn.min,
          fn.max,
          fn.median,
          fn.footnote,
          fn.min_year_acquired
        FROM food_nutrient fn
        JOIN nutrient n ON n.id = fn.nutrient_id
        ORDER BY fn.fdc_id, COALESCE(n.rank, 999999), n.id, fn.id
        """,
    )
    return [{
        "_id": food_nutrient_doc_id(row["id"]),
        "id": row["id"],
        "food_id": food_doc_id(row["fdc_id"]),
        "fdc_id": row["fdc_id"],
        "nutrient_id": row["nutrient_id"],
        "name": row["name"],
        "unit_name": row["unit_name"],
        "amount": row["amount"],
        "data_points": row["data_points"],
        "derivation_id": row["derivation_id"],
        "min": row["min"],
        "max": row["max"],
        "median": row["median"],
        "footnote": row["footnote"],
        "min_year_acquired": row["min_year_acquired"],
        "data_version": data_version,
    } for row in rows]


def build_food_localized_name_documents(conn: sqlite3.Connection, data_version: str) -> list[dict[str, Any]]:
    rows = dict_rows(
        conn,
        """
        SELECT id, fdc_id, locale, name, name_type, confidence, created_at, updated_at
        FROM food_localized_name
        ORDER BY id
        """,
    )
    return [{
        "_id": food_localized_name_doc_id(row["id"]),
        "id": row["id"],
        "fdc_id": row["fdc_id"],
        "food_id": food_doc_id(row["fdc_id"]),
        "locale": row["locale"],
        "name": row["name"],
        "name_type": row["name_type"],
        "confidence": row["confidence"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "data_version": data_version,
    } for row in rows]


def build_pet_standard_documents(conn: sqlite3.Connection, data_version: str) -> list[dict[str, Any]]:
    standards = dict_rows(conn, "SELECT * FROM pet_nutrition_standard ORDER BY id")
    docs: list[dict[str, Any]] = []
    for standard in standards:
        profiles = dict_rows(
            conn,
            "SELECT * FROM pet_nutrition_profile WHERE standard_id = ? ORDER BY id",
            (standard["id"],),
        )
        profile_docs = []
        for profile in profiles:
            requirements = dict_rows(
                conn,
                """
                SELECT
                  pr.requirement_type,
                  pr.value,
                  pr.value_text,
                  pr.unit,
                  pr.basis,
                  pr.condition_code,
                  pr.condition_json,
                  pr.applies_when,
                  pr.notes,
                  pn.code AS pet_nutrient_code,
                  pn.name_en,
                  pn.name_zh,
                  pn.category,
                  pn.nutrient_kind,
                  pn.expression_json
                FROM pet_nutrient_requirement pr
                JOIN pet_nutrient pn ON pn.id = pr.pet_nutrient_id
                WHERE pr.profile_id = ?
                ORDER BY pn.id, pr.requirement_type
                """,
                (profile["id"],),
            )
            profile_docs.append({
                "profile_code": profile["profile_code"],
                "profile_name": profile["profile_name"],
                "species": profile["species"],
                "life_stage": profile["life_stage"],
                "product_scope": profile["product_scope"],
                "food_form": profile["food_form"],
                "default_basis": profile["default_basis"],
                "energy_density_kcal_per_kg": profile["energy_density_kcal_per_kg"],
                "energy_density_basis": profile["energy_density_basis"],
                "moisture_basis_percent": profile["moisture_basis_percent"],
                "notes": profile["notes"],
                "requirements": requirements,
            })
        docs.append({
            "_id": f"pet_standard_{standard['id']}",
            "region_code": standard["region_code"],
            "authority": standard["authority"],
            "standard_code": standard["standard_code"],
            "title": standard["title"],
            "version": standard["version"],
            "publication_date": standard["publication_date"],
            "effective_date": standard["effective_date"],
            "status": standard["status"],
            "source_url": standard["source_url"],
            "notes": standard["notes"],
            "profiles": profile_docs,
            "data_version": data_version,
        })
    return docs


def validate_database(conn: sqlite3.Connection) -> None:
    tables = {
        row["name"]
        for row in dict_rows(conn, "SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"缺少必要数据表：{', '.join(missing)}")
    for table, required_columns in REQUIRED_COLUMNS.items():
        columns = {row["name"] for row in dict_rows(conn, f"PRAGMA table_info({table})")}
        missing_columns = sorted(required_columns - columns)
        if missing_columns:
            raise ValueError(f"{table} 缺少必要字段：{', '.join(missing_columns)}")
    foreign_key_errors = dict_rows(conn, "PRAGMA foreign_key_check")
    if foreign_key_errors:
        raise ValueError(f"外键校验失败：{foreign_key_errors[:3]}")


def assert_unique_doc_ids(collection: str, docs: list[dict[str, Any]]) -> None:
    ids = [doc["_id"] for doc in docs]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{collection} 存在重复 _id")


def max_document_bytes(docs: list[dict[str, Any]]) -> int:
    if not docs:
        return 0
    return max(len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) for doc in docs)


def validate_output_documents(collection_docs: dict[str, list[dict[str, Any]]]) -> None:
    for collection, docs in collection_docs.items():
        assert_unique_doc_ids(collection, docs)
        max_bytes = max_document_bytes(docs)
        if max_bytes > MAX_DOCUMENT_BYTES:
            raise ValueError(f"{collection} 最大文档过大：{max_bytes} bytes")


def source_table_counts(conn: sqlite3.Connection) -> dict[str, dict[str, int]]:
    return {
        table: {"rows": dict_rows(conn, f"SELECT COUNT(*) AS rows FROM {table}")[0]["rows"]}
        for table in sorted(REQUIRED_TABLES)
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(
    out_dir: Path,
    data_version: str,
    files: dict[str, Path],
    collection_docs: dict[str, list[dict[str, Any]]],
    source_counts: dict[str, dict[str, int]],
) -> None:
    manifest = {
        "data_version": data_version,
        "generated_at": stable_export_timestamp(data_version),
        "source_tables": source_counts,
        "collections": {},
        "import_mode": "首次导入使用 Insert；重复同步使用 Upsert，依赖每条记录稳定 _id。",
    }
    for collection, path in files.items():
        text = path.read_text(encoding="utf-8").strip()
        rows = 0 if not text else len(text.splitlines())
        manifest["collections"][collection] = {
            "file": path.name,
            "rows": rows,
            "max_document_bytes": max_document_bytes(collection_docs[collection]),
            "sha256": file_sha256(path),
        }
    (out_dir / "cloudbase-import-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    sqlite_path = Path(args.sqlite)
    if not sqlite_path.exists():
        print(f"SQLite 文件不存在：{sqlite_path}", file=sys.stderr)
        return 2
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        conn = sqlite3.connect(sqlite_path)
        validate_database(conn)
        foods = build_food_documents(conn, args.data_version)
        food_nutrients = build_food_nutrient_documents(conn, args.data_version)
        food_localized_name = build_food_localized_name_documents(conn, args.data_version)
        pet_standards = build_pet_standard_documents(conn, args.data_version)
        collection_docs = {
            "foods": foods,
            "food_nutrients": food_nutrients,
            "food_localized_name": food_localized_name,
            "pet_nutrition_standards": pet_standards,
        }
        validate_output_documents(collection_docs)
        source_counts = source_table_counts(conn)
        files = {
            "foods": out_dir / "foods.jsonl",
            "food_nutrients": out_dir / "food_nutrients.jsonl",
            "food_localized_name": out_dir / "food_localized_name.jsonl",
            "pet_nutrition_standards": out_dir / "pet_nutrition_standards.jsonl",
        }
        write_jsonl(files["foods"], foods)
        write_jsonl(files["food_nutrients"], food_nutrients)
        write_jsonl(files["food_localized_name"], food_localized_name)
        write_jsonl(files["pet_nutrition_standards"], pet_standards)
        write_manifest(out_dir, args.data_version, files, collection_docs, source_counts)
        return 0
    except (sqlite3.Error, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
