const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts/fooddata/build_ingredient_data_sqlite.py')
const exporter = path.join(root, 'scripts/fooddata/export_ingredient_cloudbase.py')

function runBuilder(args) {
  return spawnSync('python3', [script, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runExporter(args) {
  return spawnSync('python3', [exporter, ...args], {
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

function createFoundationFixture(file) {
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
INSERT INTO food VALUES (10, 'foundation_food', 'Tomato, raw', 11, '2026-04-30');
INSERT INTO nutrient VALUES (1003, 'Protein', 'G', '203', 600);
INSERT INTO nutrient VALUES (1004, 'Total lipid (fat)', 'G', '204', 800);
INSERT INTO nutrient VALUES (1008, 'Energy', 'KCAL', '208', 300);
INSERT INTO food_nutrient VALUES (100, 10, 1003, 0.88, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_nutrient VALUES (101, 10, 1004, 0, 2, NULL, NULL, NULL, NULL, NULL, 2024);
INSERT INTO food_nutrient VALUES (102, 10, 1008, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO food_localized_name VALUES (1, 10, 'zh-CN', '番茄', 'preferred', 1.0, '2026-07-21', '2026-07-21');
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

function createSrFixture(directory) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'food.csv'),
    '"fdc_id","data_type","description","food_category_id","publication_date"\n' +
      '"20","sr_legacy_food","Pork heart, raw","10","2019-04-01"\n'
  )
  fs.writeFileSync(
    path.join(directory, 'nutrient.csv'),
    '"id","name","unit_name","nutrient_nbr","rank"\n' +
      '"1003","Protein, legacy label","G","203","600"\n'
  )
  fs.writeFileSync(
    path.join(directory, 'food_nutrient.csv'),
    '"id","fdc_id","nutrient_id","amount","data_points","derivation_id","min","max","median","footnote","min_year_acquired"\n' +
      '"200","20","1003","17.27","1","46","","","","",""\n'
  )
  fs.writeFileSync(
    path.join(directory, 'food_category.csv'),
    '"id","code","description"\n"10","1000","Pork Products"\n'
  )
  fs.writeFileSync(
    path.join(directory, 'sr_legacy_food.csv'),
    '"fdc_id","NDB_number"\n"20","10110"\n'
  )
}

function createRecipeFixture(file) {
  fs.writeFileSync(
    file,
    '"id","cid","zid","title","yl","fl"\n' +
      '"1","下饭菜,\r\n午餐,","家常菜","番茄鸡蛋","番茄#\r\n鸡蛋#","2个##"\n' +
      '"2","午餐,","煮","牛肉汤","牛肉#\r\n姜#","100克#"\n'
  )
}

function createFixtureSet() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-data-build-'))
  const foundation = path.join(tmp, 'foundation.sqlite')
  const srDir = path.join(tmp, 'sr-legacy')
  const recipes = path.join(tmp, 'recipes.csv')
  const output = path.join(tmp, 'ingredient-data.sqlite')
  createFoundationFixture(foundation)
  createSrFixture(srDir)
  createRecipeFixture(recipes)
  return { tmp, foundation, srDir, recipes, output }
}

function queryDatabase(file) {
  const code = `
import json
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.row_factory = sqlite3.Row

def rows(sql):
    return [dict(row) for row in conn.execute(sql).fetchall()]

result = {
    'tables': sorted(row['name'] for row in rows("SELECT name FROM sqlite_master WHERE type = 'table'")),
    'releases': rows('SELECT release_id, source_kind, source_version, license_status FROM source_release ORDER BY source_version'),
    'food_counts': rows('SELECT source_release_id, COUNT(*) AS rows FROM source_food GROUP BY source_release_id ORDER BY source_release_id'),
    'nutrients': rows('SELECT source_release_id, nutrient_id, name FROM source_nutrient WHERE nutrient_id = 1003 ORDER BY source_release_id'),
    'recipes': rows('SELECT recipe_id, categories_json, ingredient_count, amount_count, amount_alignment_status FROM human_recipe ORDER BY recipe_id'),
    'mentions': rows('SELECT recipe_id, position, raw_name, normalized_name, amount_raw FROM human_recipe_ingredient_mention ORDER BY recipe_id, position'),
    'terms': rows('SELECT normalized_name, occurrence_count FROM recipe_ingredient_term ORDER BY normalized_name'),
    'knowledge_counts': {
        'concepts': conn.execute('SELECT COUNT(*) FROM ingredient_concept').fetchone()[0],
        'aliases': conn.execute('SELECT COUNT(*) FROM ingredient_alias').fetchone()[0],
        'variants': conn.execute('SELECT COUNT(*) FROM ingredient_variant').fetchone()[0],
        'policies': conn.execute('SELECT COUNT(*) FROM canine_ingredient_policy').fetchone()[0],
    },
    'foreign_key_errors': rows('PRAGMA foreign_key_check'),
}
print(json.dumps(result, ensure_ascii=False))
conn.close()
`
  const result = runPython(code, [file])
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('构建器保留来源隔离的 USDA 数据并解析菜谱原料', () => {
  const { foundation, srDir, recipes, output } = createFixtureSet()
  const result = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'test-release'
  ])

  assert.equal(result.status, 0, result.stderr)
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.release_id, 'test-release')
  assert.equal(summary.schema_version, 1)
  assert.equal(summary.counts.source_food, 2)
  assert.equal(summary.counts.source_food_nutrient, 4)
  assert.equal(summary.counts.human_recipe, 2)
  assert.equal(summary.counts.human_recipe_ingredient_mention, 4)

  const database = queryDatabase(output)
  assert.ok(database.tables.includes('ingredient_concept'))
  assert.ok(database.tables.includes('ingredient_mapping_decision'))
  assert.ok(database.tables.includes('canine_ingredient_policy'))
  assert.equal(database.releases.length, 3)
  assert.equal(database.releases.find((item) => item.source_kind === 'human_recipe').license_status, 'needs_review')

  assert.equal(database.food_counts.length, 2)
  assert.equal(database.nutrients.length, 2)
  assert.deepEqual(database.nutrients.map((item) => item.name).sort(), [
    'Protein',
    'Protein, legacy label'
  ])

  assert.deepEqual(JSON.parse(database.recipes[0].categories_json), ['下饭菜', '午餐'])
  assert.equal(database.recipes[0].amount_alignment_status, 'aligned')
  assert.equal(database.recipes[1].amount_alignment_status, 'missing_amounts')
  assert.deepEqual(database.mentions.map((item) => item.normalized_name), ['番茄', '鸡蛋', '牛肉', '姜'])
  assert.equal(database.mentions[1].amount_raw, null)
  assert.equal(database.mentions[3].amount_raw, null)
  assert.equal(database.terms.length, 4)
  assert.deepEqual(database.knowledge_counts, {
    concepts: 0,
    aliases: 0,
    variants: 0,
    policies: 0
  })
  assert.deepEqual(database.foreign_key_errors, [])
})

test('构建器拒绝覆盖已经存在的输出 SQLite', () => {
  const { foundation, srDir, recipes, output } = createFixtureSet()
  fs.writeFileSync(output, 'keep')

  const result = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'test-release'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /拒绝覆盖/)
  assert.equal(fs.readFileSync(output, 'utf8'), 'keep')
})

test('构建器在 SR Legacy 文件缺失时给出清晰错误', () => {
  const { foundation, srDir, recipes, output } = createFixtureSet()
  fs.unlinkSync(path.join(srDir, 'food_nutrient.csv'))

  const result = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'test-release'
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少文件：food_nutrient\.csv/)
  assert.equal(fs.existsSync(output), false)
})

test('CloudBase 导出器区分已知零值和未知营养值', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const outDir = path.join(tmp, 'cloudbase')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-07-21-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  const exportResult = runExporter(['--sqlite', output, '--out-dir', outDir])
  assert.equal(exportResult.status, 0, exportResult.stderr)

  const manifest = JSON.parse(fs.readFileSync(
    path.join(outDir, 'cloudbase-ingredient-import-manifest.json'),
    'utf8'
  ))
  const profiles = fs.readFileSync(path.join(outDir, 'food_nutrition_profiles.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const release = fs.readFileSync(path.join(outDir, 'data_releases.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))[0]

  assert.equal(profiles.length, 2)
  assert.equal(manifest.collections.food_nutrition_profiles.rows, 2)
  assert.equal(manifest.pending_collections.length, 4)
  assert.equal(release.status, 'staging')
  assert.equal(release.collections.human_recipes, 0)

  const tomato = profiles.find((profile) => profile.fdc_id === 10)
  assert.equal(tomato.food_id, 'food_10')
  assert.equal(tomato.nutrients['1004'].amount, 0)
  assert.equal(tomato.nutrients['1004'].value_status, 'known')
  assert.equal(tomato.nutrients['1008'].amount, null)
  assert.equal(tomato.nutrients['1008'].value_status, 'unknown')
})

test('CloudBase 导出器拒绝覆盖已经存在的导出文件', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const outDir = path.join(tmp, 'cloudbase')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'test-release'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)
  fs.mkdirSync(outDir)
  fs.writeFileSync(path.join(outDir, 'data_releases.jsonl'), 'keep')

  const exportResult = runExporter(['--sqlite', output, '--out-dir', outDir])
  assert.notEqual(exportResult.status, 0)
  assert.match(exportResult.stderr, /拒绝覆盖/)
  assert.equal(fs.readFileSync(path.join(outDir, 'data_releases.jsonl'), 'utf8'), 'keep')
})
