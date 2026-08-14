#!/usr/bin/env python3
"""把固定提交的 CFCT 第6版 OCR JSON 作为独立来源导入新的离线 SQLite。"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any


NUTRIENTS = {
    "water": (1051, "水分", "G"),
    "energyKCal": (1008, "能量", "KCAL"),
    "energyKJ": (1062, "能量", "kJ"),
    "protein": (1003, "蛋白质", "G"),
    "fat": (1004, "总脂肪", "G"),
    "CHO": (1005, "碳水化合物", "G"),
    "dietaryFiber": (1079, "膳食纤维", "G"),
    "cholesterol": (1253, "胆固醇", "MG"),
    "ash": (1007, "灰分", "G"),
    "vitaminA": (1106, "维生素A", "UG"),
    "carotene": (1107, "胡萝卜素", "UG"),
    "retinol": (1105, "视黄醇", "UG"),
    "thiamin": (1165, "硫胺素", "MG"),
    "riboflavin": (1166, "核黄素", "MG"),
    "niacin": (1167, "烟酸", "MG"),
    "vitaminC": (1162, "维生素C", "MG"),
    "vitaminETotal": (1109, "维生素E总量", "MG"),
    "vitaminE1": (900001, "α-生育酚", "MG"),
    "vitaminE2": (900002, "β+γ-生育酚", "MG"),
    "vitaminE3": (900003, "δ-生育酚", "MG"),
    "Ca": (1087, "钙", "MG"),
    "P": (1091, "磷", "MG"),
    "K": (1092, "钾", "MG"),
    "Na": (1093, "钠", "MG"),
    "Mg": (1090, "镁", "MG"),
    "Fe": (1089, "铁", "MG"),
    "Zn": (1095, "锌", "MG"),
    "Se": (1103, "硒", "UG"),
    "Cu": (1098, "铜", "MG"),
    "Mn": (1101, "锰", "MG"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-sqlite", type=Path, required=True)
    parser.add_argument("--cfct-json-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out-sqlite", type=Path, required=True)
    return parser.parse_args()


def bundle_sha256(files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).hexdigest().encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def stable_category_id(name: str) -> int:
    return int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:7], 16)


def source_food_id(food_code: str) -> int:
    """纯数字编码保持原值；含后缀的代表值编码进入独立稳定整数区间。"""
    return int(food_code) if food_code.isdigit() else 1_000_000_000 + int(
        hashlib.sha256(food_code.encode("utf-8")).hexdigest()[:10], 16
    )


def value_status(value: Any) -> tuple[float | None, str]:
    text = str(value or "").strip()
    if not text:
        return None, "missing"
    normalized = text.lower()
    if normalized == "tr":
        return None, "trace"
    if normalized in {"—", "——", "-", "--"}:
        return None, "not_measured"
    if normalized == "un":
        return None, "unavailable"
    if normalized.endswith("*"):
        try:
            return float(normalized[:-1]), "calculated"
        except ValueError:
            return None, "invalid_ocr"
    try:
        return float(text), "numeric"
    except ValueError:
        return None, "invalid_ocr"


def load_rows(directory: Path, manifest: dict[str, Any]) -> tuple[list[dict[str, Any]], list[Path]]:
    files = sorted(directory.glob("*.json"))
    if len(files) != int(manifest["expected_json_file_count"]):
        raise ValueError(f"CFCT JSON 文件数不匹配：{len(files)}")
    rows: list[dict[str, Any]] = []
    for path in files:
        category = path.stem.removeprefix("merged_")
        values = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(values, list):
            raise ValueError(f"CFCT 文件不是数组：{path.name}")
        for value in values:
            rows.append({"category": category, "source_file": path.name, **value})
    if len(rows) != int(manifest["expected_food_count"]):
        raise ValueError(f"CFCT 食品数不匹配：{len(rows)}")
    codes = [str(row.get("foodCode", "")) for row in rows]
    if len(set(codes)) != len(codes) or any(not re.fullmatch(r"\d+[a-z]?", code, re.IGNORECASE) for code in codes):
        raise ValueError("CFCT foodCode 缺失、重复或格式无效")
    if len({source_food_id(code) for code in codes}) != len(codes):
        raise ValueError("CFCT 本地来源食品ID发生碰撞")
    return rows, files


def import_source(conn: sqlite3.Connection, rows: list[dict[str, Any]], manifest: dict[str, Any], checksum: str) -> dict[str, int]:
    version = str(manifest["source_version"])
    release_id = f"cfct_ocr_{checksum[:16]}"
    conn.execute(
        "INSERT INTO source_release VALUES (?, 'cfct_ocr', ?, ?, ?, 'needs_review')",
        (release_id, version, f"{manifest['upstream_repository']}@{manifest['upstream_commit']}", checksum),
    )
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS source_cfct_food (
          source_release_id TEXT NOT NULL,
          fdc_id INTEGER NOT NULL,
          food_code TEXT NOT NULL,
          original_name TEXT NOT NULL,
          category TEXT NOT NULL,
          source_file TEXT NOT NULL,
          edible_percent REAL,
          edible_raw TEXT NOT NULL,
          edible_status TEXT NOT NULL CHECK (edible_status IN ('numeric','trace','not_measured','unavailable','missing','invalid_ocr')),
          remark TEXT,
          data_quality TEXT NOT NULL CHECK (data_quality = 'ocr_unverified'),
          upstream_commit TEXT NOT NULL,
          PRIMARY KEY (source_release_id, fdc_id),
          UNIQUE (source_release_id, food_code),
          FOREIGN KEY (source_release_id, fdc_id) REFERENCES source_food(source_release_id, fdc_id)
        );
        CREATE TABLE IF NOT EXISTS source_cfct_nutrient_value (
          source_release_id TEXT NOT NULL,
          fdc_id INTEGER NOT NULL,
          nutrient_id INTEGER NOT NULL,
          raw_value TEXT NOT NULL,
          value_status TEXT NOT NULL CHECK (value_status IN ('numeric','calculated','trace','not_measured','unavailable','missing','invalid_ocr')),
          PRIMARY KEY (source_release_id, fdc_id, nutrient_id),
          FOREIGN KEY (source_release_id, fdc_id) REFERENCES source_food(source_release_id, fdc_id)
        );
        """
    )
    categories = sorted({str(row["category"]) for row in rows})
    for category in categories:
        conn.execute(
            "INSERT INTO source_food_category VALUES (?, ?, ?, ?)",
            (release_id, stable_category_id(category), category, category),
        )
    for rank, (field, (nutrient_id, name, unit)) in enumerate(NUTRIENTS.items(), 1):
        conn.execute(
            "INSERT INTO source_nutrient VALUES (?, ?, ?, ?, ?, ?)",
            (release_id, nutrient_id, name, unit, field, rank),
        )

    food_nutrient_count = localized_count = invalid_ocr_count = calculated_count = 0
    for row in rows:
        fdc_id = source_food_id(str(row["foodCode"]))
        category = str(row["category"])
        name = str(row["foodName"]).strip()
        conn.execute(
            "INSERT INTO source_food VALUES (?, ?, 'cfct_ocr', ?, ?, NULL)",
            (release_id, fdc_id, name, stable_category_id(category)),
        )
        conn.execute(
            "INSERT INTO source_localized_name VALUES (?, ?, ?, 'zh-CN', ?, 'cfct_original', 0.7, NULL, NULL)",
            (release_id, fdc_id, fdc_id, name),
        )
        localized_count += 1
        edible, edible_status = value_status(row.get("edible"))
        conn.execute(
            "INSERT INTO source_cfct_food VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ocr_unverified', ?)",
            (release_id, fdc_id, row["foodCode"], name, category, row["source_file"], edible, str(row.get("edible") or ""), edible_status, row.get("remark") or None, manifest["upstream_commit"]),
        )
        for index, (field, (nutrient_id, _name, _unit)) in enumerate(NUTRIENTS.items(), 1):
            amount, status = value_status(row.get(field))
            raw = str(row.get(field) or "")
            conn.execute(
                "INSERT INTO source_cfct_nutrient_value VALUES (?, ?, ?, ?, ?)",
                (release_id, fdc_id, nutrient_id, raw, status),
            )
            if status == "invalid_ocr":
                invalid_ocr_count += 1
            if status == "calculated":
                calculated_count += 1
            if status in {"numeric", "calculated"}:
                conn.execute(
                    "INSERT INTO source_food_nutrient VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL)",
                    (release_id, fdc_id * 100 + index, fdc_id, nutrient_id, amount, f"CFCT OCR 原值={raw}"),
                )
                food_nutrient_count += 1
    stats = {
        "food": len(rows),
        "food_category": len(categories),
        "nutrient": len(NUTRIENTS),
        "food_nutrient": food_nutrient_count,
        "localized_name": localized_count,
        "cfct_food": len(rows),
        "cfct_nutrient_value": len(rows) * len(NUTRIENTS),
        "cfct_invalid_ocr_value": invalid_ocr_count,
        "cfct_calculated_value": calculated_count,
    }
    conn.executemany(
        "INSERT INTO source_import_stat VALUES (?, ?, ?)",
        [(release_id, key, value) for key, value in sorted(stats.items())],
    )
    return {"source_release_id": release_id, **stats}


