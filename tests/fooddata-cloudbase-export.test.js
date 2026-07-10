const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
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
INSERT INTO pet_nutrition_standard VALUES (1, 'CN', 'GB/T', 'GB/T 31216-2014', '全价宠物食品 犬粮', '2014', NULL, NULL, 'active', NULL, '测试标准', '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrition_profile VALUES (1, 1, 'dog', 'adult', '成年犬粮', 'adult', 'complete_food', 'all', 'dry_matter', NULL, NULL, NULL, NULL, '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrient VALUES (1, 'crude_protein', 'Crude protein', '粗蛋白', 'proximate', 'atomic', NULL, NULL, '2026-07-09', '2026-07-09');
INSERT INTO pet_nutrient_requirement VALUES (1, 1, 1, 'min', 18.0, NULL, '%', 'dry_matter', '', '', NULL, NULL, '2026-07-09', '2026-07-09');
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

test('导出 foods、food_nutrients、food_localized_name 和 pet_nutrition_standards 文档', () => {
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
  const localizedNames = readJsonl(path.join(out, 'food_localized_name.jsonl'))
  const standards = readJsonl(path.join(out, 'pet_nutrition_standards.jsonl'))
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'cloudbase-import-manifest.json'), 'utf8'))

  assert.equal(foods.length, 1)
  assert.equal(foods[0]._id, 'food_746782')
  assert.equal(foods[0].fdc_id, 746782)
  assert.equal(foods[0].description, 'Milk, whole')
  assert.equal(foods[0].preferred_name_zh, undefined)
  assert.equal(foods[0].alias_names_zh, undefined)
  assert.equal(foods[0].nutrients, undefined)
  assert.equal(foods[0].nutrient_summary, undefined)

  assert.equal(nutrients.length, 4)
  assert.equal(nutrients[0]._id, 'food_nutrient_4')
  assert.equal(nutrients[0].food_id, 'food_746782')
  assert.equal(nutrients[0].nutrient_id, 1051)
  assert.equal(nutrients[0].name, 'Water')

  assert.equal(localizedNames.length, 2)
  assert.equal(localizedNames[0]._id, 'food_localized_name_1')
  assert.equal(localizedNames[0].id, 1)
  assert.equal(localizedNames[0].food_id, 'food_746782')
  assert.equal(localizedNames[0].name, '全脂牛奶')
  assert.equal(localizedNames[0].normalized_name, undefined)
  assert.equal(localizedNames[0].description, undefined)

  assert.equal(standards.length, 1)
  assert.equal(standards[0]._id, 'pet_standard_1')
  assert.equal(standards[0].profiles[0].profile_code, 'adult')
  assert.equal(standards[0].profiles[0].requirements[0].pet_nutrient_code, 'crude_protein')

  assert.equal(manifest.data_version, 'test-version')
  assert.equal(manifest.collections.foods.rows, 1)
  assert.equal(manifest.collections.food_nutrients.rows, 4)
  assert.equal(manifest.collections.food_localized_name.rows, 2)
  assert.equal(manifest.collections.pet_nutrition_standards.rows, 1)
  assert.equal(manifest.source_tables.food.rows, 1)
  assert.equal(manifest.source_tables.food_nutrient.rows, 4)
  assert.match(manifest.collections.foods.sha256, /^[a-f0-9]{64}$/)
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
