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
        release_document = {
            "_id": f"ingredient_release_{release_slug(release_id)}",
            "release_id": release_id,
            "schema_version": schema_version,
            "status": "staging",
            "generated_at": stable_export_timestamp(release_id),
            "sources": sources,
            "collections": {
                "food_nutrition_profiles": profile_count,
                "ingredient_catalog": 0,
                "canine_ingredient_policies": 0,
                "nutrient_rankings": 0,
                "human_recipes": 0,
            },
        }

        out_dir.mkdir(parents=True, exist_ok=True)
        targets = {
            "data_releases": out_dir / "data_releases.jsonl",
            "food_nutrition_profiles": out_dir / "food_nutrition_profiles.jsonl",
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
            }
            collections["data_releases"]["file"] = targets["data_releases"].name
            collections["food_nutrition_profiles"]["file"] = targets[
                "food_nutrition_profiles"
            ].name
            manifest = {
                "release_id": release_id,
                "schema_version": schema_version,
                "generated_at": stable_export_timestamp(release_id),
                "sources": sources,
                "collections": collections,
                "pending_collections": [
                    "canine_ingredient_policies",
                    "ingredient_catalog",
                    "nutrient_rankings",
                    "human_recipes",
                ],
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
