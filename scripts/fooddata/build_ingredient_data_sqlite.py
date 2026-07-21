#!/usr/bin/env python3
"""构建食材知识层使用的离线 SQLite 主库。

该脚本只负责导入和保留来源数据，不会自动审批食材映射，也不会直接写入 CloudBase。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


SCHEMA_VERSION = 1
BATCH_SIZE = 10_000
SR_REQUIRED_FILES = {
    "food.csv",
    "food_category.csv",
    "food_nutrient.csv",
    "nutrient.csv",
    "sr_legacy_food.csv",
}
FOUNDATION_REQUIRED_TABLES = {
    "food",
    "food_nutrient",
    "nutrient",
    "food_localized_name",
}
FOUNDATION_REQUIRED_COLUMNS = {
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
}
RECIPE_REQUIRED_COLUMNS = {"id", "cid", "zid", "title", "yl", "fl"}


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE data_build (
  release_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL
);

CREATE TABLE source_release (
  release_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  license_status TEXT NOT NULL CHECK (
    license_status IN ('public_domain', 'verified', 'needs_review')
  )
);

CREATE TABLE source_import_stat (
  source_release_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  PRIMARY KEY (source_release_id, entity_name),
  FOREIGN KEY (source_release_id) REFERENCES source_release(release_id)
);

CREATE TABLE source_food (
  source_release_id TEXT NOT NULL,
  fdc_id INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  description TEXT NOT NULL,
  food_category_id INTEGER,
  publication_date TEXT,
  PRIMARY KEY (source_release_id, fdc_id),
  FOREIGN KEY (source_release_id) REFERENCES source_release(release_id)
);

CREATE TABLE source_nutrient (
  source_release_id TEXT NOT NULL,
  nutrient_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  nutrient_nbr TEXT,
  rank REAL,
  PRIMARY KEY (source_release_id, nutrient_id),
  FOREIGN KEY (source_release_id) REFERENCES source_release(release_id)
);

CREATE TABLE source_food_nutrient (
  source_release_id TEXT NOT NULL,
  source_record_id INTEGER NOT NULL,
  fdc_id INTEGER NOT NULL,
  nutrient_id INTEGER NOT NULL,
  amount REAL,
  data_points INTEGER,
  derivation_id INTEGER,
  min REAL,
  max REAL,
  median REAL,
  footnote TEXT,
  min_year_acquired INTEGER,
  PRIMARY KEY (source_release_id, source_record_id),
  FOREIGN KEY (source_release_id, fdc_id)
    REFERENCES source_food(source_release_id, fdc_id),
  FOREIGN KEY (source_release_id, nutrient_id)
    REFERENCES source_nutrient(source_release_id, nutrient_id)
);

CREATE TABLE source_localized_name (
  source_release_id TEXT NOT NULL,
  source_record_id INTEGER NOT NULL,
  fdc_id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  name_type TEXT NOT NULL,
  confidence REAL,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (source_release_id, source_record_id),
  FOREIGN KEY (source_release_id, fdc_id)
    REFERENCES source_food(source_release_id, fdc_id)
);

CREATE TABLE source_food_category (
  source_release_id TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  code TEXT,
  description TEXT NOT NULL,
  PRIMARY KEY (source_release_id, category_id),
  FOREIGN KEY (source_release_id) REFERENCES source_release(release_id)
);

CREATE TABLE source_sr_legacy_food (
  source_release_id TEXT NOT NULL,
  fdc_id INTEGER NOT NULL,
  ndb_number TEXT NOT NULL,
  PRIMARY KEY (source_release_id, fdc_id),
  FOREIGN KEY (source_release_id, fdc_id)
    REFERENCES source_food(source_release_id, fdc_id)
);

CREATE TABLE human_recipe (
  source_release_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  category_raw TEXT,
  categories_json TEXT NOT NULL,
  primary_category_raw TEXT,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  ingredients_raw TEXT,
  amounts_raw TEXT,
  ingredient_count INTEGER NOT NULL CHECK (ingredient_count >= 0),
  amount_count INTEGER NOT NULL CHECK (amount_count >= 0),
  amount_alignment_status TEXT NOT NULL CHECK (
    amount_alignment_status IN ('aligned', 'missing_amounts', 'extra_amounts')
  ),
  PRIMARY KEY (source_release_id, recipe_id),
  FOREIGN KEY (source_release_id) REFERENCES source_release(release_id)
);

CREATE TABLE human_recipe_ingredient_mention (
  source_release_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  amount_raw TEXT,
  PRIMARY KEY (source_release_id, recipe_id, position),
  FOREIGN KEY (source_release_id, recipe_id)
    REFERENCES human_recipe(source_release_id, recipe_id)
);

CREATE TABLE recipe_ingredient_term (
  normalized_name TEXT PRIMARY KEY,
  example_raw_name TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0)
);

CREATE TABLE ingredient_concept (
  concept_id TEXT PRIMARY KEY,
  canonical_name_zh TEXT NOT NULL,
  category_code TEXT NOT NULL,
  subcategory_code TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'reviewed', 'published', 'deprecated')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE ingredient_alias (
  alias_id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'approved', 'rejected')),
  confidence REAL,
  decision_version TEXT,
  UNIQUE (normalized_alias, concept_id),
  FOREIGN KEY (concept_id) REFERENCES ingredient_concept(concept_id)
);

CREATE TABLE ingredient_variant (
  variant_id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  display_name_zh TEXT NOT NULL,
  preparation_state TEXT,
  part_or_cut TEXT,
  skin_bone_state TEXT,
  source_release_id TEXT NOT NULL,
  source_food_id INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('draft', 'reviewed', 'published', 'deprecated')),
  UNIQUE (concept_id, source_release_id, source_food_id),
  FOREIGN KEY (concept_id) REFERENCES ingredient_concept(concept_id),
  FOREIGN KEY (source_release_id, source_food_id)
    REFERENCES source_food(source_release_id, fdc_id)
);

CREATE TABLE canine_ingredient_policy (
  policy_id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  variant_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'conditional', 'blocked', 'unknown')),
  hazard_type TEXT,
  conditions_json TEXT,
  evidence_source TEXT,
  policy_version TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  FOREIGN KEY (concept_id) REFERENCES ingredient_concept(concept_id),
  FOREIGN KEY (variant_id) REFERENCES ingredient_variant(variant_id)
);

CREATE TABLE ingredient_mapping_decision (
  normalized_name TEXT PRIMARY KEY,
  mapping_status TEXT NOT NULL CHECK (
    mapping_status IN ('matched', 'ambiguous', 'unmatched', 'composite', 'alternative')
  ),
  rule_id TEXT,
  decision_version TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  notes TEXT,
  FOREIGN KEY (normalized_name) REFERENCES recipe_ingredient_term(normalized_name)
);

CREATE TABLE ingredient_mapping_component (
  normalized_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  concept_id TEXT NOT NULL,
  variant_id TEXT,
  PRIMARY KEY (normalized_name, position),
  FOREIGN KEY (normalized_name)
    REFERENCES ingredient_mapping_decision(normalized_name),
  FOREIGN KEY (concept_id) REFERENCES ingredient_concept(concept_id),
  FOREIGN KEY (variant_id) REFERENCES ingredient_variant(variant_id)
);

CREATE TABLE review_task (
  task_id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (
    reason IN ('ambiguous', 'composite', 'safety_critical', 'no_variant', 'alias_conflict', 'unmatched')
  ),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_review', 'resolved', 'rejected')),
  FOREIGN KEY (normalized_name) REFERENCES recipe_ingredient_term(normalized_name)
);

CREATE INDEX idx_source_food_data_type
  ON source_food(source_release_id, data_type, fdc_id);
CREATE INDEX idx_source_food_nutrient_food
  ON source_food_nutrient(source_release_id, fdc_id, nutrient_id);
CREATE INDEX idx_source_food_nutrient_nutrient
  ON source_food_nutrient(source_release_id, nutrient_id, fdc_id);
CREATE INDEX idx_source_localized_name_food
  ON source_localized_name(source_release_id, locale, fdc_id);
CREATE INDEX idx_human_recipe_primary_category
  ON human_recipe(source_release_id, primary_category_raw, recipe_id);
CREATE INDEX idx_human_recipe_ingredient_name
  ON human_recipe_ingredient_mention(normalized_name, source_release_id, recipe_id);
CREATE INDEX idx_ingredient_alias_name
  ON ingredient_alias(normalized_alias, review_status);
CREATE INDEX idx_ingredient_variant_concept
  ON ingredient_variant(concept_id, status, is_default);
CREATE INDEX idx_canine_policy_subject
  ON canine_ingredient_policy(concept_id, variant_id, policy_version);
CREATE INDEX idx_review_task_queue
  ON review_task(status, priority DESC, normalized_name);
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="构建食材知识层离线 SQLite 主库")
    parser.add_argument("--foundation-sqlite", required=True, help="Foundation Foods SQLite 路径")
    parser.add_argument("--sr-legacy-dir", required=True, help="SR Legacy CSV 目录")
    parser.add_argument("--recipes-csv", required=True, help="人饭菜谱 CSV 路径")
    parser.add_argument("--out-sqlite", required=True, help="输出 SQLite 路径；已存在时拒绝覆盖")
    parser.add_argument("--release-id", required=True, help="本次离线数据构建版本")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bundle(directory: Path, names: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for name in sorted(names):
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_file(directory / name).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def source_release_id(prefix: str, checksum: str) -> str:
    return f"{prefix}_{checksum[:16]}"


def optional_int(value: Any) -> int | None:
    text = str(value or "").strip()
    return int(text) if text else None


def optional_float(value: Any) -> float | None:
    text = str(value or "").strip()
    return float(text) if text else None


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.replace("\r\n", "\n").replace("\r", "\n").split())


def raw_token(value: Any) -> str:
    return str(value or "").strip()


def split_hash_values(value: Any) -> list[str]:
    values = str(value or "").split("#")
    # 数据使用末尾的 # 作为分隔符终止标记；只移除这个终止项，保留此前的空项，
    # 因为空项仍占据与 yl/fl 对应的位置。
    if values and not raw_token(values[-1]):
        values.pop()
    return values


def parse_categories(value: Any) -> list[str]:
    categories = []
    seen = set()
    for part in str(value or "").replace("\r", "\n").split(","):
        category = normalize_text(part)
        if category and category not in seen:
            seen.add(category)
            categories.append(category)
    return categories


def batched(rows: Iterable[Sequence[Any]], batch_size: int = BATCH_SIZE) -> Iterator[list[Sequence[Any]]]:
    batch: list[Sequence[Any]] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def insert_batches(
    conn: sqlite3.Connection,
    sql: str,
    rows: Iterable[Sequence[Any]],
) -> int:
    count = 0
    for batch in batched(rows):
        conn.executemany(sql, batch)
        count += len(batch)
    return count


def validate_foundation_database(path: Path) -> None:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        missing_tables = sorted(FOUNDATION_REQUIRED_TABLES - tables)
        if missing_tables:
            raise ValueError(f"Foundation SQLite 缺少表：{', '.join(missing_tables)}")
        for table, required_columns in FOUNDATION_REQUIRED_COLUMNS.items():
            columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            missing_columns = sorted(required_columns - columns)
            if missing_columns:
                raise ValueError(f"Foundation SQLite 的 {table} 缺少字段：{', '.join(missing_columns)}")


def validate_csv_columns(path: Path, required_columns: set[str]) -> None:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        columns = set(reader.fieldnames or [])
    missing = sorted(required_columns - columns)
    if missing:
        raise ValueError(f"{path.name} 缺少字段：{', '.join(missing)}")


def validate_inputs(foundation: Path, sr_dir: Path, recipes: Path) -> None:
    if not foundation.is_file():
        raise ValueError(f"Foundation SQLite 不存在：{foundation}")
    if not sr_dir.is_dir():
        raise ValueError(f"SR Legacy 目录不存在：{sr_dir}")
    missing_files = sorted(name for name in SR_REQUIRED_FILES if not (sr_dir / name).is_file())
    if missing_files:
        raise ValueError(f"SR Legacy 目录缺少文件：{', '.join(missing_files)}")
    if not recipes.is_file():
        raise ValueError(f"菜谱 CSV 不存在：{recipes}")
    validate_foundation_database(foundation)
    validate_csv_columns(sr_dir / "food.csv", FOUNDATION_REQUIRED_COLUMNS["food"])
    validate_csv_columns(sr_dir / "nutrient.csv", FOUNDATION_REQUIRED_COLUMNS["nutrient"])
    validate_csv_columns(sr_dir / "food_nutrient.csv", FOUNDATION_REQUIRED_COLUMNS["food_nutrient"])
    validate_csv_columns(sr_dir / "food_category.csv", {"id", "code", "description"})
    validate_csv_columns(sr_dir / "sr_legacy_food.csv", {"fdc_id", "NDB_number"})
    validate_csv_columns(recipes, RECIPE_REQUIRED_COLUMNS)


def insert_source_release(
    conn: sqlite3.Connection,
    release_id: str,
    source_kind: str,
    source_version: str,
    source_path: Path,
    checksum: str,
    license_status: str,
) -> None:
    conn.execute(
        """
        INSERT INTO source_release (
          release_id, source_kind, source_version, source_path, source_sha256, license_status
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            release_id,
            source_kind,
            source_version,
            str(source_path.resolve()),
            checksum,
            license_status,
        ),
    )


