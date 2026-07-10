# CloudBase FoodData Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 `fooddata_foundation.sqlite` 转换为可重复导入腾讯云开发数据库的 JSON Lines 数据集，并补齐校验、导入操作清单、权限索引说明和后续小程序接入边界。

**Architecture:** SQLite 是源数据，仓库内只保存转换脚本、测试和导入说明，不提交生成的 JSONL 数据。转换脚本必须稳定输出，同一 SQLite 和同一 `data_version` 重复导出的 JSONL checksum 保持一致。转换脚本把当前 Foundation Foods 子集导出为 CloudBase 文档集合：`foods` 对齐 SQLite `food` 表；`food_nutrients` 对齐 SQLite `food_nutrient` 表并补充营养素字典展示字段；`food_localized_name` 对齐 SQLite 同名表；`pet_nutrition_standards` 用于犬粮标准读取。小程序业务代码先不直接接入这些集合，避免导入链路和页面功能混在一个变更里。

**Tech Stack:** Python 3 标准库 `sqlite3/json/hashlib/argparse`；Node.js `node:test` 做回归测试；微信云开发 CloudBase 文档型数据库；JSON Lines 导入文件。

## Global Constraints

- 始终用中文回答、写文档和注释，除非用户明确要求英文。
- 先给计划再动手改代码或文档。
- 代码或文档改动要说明简短原因。
- 优先写可测试、可维护的实现。
- 运行测试失败时，先定位原因，再修复问题。
- 不要回滚用户已有改动；如遇到无关脏改，忽略即可。
- 当前工作必须在 `/Users/cyr/Documents/Projects/Web/dogfood-database-cloudbase` 的 `codex/database-cloudbase` 分支完成，不能触碰原 `ui-fix` worktree。
- 完成任务后不要 git 提交，始终得到允许后再提交。
- 每次对项目做代码、配置、资源、设计稿或文档改动后，必须在 `docs/work-logs/YYYY-MM-DD.md` 追加工作日志。
- 生成的 JSONL、manifest 和临时导入产物不得提交到仓库。
- 实际导入腾讯云开发环境需要用户确认环境 ID、集合权限和执行方式；如果当前没有云环境凭据，本计划的代码验收口径是“生成可导入且可校验的导入包”，实际云端导入按 Task 7 的人工清单完成。

---

## File Structure

- Create: `scripts/fooddata/export_fooddata_cloudbase.py`
  - 读取 SQLite，校验必要表、必要列、外键、输出 `_id` 唯一性、集合行数和最大文档大小，导出 CloudBase JSONL。
  - 只使用 Python 标准库，避免引入依赖。
- Create: `tests/fooddata-cloudbase-export.test.js`
  - 通过 Python 标准库创建临时 SQLite fixture，调用导出脚本，验证集合结构、行数、关键字段、稳定 checksum 和失败路径。
- Modify: `.gitignore`
  - 忽略 `fooddata-cloudbase-export/`，防止误提交导出产物。
- Create: `docs/cloudbase-fooddata-import.md`
  - 记录集合结构、导入命令、权限、索引、校验流程和修订方式。
- Modify: `docs/小程序架构设计.md`
  - 在云数据库集合设计里补充 `foods`、`food_nutrients`、`food_localized_name`、`pet_nutrition_standards` 的定位，不改现有用户数据集合。
- Modify: `docs/work-logs/2026-07-10.md`
  - 记录本次计划和实现改动、原因、验证结果、提交状态。

## Collection Contracts

### `foods`

一条 Foundation Food 一个文档，字段与 SQLite `food` 表内容对齐。完整营养成分不放在这里，中文名称也不放在这里，分别由 `food_nutrients` 和 `food_localized_name` 承担。

```json
{
  "_id": "food_746782",
  "fdc_id": 746782,
  "data_type": "foundation_food",
  "description": "Milk, whole, 3.25% milkfat, with added vitamin D",
  "food_category_id": 1000,
  "publication_date": "2019-04-01",
  "data_version": "2026-07-09",
  "source": "USDA FoodData Central Foundation Foods + GB/T 31216-2014"
}
```

### `food_nutrients`

