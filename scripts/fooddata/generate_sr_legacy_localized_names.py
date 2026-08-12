#!/usr/bin/env python3
"""使用 Apple 系统翻译生成 Foundation 同格式的 SR Legacy 中文名称 SQLite。"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


CREATE_SQL = """
CREATE TABLE food_localized_name (
  id INTEGER PRIMARY KEY,
  fdc_id INTEGER NOT NULL UNIQUE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  name_type TEXT NOT NULL,
  confidence REAL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE translation_build (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_row_count INTEGER NOT NULL,
  translation_engine TEXT NOT NULL,
  translation_strategy TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  operating_system TEXT NOT NULL
);
"""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_foods(path: Path) -> list[tuple[int, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not {"fdc_id", "description"}.issubset(reader.fieldnames or []):
            raise ValueError("SR Legacy food.csv 缺少 fdc_id 或 description")
        rows = [(int(row["fdc_id"]), str(row["description"]).strip()) for row in reader]
    if not rows or any(not description for _, description in rows):
        raise ValueError("SR Legacy food.csv 为空或包含空英文描述")
    if len({fdc_id for fdc_id, _ in rows}) != len(rows):
        raise ValueError("SR Legacy food.csv 包含重复 fdc_id")
    return sorted(rows)


def load_translation_cache(path: Path) -> dict[int, str]:
    translated: dict[int, str] = {}
    if not path.exists():
        return translated
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        fdc_id = int(row["id"])
        name = str(row["translatedText"]).strip()
        if not name or fdc_id in translated:
            raise ValueError(f"翻译缓存为空或重复：fdc_id={fdc_id}")
        translated[fdc_id] = name
    return translated


def translate(
    helper: Path,
    foods: list[tuple[int, str]],
    cache_path: Path,
) -> dict[int, str]:
    translated = load_translation_cache(cache_path)
    food_ids = {fdc_id for fdc_id, _ in foods}
    if not set(translated) <= food_ids:
        raise ValueError("翻译缓存包含不属于当前 SR Legacy food.csv 的 fdc_id")
    remaining = [(fdc_id, description) for fdc_id, description in foods if fdc_id not in translated]
    payload = "".join(
        json.dumps({"id": str(fdc_id), "text": description}, ensure_ascii=False) + "\n"
        for fdc_id, description in remaining
    )
    if remaining:
        with cache_path.open("a", encoding="utf-8") as cache:
            result = subprocess.run(
                ["swift", str(helper)],
                input=payload,
                text=True,
                encoding="utf-8",
                stdout=cache,
                check=False,
            )
        if result.returncode != 0:
            raise ValueError("Apple 系统翻译进程失败；可使用现有缓存续跑")
        translated = load_translation_cache(cache_path)
    if set(translated) != food_ids:
        raise ValueError("系统翻译结果未完整覆盖 SR Legacy food.csv")
    return translated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sr-food-csv", type=Path, required=True)
    parser.add_argument("--out-sqlite", type=Path, required=True)
    parser.add_argument("--generated-at", required=True, help="固定生成日期，格式 YYYY-MM-DD")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    helper = Path(__file__).with_name("apple_translate_jsonl.swift")
    if args.out_sqlite.exists():
        print(f"输出 SQLite 已存在，拒绝覆盖：{args.out_sqlite}", file=sys.stderr)
        return 2
    if not args.sr_food_csv.is_file() or not helper.is_file():
        print("SR Legacy food.csv 或 Apple 翻译辅助脚本不存在", file=sys.stderr)
        return 2
    try:
        args.out_sqlite.parent.mkdir(parents=True, exist_ok=True)
        foods = load_foods(args.sr_food_csv)
        cache_path = args.out_sqlite.with_suffix(".translations.jsonl.partial")
        translated = translate(helper, foods, cache_path)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{args.out_sqlite.stem}-", suffix=".sqlite.tmp", dir=args.out_sqlite.parent
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            with sqlite3.connect(temporary) as conn:
                conn.executescript(CREATE_SQL)
                conn.executemany(
                    """
                    INSERT INTO food_localized_name (
                      id, fdc_id, locale, name, name_type, confidence, created_at, updated_at
                    ) VALUES (?, ?, 'zh-CN', ?, 'preferred', 0.65, ?, ?)
                    """,
                    [
                        (index, fdc_id, translated[fdc_id], args.generated_at, args.generated_at)
                        for index, (fdc_id, _) in enumerate(foods, start=1)
                    ],
                )
                conn.execute(
                    """
                    INSERT INTO translation_build VALUES (
                      'sr-legacy-2018-04-zh-CN-v1', 'sr_legacy_2018_04', ?, ?,
                      'apple_translation_framework', 'high_fidelity', 'zh-CN', ?, ?
                    )
                    """,
                    (
                        sha256_file(args.sr_food_csv),
                        len(foods),
                        args.generated_at,
                        platform.platform(),
                    ),
                )
                if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("生成的中文名称 SQLite 完整性检查失败")
                conn.commit()
            temporary.replace(args.out_sqlite)
            cache_path.unlink(missing_ok=True)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        print(
            json.dumps(
                {
                    "output": str(args.out_sqlite.resolve()),
                    "rows": len(foods),
                    "locale": "zh-CN",
                    "name_type": "preferred",
                    "confidence": 0.65,
                    "translation_engine": "apple_translation_framework",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (csv.Error, json.JSONDecodeError, OSError, sqlite3.Error, ValueError) as error:
        print(f"SR Legacy 中文名称生成失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