def rows_from_query(conn: sqlite3.Connection, sql: str) -> Iterator[Sequence[Any]]:
    cursor = conn.execute(sql)
    while True:
        rows = cursor.fetchmany(BATCH_SIZE)
        if not rows:
            return
        yield from rows


def import_foundation(
    conn: sqlite3.Connection,
    source_path: Path,
    release_id: str,
) -> dict[str, int]:
    stats: dict[str, int] = {}
    with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source:
        stats["food"] = insert_batches(
            conn,
            """
            INSERT INTO source_food (
              source_release_id, fdc_id, data_type, description, food_category_id, publication_date
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                (release_id, *row)
                for row in rows_from_query(
                    source,
                    """
                    SELECT fdc_id, data_type, description, food_category_id, publication_date
                    FROM food ORDER BY fdc_id
                    """,
                )
            ),
        )
        stats["nutrient"] = insert_batches(
            conn,
            """
            INSERT INTO source_nutrient (
              source_release_id, nutrient_id, name, unit_name, nutrient_nbr, rank
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                (release_id, *row)
                for row in rows_from_query(
                    source,
                    "SELECT id, name, unit_name, nutrient_nbr, rank FROM nutrient ORDER BY id",
                )
            ),
        )
        stats["food_nutrient"] = insert_batches(
            conn,
            """
            INSERT INTO source_food_nutrient (
              source_release_id, source_record_id, fdc_id, nutrient_id, amount,
              data_points, derivation_id, min, max, median, footnote, min_year_acquired
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (release_id, *row)
                for row in rows_from_query(
                    source,
                    """
                    SELECT id, fdc_id, nutrient_id, amount, data_points, derivation_id,
                           min, max, median, footnote, min_year_acquired
                    FROM food_nutrient ORDER BY id
                    """,
                )
            ),
        )
        stats["localized_name"] = insert_batches(
            conn,
            """
            INSERT INTO source_localized_name (
              source_release_id, source_record_id, fdc_id, locale, name, name_type,
              confidence, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (release_id, *row)
                for row in rows_from_query(
                    source,
                    """
                    SELECT id, fdc_id, locale, name, name_type, confidence, created_at, updated_at
                    FROM food_localized_name ORDER BY id
                    """,
                )
            ),
        )
    return stats


