#!/usr/bin/env python3
"""把已冻结 CFCT 来源和目录提升为新的可发布候选，不覆盖原产物。"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any


CONTRACT = "cfctOcrSourceManifest/v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--out-sqlite", type=Path, required=True)
    parser.add_argument("--out-catalog", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_authorization(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("contract") != CONTRACT:
        raise ValueError("CFCT 授权清单合同不匹配")
    if value.get("license_status") != "verified":
        raise ValueError("CFCT 授权状态不是 verified")
    required = (
        "source_version",
        "source_sha256",
        "expected_food_count",
        "data_quality",
        "authorization_basis",
        "authorization_confirmed_by",
        "authorization_confirmed_at",
        "authorized_publication_scope",
    )
    missing = [key for key in required if not value.get(key)]
    if missing:
        raise ValueError("CFCT 授权清单缺少字段：" + ", ".join(missing))
    if value["data_quality"] != "ocr_unverified":
        raise ValueError("CFCT 质量状态必须保持 ocr_unverified")
    return value


def validate_source(
    conn: sqlite3.Connection, authorization: dict[str, Any]
) -> tuple[str, int]:
    rows = conn.execute(
        """
        SELECT release_id, source_sha256, license_status
        FROM source_release
        WHERE source_kind='cfct_ocr' AND source_version=?
        """,
        (authorization["source_version"],),
    ).fetchall()
    if len(rows) != 1:
        raise ValueError("SQLite 中必须且只能有一个目标 CFCT 来源")
    release_id, checksum, status = map(str, rows[0])
    if checksum != authorization["source_sha256"]:
        raise ValueError("SQLite CFCT 来源 SHA-256 与授权清单不一致")
    if status not in {"needs_review", "verified"}:
        raise ValueError(f"SQLite CFCT 来源状态不可提升：{status}")
    counts = conn.execute(
        """
        SELECT COUNT(*),
               SUM(CASE WHEN data_quality='ocr_unverified' THEN 1 ELSE 0 END)
        FROM source_cfct_food
        WHERE source_release_id=?
        """,
        (release_id,),
    ).fetchone()
    expected = int(authorization["expected_food_count"])
    if counts is None or int(counts[0]) != expected or int(counts[1] or 0) != expected:
        raise ValueError("SQLite CFCT 食品数或质量状态与授权清单不一致")
    return release_id, expected


def build_catalog(
    catalog: dict[str, Any],
    authorization: dict[str, Any],
    catalog_version: str,
    authorization_path: Path,
) -> tuple[dict[str, Any], int]:
    if str(catalog.get("catalog_version", "")) == catalog_version:
        raise ValueError("新目录版本不能复用旧版本号")
    integration = catalog.get("cfct_integration")
    if not isinstance(integration, dict):
        raise ValueError("目录缺少 cfct_integration 元数据")
    if integration.get("source_version") != authorization["source_version"]:
        raise ValueError("目录 CFCT 来源版本与授权清单不一致")
    variants = [
        variant
        for item in catalog.get("items", [])
        for variant in item.get("variants", [])
        if variant.get("source_version") == authorization["source_version"]
    ]
    if not variants:
        raise ValueError("目录没有引用目标 CFCT 来源")
    output = json.loads(json.dumps(catalog, ensure_ascii=False))
    output["catalog_version"] = catalog_version
    output["review_note"] = (
        str(output.get("review_note", "")).rstrip("。")
        + "；项目所有者已确认固定 CFCT 来源可用于本项目发布，OCR 质量状态仍为未复核。"
    )
    output["cfct_integration"] = {
        **integration,
        "license_status": "verified",
        "data_quality": "ocr_unverified",
        "authorization_declaration": authorization_path.as_posix(),
        "authorization_sha256": sha256_file(authorization_path),
        "authorization_confirmed_at": authorization["authorization_confirmed_at"],
    }
    return output, len(variants)


def promote_database(
    source: Path,
    target: Path,
    authorization: dict[str, Any],
    release_id: str,
) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(
        prefix=f".{target.stem}-", suffix=".tmp", dir=target.parent
    )
    os.close(descriptor)
    temporary = Path(name)
    try:
        shutil.copy2(source, temporary)
        with sqlite3.connect(temporary) as conn:
            conn.execute("PRAGMA foreign_keys=ON")
            source_release_id, food_count = validate_source(conn, authorization)
            builds = conn.execute("SELECT release_id FROM data_build").fetchall()
            if len(builds) != 1:
                raise ValueError("data_build 必须且只能有一个版本")
            conn.execute(
                "UPDATE source_release SET license_status='verified' WHERE release_id=?",
                (source_release_id,),
            )
            conn.execute("UPDATE data_build SET release_id=?", (release_id,))
            foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_key_errors:
                raise ValueError(f"提升后 SQLite 外键失败：{foreign_key_errors[:3]}")
            conn.commit()
        temporary.replace(target)
        return {
            "release_id": release_id,
            "source_release_id": source_release_id,
            "cfct_food_count": food_count,
        }
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main() -> int:
    args = parse_args()
    inputs = (args.sqlite, args.catalog, args.authorization)
    if any(not path.is_file() for path in inputs):
        print("CFCT 发布提升输入不完整", file=sys.stderr)
        return 2
    if args.out_sqlite.exists() or args.out_catalog.exists():
        print("拒绝覆盖已有 CFCT 发布候选", file=sys.stderr)
        return 2
    try:
        authorization = load_authorization(args.authorization)
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        promoted_catalog, concept_count = build_catalog(
            catalog,
            authorization,
            args.catalog_version,
            args.authorization,
        )
        database_summary = promote_database(
            args.sqlite, args.out_sqlite, authorization, args.release_id
        )
        args.out_catalog.parent.mkdir(parents=True, exist_ok=True)
        args.out_catalog.write_text(
            json.dumps(promoted_catalog, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    **database_summary,
                    "catalog_version": args.catalog_version,
                    "cfct_catalog_concept_count": concept_count,
                    "license_status": "verified",
                    "data_quality": "ocr_unverified",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        args.out_sqlite.unlink(missing_ok=True)
        args.out_catalog.unlink(missing_ok=True)
        print(f"CFCT 发布提升失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
