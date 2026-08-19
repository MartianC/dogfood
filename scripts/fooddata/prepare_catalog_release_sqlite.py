#!/usr/bin/env python3
"""从上一版离线主库准备一个只含目标目录派生数据的 SQLite 副本。"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path
from typing import Any


REQUIRED_TABLES = {
    "ingredient_concept",
    "ingredient_alias",
    "ingredient_variant",
    "canine_ingredient_policy",
    "nutrient_ranking",
    "nutrient_ranking_item",
    "recipe_mapping_release",
    "ingredient_mapping_decision",
    "ingredient_mapping_component",
    "review_task",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-sqlite", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--out-sqlite", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def validate_tables(conn: sqlite3.Connection) -> None:
    tables = {
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"基础 SQLite 缺少必要表：{', '.join(missing)}")


def prepare(base_sqlite: Path, catalog: dict[str, Any], out_sqlite: Path) -> dict[str, int | str]:
    if out_sqlite.exists():
        raise ValueError(f"拒绝覆盖已有 SQLite：{out_sqlite}")
    items = catalog.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("目标目录 items 必须是非空数组")
    target_ids = {str(item.get("concept_id", "")) for item in items}
    if not target_ids or "" in target_ids:
        raise ValueError("目标目录包含空 concept_id")

    out_sqlite.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(base_sqlite, out_sqlite)
    try:
        with sqlite3.connect(out_sqlite) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            validate_tables(conn)
            with conn:
                # 这些表都由目录、策略、排行和映射种子重新生成；来源和菜谱原始事实保留。
                for table in (
                    "ingredient_mapping_component",
                    "ingredient_mapping_decision",
                    "review_task",
                    "recipe_mapping_release",
                    "nutrient_ranking_item",
                    "nutrient_ranking",
                    "canine_ingredient_policy",
                    "ingredient_alias",
                    "ingredient_variant",
                    "ingredient_concept",
                ):
                    conn.execute(f"DELETE FROM {table}")
                errors = conn.execute("PRAGMA foreign_key_check").fetchall()
                if errors:
                    raise ValueError(f"清理后的 SQLite 外键校验失败：{errors[:3]}")
            return {
                "catalog_version": str(catalog["catalog_version"]),
                "target_concept_count": len(target_ids),
            }
    except Exception:
        out_sqlite.unlink(missing_ok=True)
        raise


def main() -> int:
    args = parse_args()
    try:
        if not args.base_sqlite.is_file():
            raise ValueError(f"基础 SQLite 不存在：{args.base_sqlite}")
        catalog = load_json(args.catalog)
        print(json.dumps(prepare(args.base_sqlite, catalog, args.out_sqlite), ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ValueError, json.JSONDecodeError) as error:
        print(f"准备目录 SQLite 失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