def csv_rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        yield from csv.DictReader(file)


def import_sr_legacy(
    conn: sqlite3.Connection,
    source_dir: Path,
    release_id: str,
) -> dict[str, int]:
    stats: dict[str, int] = {}
    stats["food"] = insert_batches(
        conn,
        """
        INSERT INTO source_food (
          source_release_id, fdc_id, data_type, description, food_category_id, publication_date
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            (
                release_id,
                int(row["fdc_id"]),
                row["data_type"],
                row["description"],
                optional_int(row["food_category_id"]),
                row["publication_date"] or None,
            )
            for row in csv_rows(source_dir / "food.csv")
        ),
    )
    stats["nutrient"] = insert_batches(
        conn,
        """
        INSERT INTO source_nutrient (
          source_release_id, nutrient_id, name, unit_name, nutrient_nbr, rank
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            (
                release_id,
                int(row["id"]),
                row["name"],
                row["unit_name"],
                row["nutrient_nbr"] or None,
                optional_float(row["rank"]),
            )
            for row in csv_rows(source_dir / "nutrient.csv")
        ),
    )
    stats["food_nutrient"] = insert_batches(
        conn,
        """
        INSERT INTO source_food_nutrient (
          source_release_id, source_record_id, fdc_id, nutrient_id, amount,
          data_points, derivation_id, min, max, median, footnote, min_year_acquired
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            (
                release_id,
                int(row["id"]),
                int(row["fdc_id"]),
                int(row["nutrient_id"]),
                optional_float(row["amount"]),
                optional_int(row["data_points"]),
                optional_int(row["derivation_id"]),
                optional_float(row["min"]),
                optional_float(row["max"]),
                optional_float(row["median"]),
                row["footnote"] or None,
                optional_int(row["min_year_acquired"]),
            )
            for row in csv_rows(source_dir / "food_nutrient.csv")
        ),
    )
    stats["food_category"] = insert_batches(
        conn,
        """
        INSERT INTO source_food_category (
          source_release_id, category_id, code, description
        ) VALUES (?, ?, ?, ?)
        """,
        (
            (release_id, int(row["id"]), row["code"] or None, row["description"])
            for row in csv_rows(source_dir / "food_category.csv")
        ),
    )
    stats["sr_legacy_food"] = insert_batches(
        conn,
        """
        INSERT INTO source_sr_legacy_food (
          source_release_id, fdc_id, ndb_number
        ) VALUES (?, ?, ?)
        """,
        (
            (release_id, int(row["fdc_id"]), row["NDB_number"])
            for row in csv_rows(source_dir / "sr_legacy_food.csv")
        ),
    )
    return stats


def recipe_rows(
    source_path: Path,
    release_id: str,
) -> Iterator[tuple[Sequence[Any], list[Sequence[Any]]]]:
    csv.field_size_limit(min(sys.maxsize, 2**31 - 1))
    for row in csv_rows(source_path):
        recipe_id = normalize_text(row["id"])
        title = raw_token(row["title"])
        if not recipe_id:
            raise ValueError("菜谱存在空 id")
        if not title:
            raise ValueError(f"菜谱 {recipe_id} 缺少标题")

        ingredient_values = split_hash_values(row["yl"])
        amount_values = split_hash_values(row["fl"])
        ingredient_count = len(ingredient_values)
        amount_count = len(amount_values)
        if ingredient_count == amount_count:
            alignment_status = "aligned"
        elif ingredient_count > amount_count:
            alignment_status = "missing_amounts"
        else:
            alignment_status = "extra_amounts"

        recipe = (
            release_id,
            recipe_id,
            row["cid"] or None,
            json.dumps(parse_categories(row["cid"]), ensure_ascii=False, separators=(",", ":")),
            raw_token(row["zid"]) or None,
            title,
            normalize_text(title),
            row["yl"] or None,
            row["fl"] or None,
            ingredient_count,
            amount_count,
            alignment_status,
        )
        mentions = []
        for position, value in enumerate(ingredient_values):
            name = raw_token(value)
            normalized_name = normalize_text(name)
            if not normalized_name:
                continue
            amount = raw_token(amount_values[position]) if position < amount_count else ""
            mentions.append(
                (
                    release_id,
                    recipe_id,
                    position,
                    name,
                    normalized_name,
                    amount or None,
                )
            )
        yield recipe, mentions


def import_recipes(
    conn: sqlite3.Connection,
    source_path: Path,
    release_id: str,
) -> dict[str, int]:
    recipe_count = 0
    mention_count = 0
    recipe_batch = []
    mention_batch = []

    def flush() -> None:
        nonlocal recipe_batch, mention_batch
        if recipe_batch:
            conn.executemany(
                """
                INSERT INTO human_recipe (
                  source_release_id, recipe_id, category_raw, categories_json,
                  primary_category_raw, title, normalized_title, ingredients_raw,
                  amounts_raw, ingredient_count, amount_count, amount_alignment_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                recipe_batch,
            )
            recipe_batch = []
        if mention_batch:
            conn.executemany(
                """
                INSERT INTO human_recipe_ingredient_mention (
                  source_release_id, recipe_id, position, raw_name, normalized_name, amount_raw
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                mention_batch,
            )
            mention_batch = []

    try:
        for recipe, mentions in recipe_rows(source_path, release_id):
            recipe_batch.append(recipe)
            mention_batch.extend(mentions)
            recipe_count += 1
            mention_count += len(mentions)
            if len(recipe_batch) >= 1_000 or len(mention_batch) >= BATCH_SIZE:
                flush()
        flush()
    except sqlite3.IntegrityError as error:
        raise ValueError(f"菜谱数据主键或关联校验失败：{error}") from error

    conn.execute(
        """
        INSERT INTO recipe_ingredient_term (
          normalized_name, example_raw_name, occurrence_count
        )
        SELECT normalized_name, MIN(raw_name), COUNT(*)
        FROM human_recipe_ingredient_mention
        GROUP BY normalized_name
        ORDER BY normalized_name
        """
    )
    term_count = conn.execute("SELECT COUNT(*) FROM recipe_ingredient_term").fetchone()[0]
    return {
        "human_recipe": recipe_count,
        "human_recipe_ingredient_mention": mention_count,
        "recipe_ingredient_term": term_count,
    }


def record_stats(
    conn: sqlite3.Connection,
    source_release_id_value: str,
    stats: dict[str, int],
) -> None:
    conn.executemany(
        """
        INSERT INTO source_import_stat (source_release_id, entity_name, row_count)
        VALUES (?, ?, ?)
        """,
        [
            (source_release_id_value, entity_name, row_count)
            for entity_name, row_count in sorted(stats.items())
        ],
    )


def build_database(
    foundation_path: Path,
    sr_dir: Path,
    recipes_path: Path,
    output_path: Path,
    build_release_id: str,
) -> dict[str, Any]:
    foundation_checksum = sha256_file(foundation_path)
    sr_checksum = sha256_bundle(sr_dir, SR_REQUIRED_FILES)
    recipes_checksum = sha256_file(recipes_path)
    foundation_release = source_release_id("usda_foundation", foundation_checksum)
    sr_release = source_release_id("usda_sr_legacy_2018_04", sr_checksum)
    recipes_release = source_release_id("capu_5w", recipes_checksum)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.stem}-",
        suffix=".sqlite.tmp",
        dir=output_path.parent,
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(temporary_path)
        conn.execute("PRAGMA journal_mode = OFF")
        conn.execute("PRAGMA synchronous = OFF")
        conn.executescript(SCHEMA_SQL)
        conn.execute(
            "INSERT INTO data_build (release_id, schema_version) VALUES (?, ?)",
            (build_release_id, SCHEMA_VERSION),
        )
        insert_source_release(
            conn,
            foundation_release,
            "usda_fooddata",
            "foundation",
            foundation_path,
            foundation_checksum,
            "public_domain",
        )
        insert_source_release(
            conn,
            sr_release,
            "usda_fooddata",
            "sr_legacy_2018_04",
            sr_dir,
            sr_checksum,
            "public_domain",
        )
        insert_source_release(
            conn,
            recipes_release,
            "human_recipe",
            "capu_5w_source",
            recipes_path,
            recipes_checksum,
            "needs_review",
        )

        foundation_stats = import_foundation(conn, foundation_path, foundation_release)
        sr_stats = import_sr_legacy(conn, sr_dir, sr_release)
        recipe_stats = import_recipes(conn, recipes_path, recipes_release)
        record_stats(conn, foundation_release, foundation_stats)
        record_stats(conn, sr_release, sr_stats)
        record_stats(conn, recipes_release, recipe_stats)

        foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise ValueError(f"外键校验失败：{foreign_key_errors[:3]}")
        conn.execute("ANALYZE")
        conn.commit()
        conn.close()
        conn = None
        temporary_path.replace(output_path)
    except Exception:
        if conn is not None:
            conn.close()
        temporary_path.unlink(missing_ok=True)
        raise

    return {
        "release_id": build_release_id,
        "schema_version": SCHEMA_VERSION,
        "output": str(output_path.resolve()),
        "source_releases": {
            "foundation": foundation_release,
            "sr_legacy": sr_release,
            "human_recipes": recipes_release,
        },
        "counts": {
            "source_food": foundation_stats["food"] + sr_stats["food"],
            "source_food_nutrient": (
                foundation_stats["food_nutrient"] + sr_stats["food_nutrient"]
            ),
            **recipe_stats,
        },
    }


def main() -> int:
    args = parse_args()
    foundation_path = Path(args.foundation_sqlite)
    sr_dir = Path(args.sr_legacy_dir)
    recipes_path = Path(args.recipes_csv)
    output_path = Path(args.out_sqlite)
    release_id = str(args.release_id).strip()
    if not release_id:
        print("release-id 不能为空", file=sys.stderr)
        return 2
    if output_path.exists():
        print(f"输出 SQLite 已存在，拒绝覆盖：{output_path}", file=sys.stderr)
        return 2
    try:
        validate_inputs(foundation_path, sr_dir, recipes_path)
        summary = build_database(
            foundation_path,
            sr_dir,
            recipes_path,
            output_path,
            release_id,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (csv.Error, OSError, sqlite3.Error, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