def main() -> int:
    args = parse_args()
    if not args.base_sqlite.is_file() or not args.cfct_json_dir.is_dir() or not args.manifest.is_file():
        print("CFCT 导入输入不完整", file=sys.stderr)
        return 2
    if args.out_sqlite.exists():
        print(f"拒绝覆盖已有 SQLite：{args.out_sqlite}", file=sys.stderr)
        return 2
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        if manifest.get("contract") != "cfctOcrSourceManifest/v1":
            raise ValueError("CFCT 来源清单合同不匹配")
        rows, files = load_rows(args.cfct_json_dir, manifest)
        checksum = bundle_sha256(files)
        args.out_sqlite.parent.mkdir(parents=True, exist_ok=True)
        descriptor, name = tempfile.mkstemp(prefix=f".{args.out_sqlite.stem}-", suffix=".tmp", dir=args.out_sqlite.parent)
        os.close(descriptor)
        temporary = Path(name)
        shutil.copy2(args.base_sqlite, temporary)
        try:
            with sqlite3.connect(temporary) as conn:
                conn.execute("PRAGMA foreign_keys=ON")
                summary = import_source(conn, rows, manifest, checksum)
                errors = conn.execute("PRAGMA foreign_key_check").fetchall()
                if errors:
                    raise ValueError(f"CFCT 导入外键错误：{errors[:3]}")
                conn.commit()
            temporary.replace(args.out_sqlite)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        print(json.dumps({"source_version": manifest["source_version"], "checksum": checksum, **summary}, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"CFCT OCR 来源导入失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