一条 USDA `food_nutrient` 记录一个文档，保存完整营养成分明细。当前真实 SQLite 中 `food_nutrient` 共 21426 条；每个食物的明细数量最少 0 项、平均约 46 项、最多 159 项。

```json
{
  "_id": "food_nutrient_1100",
  "id": 1100,
  "food_id": "food_746782",
  "fdc_id": 746782,
  "nutrient_id": 1003,
  "name": "Protein",
  "unit_name": "G",
  "amount": 3.15,
  "data_points": 12,
  "derivation_id": 1,
  "min": 2.9,
  "max": 3.4,
  "median": 3.1,
  "footnote": null,
  "min_year_acquired": 2018,
  "data_version": "2026-07-09"
}
```

### `food_localized_name`

一条 SQLite `food_localized_name` 记录一个文档，字段与源表内容对齐，并补充稳定 `food_id` 便于引用 `foods`。

```json
{
  "_id": "food_localized_name_1",
  "id": 1,
  "fdc_id": 746782,
  "food_id": "food_746782",
  "locale": "zh-CN",
  "name": "全脂牛奶,3.25%乳脂,添加维生素d",
  "name_type": "preferred",
  "confidence": 0.95,
  "created_at": "2026-07-09",
  "updated_at": "2026-07-09",
  "data_version": "2026-07-09"
}
```

### `pet_nutrition_standards`

一条标准一个文档，内嵌 profiles、pet nutrients 和 requirements，适合前端或云函数一次读取。

```json
{
  "_id": "pet_standard_1",
  "region_code": "CN",
  "authority": "GB/T",
  "standard_code": "GB/T 31216-2014",
  "title": "全价宠物食品 犬粮",
  "version": "2014",
  "status": "active",
  "profiles": [
    {
      "profile_code": "adult",
      "profile_name": "成年犬粮",
      "life_stage": "adult",
      "requirements": [
        {
          "pet_nutrient_code": "crude_protein",
          "name_zh": "粗蛋白",
          "requirement_type": "min",
          "value": 18,
          "value_text": null,
          "unit": "%",
          "basis": "dry_matter"
        }
      ]
    }
  ],
  "data_version": "2026-07-09"
}
```

## Task 1: 写导出脚本骨架和失败路径测试

**Files:**
- Create: `scripts/fooddata/export_fooddata_cloudbase.py`
- Create: `tests/fooddata-cloudbase-export.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces command: `python3 scripts/fooddata/export_fooddata_cloudbase.py --sqlite <path> --out-dir <dir> --data-version <version>`
- Produces files: `foods.jsonl`, `food_nutrients.jsonl`, `food_localized_name.jsonl`, `pet_nutrition_standards.jsonl`, `cloudbase-import-manifest.json`

- [ ] **Step 1: Write failing tests for argument validation**

Add this test file:

```javascript
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts/fooddata/export_fooddata_cloudbase.py')

