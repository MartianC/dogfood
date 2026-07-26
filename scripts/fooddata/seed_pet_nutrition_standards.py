#!/usr/bin/env python3
"""把宠物营养标准种子数据写入 FoodData SQLite。"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path
from typing import Any

REQUIRED_TABLES = {
    "pet_nutrition_standard",
    "pet_nutrition_profile",
    "pet_nutrient",
    "pet_nutrient_requirement",
}

NOW = "2026-07-11"
FEDIAF_STANDARD_ID = 2025001
FEDIAF_PROFILE_ID_START = 2025100
FEDIAF_NUTRIENT_ID_START = 2025200
FEDIAF_REQUIREMENT_ID_START = 2025300


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="写入宠物营养标准种子数据")
    parser.add_argument("--sqlite", required=True, help="SQLite 数据库路径")
    parser.add_argument("--seed", required=True, help="标准种子 JSON 路径")
    parser.add_argument("--out-sqlite", help="输出 SQLite 副本路径；不提供时原地写入")
    return parser.parse_args()


def dict_rows(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def require_tables(conn: sqlite3.Connection) -> None:
    tables = {row["name"] for row in dict_rows(conn, "SELECT name FROM sqlite_master WHERE type = 'table'")}
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"缺少必要数据表：{', '.join(missing)}")


def load_seed(path: Path) -> dict[str, Any]:
    seed = json.loads(path.read_text(encoding="utf-8"))
    if "standard" not in seed or "profiles" not in seed:
        raise ValueError("种子 JSON 必须包含 standard 和 profiles")
    return seed


def next_id(conn: sqlite3.Connection, table: str, floor: int) -> int:
    value = conn.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}").fetchone()[0]
    return max(int(value) + 1, floor)


def delete_existing_standard(conn: sqlite3.Connection, standard_code: str) -> None:
    rows = dict_rows(conn, "SELECT id FROM pet_nutrition_standard WHERE standard_code = ?", (standard_code,))
    for row in rows:
        profile_ids = [item["id"] for item in dict_rows(conn, "SELECT id FROM pet_nutrition_profile WHERE standard_id = ?", (row["id"],))]
        if profile_ids:
            placeholders = ",".join("?" for _ in profile_ids)
            conn.execute(f"DELETE FROM pet_nutrient_requirement WHERE profile_id IN ({placeholders})", profile_ids)
        conn.execute("DELETE FROM pet_nutrition_profile WHERE standard_id = ?", (row["id"],))
        conn.execute("DELETE FROM pet_nutrition_standard WHERE id = ?", (row["id"],))


def upsert_nutrient(conn: sqlite3.Connection, requirement: dict[str, Any], ids: dict[str, int]) -> int:
    code = requirement["nutrient_code"]
    existing = conn.execute("SELECT id FROM pet_nutrient WHERE code = ?", (code,)).fetchone()
    if existing:
        nutrient_id = int(existing[0])
        conn.execute(
            """
            UPDATE pet_nutrient
            SET name_en = ?, name_zh = ?, category = ?, nutrient_kind = ?, expression_json = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                requirement["name_en"],
                requirement.get("name_zh"),
                requirement["category"],
                requirement.get("nutrient_kind", "atomic"),
                requirement.get("expression_json"),
                requirement.get("nutrient_notes"),
                NOW,
                nutrient_id,
            ),
        )
        return nutrient_id

    nutrient_id = ids["nutrient"]
    ids["nutrient"] += 1
    conn.execute(
        """
        INSERT INTO pet_nutrient (id, code, name_en, name_zh, category, nutrient_kind, expression_json, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            nutrient_id,
            code,
            requirement["name_en"],
            requirement.get("name_zh"),
            requirement["category"],
            requirement.get("nutrient_kind", "atomic"),
            requirement.get("expression_json"),
            requirement.get("nutrient_notes"),
            NOW,
            NOW,
        ),
    )
    return nutrient_id


def write_seed(conn: sqlite3.Connection, seed: dict[str, Any]) -> None:
    standard = seed["standard"]
    delete_existing_standard(conn, standard["standard_code"])

    ids = {
        "profile": next_id(conn, "pet_nutrition_profile", FEDIAF_PROFILE_ID_START),
        "nutrient": next_id(conn, "pet_nutrient", FEDIAF_NUTRIENT_ID_START),
        "requirement": next_id(conn, "pet_nutrient_requirement", FEDIAF_REQUIREMENT_ID_START),
    }
    standard_id = max(next_id(conn, "pet_nutrition_standard", FEDIAF_STANDARD_ID), FEDIAF_STANDARD_ID)

    notes = standard.get("notes", "")
    pdf_url = standard.get("source_pdf_url")
    if pdf_url:
        notes = f"{notes} PDF: {pdf_url}".strip()

    conn.execute(
        """
        INSERT INTO pet_nutrition_standard (
          id, region_code, authority, standard_code, title, version, publication_date,
          effective_date, status, source_url, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            standard_id,
            standard["region_code"],
            standard["authority"],
            standard["standard_code"],
            standard["title"],
            standard["version"],
            standard.get("publication_date"),
            standard.get("effective_date"),
            standard["status"],
            standard.get("source_url"),
            notes,
            NOW,
            NOW,
        ),
    )

    for profile in seed["profiles"]:
        profile_id = ids["profile"]
        ids["profile"] += 1
        conn.execute(
            """
            INSERT INTO pet_nutrition_profile (
              id, standard_id, species, profile_code, profile_name, life_stage,
              product_scope, food_form, default_basis, energy_density_kcal_per_kg,
              energy_density_basis, moisture_basis_percent, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                standard_id,
                profile["species"],
                profile["profile_code"],
                profile["profile_name"],
                profile["life_stage"],
                profile["product_scope"],
                profile["food_form"],
                profile["default_basis"],
                profile.get("energy_density_kcal_per_kg"),
                profile.get("energy_density_basis"),
                profile.get("moisture_basis_percent"),
                profile.get("notes"),
                NOW,
                NOW,
            ),
        )

        for requirement in profile["requirements"]:
            nutrient_id = upsert_nutrient(conn, requirement, ids)
            requirement_id = ids["requirement"]
            ids["requirement"] += 1
            condition = {
                "source_page": requirement.get("source_page"),
                "basis_label": "Per 100 g DM",
            }
            conn.execute(
                """
                INSERT INTO pet_nutrient_requirement (
                  id, profile_id, pet_nutrient_id, requirement_type, value, value_text,
                  unit, basis, condition_code, condition_json, applies_when, notes,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    requirement_id,
                    profile_id,
                    nutrient_id,
                    requirement["requirement_type"],
                    requirement.get("value"),
                    requirement.get("value_text"),
                    requirement["unit"],
                    requirement["basis"],
                    requirement.get("condition_code", ""),
                    json.dumps(condition, ensure_ascii=False, separators=(",", ":")),
                    requirement.get("applies_when"),
                    requirement.get("notes"),
                    NOW,
                    NOW,
                ),
            )


def main() -> int:
    args = parse_args()
    sqlite_path = Path(args.sqlite)
    if not sqlite_path.exists():
        print(f"SQLite 文件不存在：{sqlite_path}", file=sys.stderr)
        return 1

    target_path = Path(args.out_sqlite) if args.out_sqlite else sqlite_path
    if args.out_sqlite:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(sqlite_path, target_path)

    seed = load_seed(Path(args.seed))
    conn = sqlite3.connect(target_path)
    try:
        require_tables(conn)
        write_seed(conn, seed)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print(f"已写入宠物营养标准：{seed['standard']['standard_code']} -> {target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