function runExporter(args) {
  return spawnSync('python3', [script, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runPython(code, args = [], input = '') {
  return spawnSync('python3', ['-c', code, ...args], {
    cwd: root,
    input,
    encoding: 'utf8'
  })
}

test('导出脚本在 SQLite 文件不存在时给出清晰错误', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fooddata-export-'))
  const result = runExporter([
    '--sqlite', path.join(tmp, 'missing.sqlite'),
    '--out-dir', path.join(tmp, 'out'),
    '--data-version', 'test-version'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /SQLite 文件不存在/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: FAIL because `scripts/fooddata/export_fooddata_cloudbase.py` does not exist.

- [ ] **Step 3: Write minimal exporter with argument parsing**

Create `scripts/fooddata/export_fooddata_cloudbase.py`:

```python
#!/usr/bin/env python3
"""将 FoodData SQLite 导出为腾讯云开发数据库可导入的 JSON Lines 文件。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出 FoodData CloudBase JSONL")
    parser.add_argument("--sqlite", required=True, help="SQLite 数据库路径")
    parser.add_argument("--out-dir", required=True, help="输出目录")
    parser.add_argument("--data-version", required=True, help="数据版本，例如 2026-07-09")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sqlite_path = Path(args.sqlite)
    if not sqlite_path.exists():
        print(f"SQLite 文件不存在：{sqlite_path}", file=sys.stderr)
        return 2
    Path(args.out_dir).mkdir(parents=True, exist_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Add to `.gitignore`:

```gitignore

# FoodData 云数据库导出产物
fooddata-cloudbase-export/
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: PASS.

## Task 2: 导出 `foods`、`food_nutrients` 和 `food_localized_name`

**Files:**
- Modify: `scripts/fooddata/export_fooddata_cloudbase.py`
- Modify: `tests/fooddata-cloudbase-export.test.js`

**Interfaces:**
- Produces `foods.jsonl`: one document per `food`.
- Produces `food_nutrients.jsonl`: one document per `food_nutrient`.
- Produces `food_localized_name.jsonl`: one document per `food_localized_name`.
- Uses deterministic `_id` helpers:
  - `food_id(fdc_id) -> "food_<fdc_id>"`
  - `food_nutrient_id(id) -> "food_nutrient_<id>"`
  - `food_localized_name_id(id) -> "food_localized_name_<id>"`

- [ ] **Step 1: Add fixture database and export assertions**

Append helpers and tests to `tests/fooddata-cloudbase-export.test.js`:

```javascript
function createFixtureDatabase(file) {
  const sql = `
CREATE TABLE food (
  fdc_id INTEGER PRIMARY KEY,
  data_type TEXT NOT NULL,
  description TEXT NOT NULL,
  food_category_id INTEGER,
  publication_date TEXT
);
CREATE TABLE nutrient (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  nutrient_nbr TEXT,
  rank INTEGER
);
CREATE TABLE food_nutrient (
  id INTEGER PRIMARY KEY,
  fdc_id INTEGER NOT NULL,
  nutrient_id INTEGER NOT NULL,
  amount REAL,
  data_points INTEGER,
  derivation_id INTEGER,
  min REAL,
  max REAL,
  median REAL,
  footnote TEXT,
  min_year_acquired INTEGER
);
CREATE TABLE food_localized_name (
  id INTEGER PRIMARY KEY,
  fdc_id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  name_type TEXT NOT NULL,
  confidence REAL,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE pet_nutrition_standard (
  id INTEGER PRIMARY KEY,
  region_code TEXT NOT NULL,
  authority TEXT NOT NULL,
  standard_code TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  publication_date TEXT,
  effective_date TEXT,
  status TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE pet_nutrition_profile (
  id INTEGER PRIMARY KEY,
  standard_id INTEGER NOT NULL,
  species TEXT NOT NULL,
  profile_code TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  life_stage TEXT NOT NULL,
  product_scope TEXT NOT NULL,
  food_form TEXT NOT NULL,
  default_basis TEXT NOT NULL,
  energy_density_kcal_per_kg REAL,
  energy_density_basis TEXT,
  moisture_basis_percent REAL,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE pet_nutrient (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT,
  category TEXT NOT NULL,
  nutrient_kind TEXT NOT NULL,
  expression_json TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE pet_nutrient_requirement (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  pet_nutrient_id INTEGER NOT NULL,
  requirement_type TEXT NOT NULL,
  value REAL,
  value_text TEXT,
  unit TEXT NOT NULL,
  basis TEXT NOT NULL,
  condition_code TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  applies_when TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
INSERT INTO food VALUES (746782, 'foundation_food', 'Milk, whole', 100, '2026-04-30');
INSERT INTO nutrient VALUES (1003, 'Protein', 'G', '203', 600);
INSERT INTO nutrient VALUES (1004, 'Total lipid (fat)', 'G', '204', 800);
INSERT INTO nutrient VALUES (1008, 'Energy', 'KCAL', '208', 300);
INSERT INTO nutrient VALUES (1051, 'Water', 'G', '255', 100);
INSERT INTO food_nutrient VALUES (1, 746782, 1003, 3.15, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_nutrient VALUES (2, 746782, 1004, 3.25, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_nutrient VALUES (3, 746782, 1008, 61, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_nutrient VALUES (4, 746782, 1051, 88.1, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_localized_name VALUES (1, 746782, 'zh-CN', '全脂牛奶', 'preferred', 0.95, '2026-07-09', '2026-07-09');
INSERT INTO food_localized_name VALUES (2, 746782, 'zh-CN', '牛奶', 'alias', 0.8, '2026-07-09', '2026-07-09');
`
  const result = runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.executescript(sys.stdin.read())
conn.commit()
conn.close()
`, [file], sql)
  assert.equal(result.status, 0, result.stderr)
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

test('导出 foods、food_nutrients 和 food_localized_name 文档', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fooddata-export-'))
  const sqlite = path.join(tmp, 'fixture.sqlite')
  const out = path.join(tmp, 'out')
  createFixtureDatabase(sqlite)

  const result = runExporter([
    '--sqlite', sqlite,
    '--out-dir', out,
    '--data-version', 'test-version'
  ])

  assert.equal(result.status, 0, result.stderr)
  const foods = readJsonl(path.join(out, 'foods.jsonl'))
  const nutrients = readJsonl(path.join(out, 'food_nutrients.jsonl'))
  const names = readJsonl(path.join(out, 'food_localized_name.jsonl'))

  assert.equal(foods.length, 1)
  assert.equal(foods[0]._id, 'food_746782')
  assert.equal(foods[0].fdc_id, 746782)
  assert.equal(foods[0].description, 'Milk, whole')
  assert.equal(foods[0].preferred_name_zh, undefined)
  assert.equal(foods[0].alias_names_zh, undefined)
  assert.equal(foods[0].nutrients, undefined)
  assert.equal(foods[0].nutrient_summary, undefined)
  assert.equal(foods[0].search_terms, undefined)
  assert.equal(foods[0].localized_names, undefined)

  assert.equal(nutrients.length, 4)
  assert.equal(nutrients[0]._id, 'food_nutrient_1')
  assert.equal(nutrients[0].food_id, 'food_746782')
  assert.equal(nutrients[0].nutrient_id, 1051)
  assert.equal(nutrients[0].name, 'Water')

  assert.equal(names.length, 2)
  assert.equal(names[0]._id, 'food_localized_name_1')
  assert.equal(names[0].id, 1)
  assert.equal(names[0].food_id, 'food_746782')
  assert.equal(names[0].name, '全脂牛奶')
  assert.equal(names[0].normalized_name, undefined)
  assert.equal(names[0].description, undefined)
})

test('同一 SQLite 和 data_version 重复导出 foods checksum 保持一致', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fooddata-export-'))
  const sqlite = path.join(tmp, 'fixture.sqlite')
  const outA = path.join(tmp, 'out-a')
  const outB = path.join(tmp, 'out-b')
  createFixtureDatabase(sqlite)

  const first = runExporter(['--sqlite', sqlite, '--out-dir', outA, '--data-version', 'test-version'])
  const second = runExporter(['--sqlite', sqlite, '--out-dir', outB, '--data-version', 'test-version'])

  assert.equal(first.status, 0, first.stderr)
  assert.equal(second.status, 0, second.stderr)
  assert.equal(
    sha256File(path.join(outA, 'foods.jsonl')),
    sha256File(path.join(outB, 'foods.jsonl'))
  )
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: FAIL because JSONL export is not implemented.

- [ ] **Step 3: Implement export helpers**

Add to `scripts/fooddata/export_fooddata_cloudbase.py`:

```python
import hashlib
import json
import sqlite3
from typing import Any


SOURCE_LABEL = "USDA FoodData Central Foundation Foods + GB/T 31216-2014"


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


def stable_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]


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
        SELECT ln.id, ln.fdc_id, ln.locale, ln.name, ln.name_type, ln.confidence, ln.created_at, ln.updated_at
        FROM food_localized_name ln
        ORDER BY ln.id
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
```

Update `main()` to open SQLite and write the two JSONL files:

```python
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(sqlite_path)
    foods = build_food_documents(conn, args.data_version)
    food_nutrients = build_food_nutrient_documents(conn, args.data_version)
    food_localized_name = build_food_localized_name_documents(conn, args.data_version)
    write_jsonl(out_dir / "foods.jsonl", foods)
    write_jsonl(out_dir / "food_nutrients.jsonl", food_nutrients)
    write_jsonl(out_dir / "food_localized_name.jsonl", food_localized_name)
    return 0
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: PASS.

## Task 3: 导出犬粮标准集合

**Files:**
- Modify: `scripts/fooddata/export_fooddata_cloudbase.py`
- Modify: `tests/fooddata-cloudbase-export.test.js`

**Interfaces:**
- Produces `pet_nutrition_standards.jsonl`: one document per `pet_nutrition_standard`.
- Each standard embeds `profiles`; each profile embeds `requirements`.

- [ ] **Step 1: Add fixture rows and assertions**

Extend `createFixtureDatabase()` SQL:

```sql
INSERT INTO pet_nutrition_standard VALUES (1, 'CN', 'GB/T', 'GB/T 31216-2014', '全价宠物食品 犬粮', '2014', NULL, NULL, 'active', NULL, '测试标准', '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrition_profile VALUES (1, 1, 'dog', 'adult', '成年犬粮', 'adult', 'complete_food', 'all', 'dry_matter', NULL, NULL, NULL, NULL, '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrient VALUES (1, 'crude_protein', 'Crude protein', '粗蛋白', 'proximate', 'atomic', NULL, NULL, '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrient_requirement VALUES (1, 1, 1, 'min', 18.0, NULL, '%', 'dry_matter', '', '', NULL, NULL, '2026-07-09', '2026-07-09');
```

Append assertions to the export test:

```javascript
  const standards = readJsonl(path.join(out, 'pet_nutrition_standards.jsonl'))
  assert.equal(standards.length, 1)
  assert.equal(standards[0]._id, 'pet_standard_1')
  assert.equal(standards[0].profiles[0].profile_code, 'adult')
  assert.equal(standards[0].profiles[0].requirements[0].pet_nutrient_code, 'crude_protein')
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: FAIL because `pet_nutrition_standards.jsonl` is missing.

- [ ] **Step 3: Implement standard export**

Add to `scripts/fooddata/export_fooddata_cloudbase.py`:

```python
def build_pet_standard_documents(conn: sqlite3.Connection, data_version: str) -> list[dict[str, Any]]:
    standards = dict_rows(conn, "SELECT * FROM pet_nutrition_standard ORDER BY id")
    docs: list[dict[str, Any]] = []
    for standard in standards:
        profiles = dict_rows(conn, "SELECT * FROM pet_nutrition_profile WHERE standard_id = ? ORDER BY id", (standard["id"],))
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
```

Update `main()`:

```python
    pet_standards = build_pet_standard_documents(conn, args.data_version)
    write_jsonl(out_dir / "pet_nutrition_standards.jsonl", pet_standards)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: PASS.

## Task 4: 加入源库校验和 manifest

**Files:**
- Modify: `scripts/fooddata/export_fooddata_cloudbase.py`
- Modify: `tests/fooddata-cloudbase-export.test.js`

**Interfaces:**
- Produces `cloudbase-import-manifest.json` with counts and checksums.
- Exits non-zero if required tables/columns are absent, `PRAGMA foreign_key_check` returns rows, output `_id` duplicates, or `foods` documents exceed the configured size threshold.

- [ ] **Step 1: Add manifest assertions**

Append to export test:

```javascript
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'cloudbase-import-manifest.json'), 'utf8'))
  assert.equal(manifest.data_version, 'test-version')
  assert.equal(manifest.collections.foods.rows, 1)
  assert.equal(manifest.collections.food_nutrients.rows, 4)
  assert.equal(manifest.collections.food_localized_name.rows, 2)
  assert.equal(manifest.collections.pet_nutrition_standards.rows, 1)
  assert.equal(manifest.source_tables.food.rows, 1)
  assert.equal(manifest.source_tables.food_nutrient.rows, 4)
  assert.ok(manifest.collections.foods.max_document_bytes > 0)
  assert.match(manifest.collections.foods.sha256, /^[a-f0-9]{64}$/)
```

Add a missing-table test:

```javascript
test('导出脚本在必要表缺失时失败', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fooddata-export-'))
  const sqlite = path.join(tmp, 'empty.sqlite')
  runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.execute('CREATE TABLE food (id INTEGER)')
conn.commit()
conn.close()
`, [sqlite])

  const result = runExporter([
    '--sqlite', sqlite,
    '--out-dir', path.join(tmp, 'out'),
    '--data-version', 'test-version'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少必要数据表/)
})

test('导出脚本在必要列缺失时失败', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fooddata-export-'))
  const sqlite = path.join(tmp, 'broken.sqlite')
  runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.executescript('''
CREATE TABLE food (fdc_id INTEGER PRIMARY KEY);
CREATE TABLE nutrient (id INTEGER PRIMARY KEY, name TEXT, unit_name TEXT, nutrient_nbr TEXT, rank INTEGER);
CREATE TABLE food_nutrient (id INTEGER PRIMARY KEY, fdc_id INTEGER, nutrient_id INTEGER, amount REAL, data_points INTEGER, derivation_id INTEGER, min REAL, max REAL, median REAL, footnote TEXT, min_year_acquired INTEGER);
CREATE TABLE food_localized_name (id INTEGER PRIMARY KEY, fdc_id INTEGER, locale TEXT, name TEXT, name_type TEXT, confidence REAL, created_at TEXT, updated_at TEXT);
CREATE TABLE pet_nutrition_standard (id INTEGER PRIMARY KEY, region_code TEXT, authority TEXT, standard_code TEXT, title TEXT, version TEXT, publication_date TEXT, effective_date TEXT, status TEXT, source_url TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE pet_nutrition_profile (id INTEGER PRIMARY KEY, standard_id INTEGER, species TEXT, profile_code TEXT, profile_name TEXT, life_stage TEXT, product_scope TEXT, food_form TEXT, default_basis TEXT, energy_density_kcal_per_kg REAL, energy_density_basis TEXT, moisture_basis_percent REAL, notes TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE pet_nutrient (id INTEGER PRIMARY KEY, code TEXT, name_en TEXT, name_zh TEXT, category TEXT, nutrient_kind TEXT, expression_json TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE pet_nutrient_requirement (id INTEGER PRIMARY KEY, profile_id INTEGER, pet_nutrient_id INTEGER, requirement_type TEXT, value REAL, value_text TEXT, unit TEXT, basis TEXT, condition_code TEXT, condition_json TEXT, applies_when TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
''')
conn.commit()
conn.close()
`, [sqlite])

  const result = runExporter([
    '--sqlite', sqlite,
    '--out-dir', path.join(tmp, 'out'),
    '--data-version', 'test-version'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少必要字段/)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: FAIL because manifest and table validation are missing.

- [ ] **Step 3: Implement validation and manifest**

Add to exporter:

```python
MAX_FOOD_DOCUMENT_BYTES = 512 * 1024

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
    "food_localized_name": {"id", "fdc_id", "locale", "name", "name_type", "confidence", "created_at", "updated_at"},
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
        if max_bytes > MAX_FOOD_DOCUMENT_BYTES:
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
```

Replace `main()` with this final version:

```python
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/fooddata-cloudbase-export.test.js`

Expected: PASS.

## Task 5: 在真实 SQLite 上做只读导出验证

**Files:**
- No code file changes.

**Interfaces:**
- Consumes source SQLite: `/Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite`
- Produces local ignored output: `fooddata-cloudbase-export/2026-07-09/`

- [ ] **Step 1: Run exporter against real database**

Run:

```bash
python3 scripts/fooddata/export_fooddata_cloudbase.py \
  --sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-09 \
  --data-version 2026-07-09
```

Expected: exit code 0.

- [ ] **Step 2: Inspect manifest**

Run:

```bash
python3 -m json.tool fooddata-cloudbase-export/2026-07-09/cloudbase-import-manifest.json
```

Expected counts:

```json
{
  "foods": { "rows": 469 },
  "food_nutrients": { "rows": 21426 },
  "food_localized_name": { "rows": 534 },
  "pet_nutrition_standards": { "rows": 1 }
}
```

- [ ] **Step 3: Check largest document size across exported collections**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
for path in sorted(Path('fooddata-cloudbase-export/2026-07-09').glob('*.jsonl')):
    sizes = [len(line.encode('utf-8')) for line in path.read_text(encoding='utf-8').splitlines() if line]
    print(path.name, max(sizes) if sizes else 0)
PY
```

Expected: every collection's largest document stays below the `512 KB` threshold.

- [ ] **Step 4: Verify generated files stay ignored**

Run:

```bash
git check-ignore fooddata-cloudbase-export/2026-07-09/foods.jsonl
```

Expected: prints `fooddata-cloudbase-export/2026-07-09/foods.jsonl`.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: all tests pass.

## Task 6: 编写导入和运维文档

**Files:**
- Create: `docs/cloudbase-fooddata-import.md`
- Modify: `docs/小程序架构设计.md`
- Modify: `docs/work-logs/2026-07-10.md`

**Interfaces:**
- Produces human workflow for console import and CLI import.
- Does not require actual cloud credentials in repo.

- [ ] **Step 1: Write import doc**

Create `docs/cloudbase-fooddata-import.md` with these sections:

```markdown
# FoodData 云数据库导入说明

## 数据源

源数据库：`/Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite`

导出命令：

```bash
python3 scripts/fooddata/export_fooddata_cloudbase.py \
  --sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-09 \
  --data-version 2026-07-09
```

## 集合

- `foods`：食物主信息，一条食物一个文档，不包含营养摘要或完整营养明细。
- `food_nutrients`：完整 USDA 营养成分明细，一条 `food_nutrient` 一个文档。
- `food_localized_name`：本地化名称记录，一条 SQLite `food_localized_name` 一个文档。
- `pet_nutrition_standards`：犬粮营养标准，一条标准一个文档。

## 导入方式

首次导入使用 Insert。重复同步使用 Upsert，并依赖 `_id` 保持稳定。

JSON 文件是 JSON Lines 格式，每行一条文档：

- `foods.jsonl`
- `food_nutrients.jsonl`
- `food_localized_name.jsonl`
- `pet_nutrition_standards.jsonl`

推荐导入顺序：

1. `foods`
2. `food_nutrients`
3. `food_localized_name`
4. `pet_nutrition_standards`

导入前确认云环境 ID，且不要把环境 ID、密钥或登录态写入仓库。

## 推荐权限

公共营养数据集合允许小程序端读取，禁止小程序端写入。写入只通过控制台、导入流程或管理员云函数完成。

建议规则语义：

```json
{
  "read": true,
  "write": false
}
```

如果控制台使用模板权限，选择“所有用户可读，仅管理员可写”。

## 推荐索引

- `foods.fdc_id`：升序，唯一性由 `_id = food_<fdc_id>` 保证。
- `food_nutrients.food_id`：升序，用于按食物读取完整营养明细。
- `food_nutrients.fdc_id`：升序，用于按 USDA 食物 ID 查询营养明细。
- `food_nutrients.nutrient_id`：升序，用于按营养素反查食物。
- `food_localized_name.locale`：升序，用于限定语言地区。
- `food_localized_name.name`：升序，用于精确名称查询。
- `food_localized_name.name_type`：升序，用于区分主名称和别名。
- `food_localized_name.fdc_id`：升序，用于从名称结果回查食物。
- `pet_nutrition_standards.standard_code`：升序，用于按标准编号读取。

## 校验

导入前检查 `cloudbase-import-manifest.json` 的行数和 sha256。导入后在控制台确认集合记录数：

- `foods`: 469
- `food_nutrients`: 21426
- `food_localized_name`: 534
- `pet_nutrition_standards`: 1

导入后抽查查询：

- `foods` 按 `_id = food_746782` 能读到食物主信息，且没有 `nutrients` 或 `nutrient_summary` 字段。
- `food_nutrients` 按 `food_id = food_746782` 能读到完整营养明细。
- `food_localized_name` 按 `locale = zh-CN` 且 `name = 全脂牛奶` 能读到 `food_id = food_746782`。
- `pet_nutrition_standards` 按 `standard_code = GB/T 31216-2014` 能读到 `profiles`。

## 修订流程

少量错别字可以在控制台临时修订，但长期以 SQLite 重建链路和导出脚本为准。修订源数据后重新导出 JSONL，再用 Upsert 同步到云数据库。
```

- [ ] **Step 2: Update architecture doc**

Add a subsection after existing CloudBase collection design:

```markdown
### 4.5 foods / food_nutrients / food_localized_name / pet_nutrition_standards 集合

营养基础数据从 SQLite 通过 `scripts/fooddata/export_fooddata_cloudbase.py` 导出到 CloudBase。`foods` 与 SQLite `food` 表内容对齐，`food_nutrients` 与 SQLite `food_nutrient` 表内容对齐并补充营养素展示字段，`food_localized_name` 与 SQLite 同名表内容对齐，`pet_nutrition_standards` 面向犬粮标准展示和比对。

这些集合是公共只读数据，不包含用户隐私；小程序端可以读取，但不能写入。数据修订以源 SQLite 和导出脚本为准，线上集合通过 Insert/Upsert 同步。
```

- [ ] **Step 3: Update work log**

Append to `docs/work-logs/2026-07-10.md`:

```markdown
## HH:MM FoodData 云数据库导入计划与导出工具

- 改动摘要：新增 SQLite 到 CloudBase JSONL 的导出脚本计划/实现、导入说明和集合设计说明。
- 原因：当前营养库是 SQLite 关系库，云开发数据库需要文档型 JSONL，并需要可重复校验的导入流程。
- 验证结果：运行 `npm test`；真实 SQLite 导出后检查 manifest 行数。
- 提交信息：未提交，等待确认。
```

- [ ] **Step 4: Run final verification**

Run:

```bash
git status --short
git check-ignore fooddata-cloudbase-export/2026-07-09/foods.jsonl
npm test
```

Expected: only planned files changed; generated export files are ignored; all tests pass.

## Task 7: 执行 CloudBase 导入人工验收

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes ignored output directory: `fooddata-cloudbase-export/2026-07-09/`
- Requires user-confirmed CloudBase environment ID and console/CLI access.
- Produces cloud collections: `foods`, `food_nutrients`, `food_localized_name`, `pet_nutrition_standards`

- [ ] **Step 1: Confirm target environment**

Ask the user to confirm:

```text
请确认要导入的腾讯云开发环境 ID，以及本次是首次导入 Insert 还是重复同步 Upsert。
```

Expected: user provides an environment ID or says only生成导入包暂不导入。

- [ ] **Step 2: Create or confirm collections**

In CloudBase console or WeChat Developer Tools cloud database panel, confirm these collections exist:

```text
foods
food_nutrients
food_localized_name
pet_nutrition_standards
```

Expected: all four collections exist before import.

- [ ] **Step 3: Import JSON Lines files**

Import files from `fooddata-cloudbase-export/2026-07-09/`:

```text
foods <- foods.jsonl
food_nutrients <- food_nutrients.jsonl
food_localized_name <- food_localized_name.jsonl
pet_nutrition_standards <- pet_nutrition_standards.jsonl
```

Expected:

- First import mode: Insert.
- Repeat sync mode: Upsert by `_id`.
- Import completes without rejected rows.

- [ ] **Step 4: Set read-only permissions**

Set each public nutrition collection to:

```json
{
  "read": true,
  "write": false
}
```

Expected: mini program clients can read public nutrition data and cannot write these collections.

- [ ] **Step 5: Create indexes**

Create indexes:

```text
foods.fdc_id ASC
food_nutrients.food_id ASC
food_nutrients.fdc_id ASC
food_nutrients.nutrient_id ASC
food_localized_name.locale ASC
food_localized_name.name ASC
food_localized_name.name_type ASC
food_localized_name.fdc_id ASC
pet_nutrition_standards.standard_code ASC
```

Expected: console shows indexes are created or building.

- [ ] **Step 6: Verify cloud record counts and sample reads**

Check collection counts:

```text
foods = 469
food_nutrients = 21426
food_localized_name = 534
pet_nutrition_standards = 1
```

Sample reads:

```text
foods._id == food_746782
food_nutrients.food_id == food_746782
food_localized_name.locale == zh-CN AND food_localized_name.name == 全脂牛奶
pet_nutrition_standards.standard_code == GB/T 31216-2014
```

Expected: sample records match manifest; `foods` contains no nutrition summary or embedded nutrients, `food_nutrients` contains USDA nutrition detail rows, and `pet_nutrition_standards` contains nested profiles.

## Open Decisions Before Implementation

- 云环境 ID 和凭据不写进仓库；实际导入到哪个 CloudBase 环境由用户在微信开发者工具或控制台确认，并按 Task 7 执行验收。
- 本计划不改小程序页面，不新增前端食材搜索 UI；接入读取应作为后续独立计划。
- 当前不引入 CloudBase CLI 依赖；文档只描述导入文件和控制台/CLI 可选路径，避免把环境凭据绑定到仓库。
