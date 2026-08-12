const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts/fooddata/build_ingredient_data_sqlite.py')
const exporter = path.join(root, 'scripts/fooddata/export_ingredient_cloudbase.py')
const catalogSeeder = path.join(root, 'scripts/fooddata/seed_ingredient_catalog.py')
const sourceSelector = path.join(root, 'scripts/fooddata/select_preferred_ingredient_sources.py')
const conceptDiscoverer = path.join(root, 'scripts/fooddata/discover_standard_ingredient_concepts.py')
const modelBatchPreparer = path.join(root, 'scripts/fooddata/prepare_recipe_ingredient_model_batches.py')
const stage1Runner = path.join(root, 'scripts/fooddata/run_recipe_ingredient_stage1.py')
const stage1Router = path.join(root, 'scripts/fooddata/route_recipe_ingredient_stage1_unresolved.py')
const sourceIdentityClusterer = path.join(root, 'scripts/fooddata/cluster_source_food_identities.py')
const stage2CatalogIntegrator = path.join(root, 'scripts/fooddata/integrate_stage2_source_decisions.py')
const stage3Preparer = path.join(root, 'scripts/fooddata/prepare_recipe_ingredient_stage3.py')
const modelResultIntegrator = path.join(root, 'scripts/fooddata/integrate_recipe_ingredient_model_results.py')
const coverageReporter = path.join(root, 'scripts/fooddata/report_recipe_ingredient_coverage.py')
const policySeeder = path.join(root, 'scripts/fooddata/seed_canine_ingredient_policies.py')
const rankingSeeder = path.join(root, 'scripts/fooddata/seed_nutrient_rankings.py')
const recipeMappingSeeder = path.join(root, 'scripts/fooddata/seed_recipe_ingredient_mappings.py')

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

function runCatalogSeeder(args) {
  return spawnSync('python3', [catalogSeeder, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runSourceSelector(args) {
  return spawnSync('python3', [sourceSelector, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runConceptDiscoverer(args) {
  return spawnSync('python3', [conceptDiscoverer, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runModelBatchPreparer(args) {
  return spawnSync('python3', [modelBatchPreparer, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runStage1(args) {
  return spawnSync('python3', [stage1Runner, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runStage1Router(args) {
  return spawnSync('python3', [stage1Router, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runSourceIdentityClusterer(args) {
  return spawnSync('python3', [sourceIdentityClusterer, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runStage2CatalogIntegrator(args) {
  return spawnSync('python3', [stage2CatalogIntegrator, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runStage3Preparer(args) {
  return spawnSync('python3', [stage3Preparer, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runModelResultIntegrator(args) {
  return spawnSync('python3', [modelResultIntegrator, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runCoverageReporter(args) {
  return spawnSync('python3', [coverageReporter, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runPolicySeeder(args) {
  return spawnSync('python3', [policySeeder, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runRankingSeeder(args) {
  return spawnSync('python3', [rankingSeeder, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

function runRecipeMappingSeeder(args) {
  return spawnSync('python3', [recipeMappingSeeder, ...args], {
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
        'rankings': conn.execute('SELECT COUNT(*) FROM nutrient_ranking').fetchone()[0],
        'recipe_mapping_releases': conn.execute('SELECT COUNT(*) FROM recipe_mapping_release').fetchone()[0],
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
  assert.equal(summary.schema_version, 4)
  assert.equal(summary.counts.source_food, 2)
  assert.equal(summary.counts.source_food_nutrient, 4)
  assert.equal(summary.counts.human_recipe, 2)
  assert.equal(summary.counts.human_recipe_ingredient_mention, 4)

  const database = queryDatabase(output)
  assert.ok(database.tables.includes('ingredient_concept'))
  assert.ok(database.tables.includes('ingredient_mapping_decision'))
  assert.ok(database.tables.includes('canine_ingredient_policy'))
  assert.ok(database.tables.includes('nutrient_ranking'))
  assert.ok(database.tables.includes('nutrient_ranking_item'))
  assert.ok(database.tables.includes('recipe_mapping_release'))
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
    policies: 0,
    rankings: 0,
    recipe_mapping_releases: 0
  })
  assert.deepEqual(database.foreign_key_errors, [])
})

test('构建器按 Foundation food_localized_name 结构导入 SR Legacy 中文名称', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const localizedNames = path.join(tmp, 'sr-localized.sqlite')
  const createLocalizedNames = runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.executescript('''
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
INSERT INTO food_localized_name VALUES (
  1, 20, 'zh-CN', '猪心，生', 'preferred', 0.65, '2026-08-11', '2026-08-11'
);
''')
conn.commit()
conn.close()
`, [localizedNames])
  assert.equal(createLocalizedNames.status, 0, createLocalizedNames.stderr)

  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--sr-localized-names-sqlite', localizedNames,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'localized-name-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)
  assert.equal(JSON.parse(buildResult.stdout).counts.source_localized_name, 2)

  const queryResult = runPython(`
import json
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
rows = conn.execute('''
SELECT r.source_version, l.source_record_id, l.fdc_id, l.locale, l.name,
       l.name_type, l.confidence, l.created_at, l.updated_at
FROM source_localized_name l
JOIN source_release r ON r.release_id = l.source_release_id
ORDER BY r.source_version, l.fdc_id
''').fetchall()
print(json.dumps(rows, ensure_ascii=False))
conn.close()
`, [output])
  assert.equal(queryResult.status, 0, queryResult.stderr)
  assert.deepEqual(JSON.parse(queryResult.stdout), [
    ['foundation', 1, 10, 'zh-CN', '番茄', 'preferred', 1, '2026-07-21', '2026-07-21'],
    ['sr_legacy_2018_04', 1, 20, 'zh-CN', '猪心，生', 'preferred', 0.65, '2026-08-11', '2026-08-11']
  ])
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
  assert.equal(manifest.collections.ingredient_catalog.rows, 0)
  assert.equal(fs.readFileSync(path.join(outDir, 'ingredient_catalog.jsonl'), 'utf8'), '')
  assert.equal(release.status, 'staging')
  assert.equal(release.collections.human_recipes, 0)

  const tomato = profiles.find((profile) => profile.fdc_id === 10)
  assert.equal(tomato.food_id, 'food_10')
  assert.equal(tomato.nutrients['1004'].amount, 0)
  assert.equal(tomato.nutrients['1004'].value_status, 'known')
  assert.equal(tomato.nutrients['1008'].amount, null)
  assert.equal(tomato.nutrients['1008'].value_status, 'unknown')
})

test('食材目录种子写入概念、别名和形态且新投影不含权限布尔字段', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const seedPath = path.join(tmp, 'catalog.json')
  const outDir = path.join(tmp, 'cloudbase')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-07-22-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  fs.writeFileSync(seedPath, JSON.stringify({
    catalog_version: 'test-catalog-v1',
    items: [
      {
        concept_id: 'ingredient_tomato',
        canonical_name_zh: '番茄',
        category_code: 'vegetable',
        subcategory_code: 'fruit_vegetable',
        aliases: ['西红柿'],
        variants: [{
          variant_id: 'variant_tomato_raw',
          display_name_zh: '番茄（生）',
          preparation_state: 'raw',
          source_version: 'foundation',
          fdc_id: 10,
          description_contains: 'Tomato, raw',
          is_default: true
        }]
      },
      {
        concept_id: 'ingredient_pork_heart',
        canonical_name_zh: '猪心',
        category_code: 'organ',
        subcategory_code: 'heart',
        aliases: [],
        variants: [{
          variant_id: 'variant_pork_heart_raw',
          display_name_zh: '猪心（生）',
          preparation_state: 'raw',
          source_version: 'sr_legacy_2018_04',
          fdc_id: 20,
          description_contains: 'Pork heart, raw',
          is_default: true
        }]
      }
    ]
  }))

  const seedResult = runCatalogSeeder(['--sqlite', output, '--seed', seedPath])
  assert.equal(seedResult.status, 0, seedResult.stderr)
  assert.deepEqual(JSON.parse(seedResult.stdout).counts, {
    ingredient_concept: 2,
    ingredient_alias: 3,
    ingredient_variant: 2
  })

  const exportResult = runExporter(['--sqlite', output, '--out-dir', outDir])
  assert.equal(exportResult.status, 0, exportResult.stderr)
  const manifest = JSON.parse(fs.readFileSync(
    path.join(outDir, 'cloudbase-ingredient-import-manifest.json'),
    'utf8'
  ))
  const catalog = fs.readFileSync(path.join(outDir, 'ingredient_catalog.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const release = JSON.parse(fs.readFileSync(
    path.join(outDir, 'data_releases.jsonl'),
    'utf8'
  ).trim())

  assert.equal(catalog.length, 2)
  assert.equal(manifest.collections.ingredient_catalog.rows, 2)
  assert.equal(manifest.pending_collections.includes('ingredient_catalog'), false)
  assert.equal(release.collections.ingredient_catalog, 2)
  assert.deepEqual(catalog.find((item) => item.concept_id === 'ingredient_tomato').aliases, ['西红柿'])
  assert.equal(catalog.every((item) => item.policy_status === 'unknown'), true)
  assert.equal(catalog.every((item) => !('is_selectable' in item)), true)
  assert.equal(catalog.every((item) => !('is_searchable' in item)), true)
})

test('从菜谱高频原料自动发现高置信标准概念并隔离未匹配项', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const baseSeed = path.join(tmp, 'base-catalog.json')
  const candidateSeed = path.join(tmp, 'candidate-catalog.json')
  const discoveryReport = path.join(tmp, 'discovery-report.json')
  const selectedSeed = path.join(tmp, 'selected-catalog.json')
  const selectionReport = path.join(tmp, 'selection-report.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-08-11-discovery-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)
  fs.writeFileSync(baseSeed, JSON.stringify({
    catalog_version: 'empty-base',
    catalog_schema_version: 2,
    items: []
  }))

  const discoveryResult = runConceptDiscoverer([
    '--sqlite', output,
    '--base-seed', baseSeed,
    '--candidate-version', 'candidate-v1',
    '--out-candidate-seed', candidateSeed,
    '--report', discoveryReport
  ])
  assert.equal(discoveryResult.status, 0, discoveryResult.stderr)

  const candidate = JSON.parse(fs.readFileSync(candidateSeed, 'utf8'))
  const report = JSON.parse(fs.readFileSync(discoveryReport, 'utf8'))
  assert.equal(candidate.discovery_policy.policy_id, 'recipeIngredientConceptDiscovery/v2')
  assert.equal(candidate.items.length, 1)
  assert.equal(candidate.items[0].canonical_name_zh, '番茄')
  assert.equal(candidate.items[0].category_code, 'vegetable')
  assert.equal(candidate.items[0].nutrition_candidates.length, 1)
  assert.equal(report.discovered_concept_count, 1)
  assert.equal(report.unmatched_term_count, 2)
  assert.equal(report.excluded_term_count, 1)
  assert.deepEqual(
    report.unmatched_terms.map((item) => item.normalized_name).sort(),
    ['牛肉', '鸡蛋']
  )

  const selectResult = runSourceSelector([
    '--sqlite', output,
    '--candidate-seed', candidateSeed,
    '--catalog-version', 'selected-v1',
    '--out-seed', selectedSeed,
    '--report', selectionReport
  ])
  assert.equal(selectResult.status, 0, selectResult.stderr)
  const selected = JSON.parse(fs.readFileSync(selectedSeed, 'utf8'))
  assert.equal(selected.items[0].variants.length, 1)
  assert.equal(selected.items[0].variants[0].fdc_id, 10)
})

test('低 token 清洗规则确定性处理排除项、修饰词、替代项和上位词', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from recipe_ingredient_normalization import clean_term

aliases = {
    '胡萝卜': 'ingredient_carrot',
    '低筋面粉': 'ingredient_low_gluten_flour',
    '牛奶': 'ingredient_milk',
    '水': 'ingredient_water',
}
values = [
    clean_term('盐少许', aliases, set()).to_dict(),
    clean_term('橄榄油', aliases, set()).to_dict(),
    clean_term('胡萝卜丝', aliases, set()).to_dict(),
    clean_term('低粉', aliases, set()).to_dict(),
    clean_term('牛奶（面团用）200ml', aliases, set()).to_dict(),
    clean_term('鸡胸肉（鸡腿肉）', aliases, set()).to_dict(),
    clean_term('鱼', aliases, set()).to_dict(),
    clean_term('牛奶或胡萝卜', aliases, set()).to_dict(),
    clean_term('清水', aliases, set()).to_dict(),
    clean_term('迷迭香', aliases, set()).to_dict(),
]
print(json.dumps(values, ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.deepEqual(values.map((item) => item.status), [
    'excluded',
    'excluded',
    'matched',
    'matched',
    'matched',
    'ambiguous',
    'ambiguous',
    'alternative',
    'auxiliary',
    'excluded'
  ])
  assert.equal(values[0].exclusion_category, 'seasoning')
  assert.equal(values[1].exclusion_category, 'oil')
  assert.equal(values[2].cleaned_name, '胡萝卜')
  assert.equal(values[3].cleaned_name, '低筋面粉')
  assert.equal(values[4].cleaned_name, '牛奶')
  assert.equal(values[4].quantity_text, '200ml')
  assert.deepEqual(values[7].components, ['ingredient_milk', 'ingredient_carrot'])
  assert.equal(values[9].exclusion_category, 'seasoning')
})

test('阶段一规则统一繁体别名、完整匹配油类并分流烹饪辅料', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from recipe_ingredient_normalization import clean_term

aliases = {
    '枣': 'ingredient_date',
    '胡萝卜': 'ingredient_carrot',
    '四季豆': 'ingredient_green_beans',
    '马苏里拉奶酪': 'ingredient_mozzarella',
    '竹笋': 'ingredient_bamboo_shoot',
    '番茄': 'ingredient_tomato',
    '玉米粉': 'ingredient_corn_flour',
    '牛油果': 'ingredient_avocado',
}
terms = [
    '麻椒', '醬油', '蔥花', '薑末', '白沙糖', '味增',
    '牛油', '粟米油', '初榨橄榄油', '融化黄油', '牛油果', '鳄梨', '淡奶油',
    '冷开水', '热水', '纯净水', '即发酵母粉', '即溶酵母', '老面',
    '红枣', '马苏里拉芝士', '红萝卜', '豆角', '冬笋', '春笋',
    '圣女果', '玉米面',
]
print(json.dumps([clean_term(term, aliases, set()).to_dict() for term in terms], ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.deepEqual(values.slice(0, 10).map((item) => item.status), Array(10).fill('excluded'))
  assert.deepEqual(values.slice(10, 12).map((item) => item.status), ['matched', 'matched'])
  assert.equal(values[12].status, 'model_candidate')
  assert.deepEqual(values.slice(13, 19).map((item) => item.status), Array(6).fill('auxiliary'))
  assert.deepEqual(values.slice(19).map((item) => item.status), Array(8).fill('matched'))
  assert.equal(values[6].cleaned_name, '牛油')
  assert.equal(values[7].cleaned_name, '玉米油')
  assert.equal(values[10].cleaned_name, '牛油果')
  assert.equal(values[11].cleaned_name, '牛油果')
})

test('阶段一清洁规则关闭辅料调味料缺口并保留状态换算合同', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from recipe_ingredient_normalization import clean_term

aliases = {
    '大米': 'ingredient_rice', '鸡蛋': 'ingredient_egg', '芝麻': 'ingredient_sesame',
    '白芝麻': 'ingredient_sesame', '黑芝麻': 'ingredient_sesame',
    '土豆': 'ingredient_potato', '南瓜': 'ingredient_pumpkin',
}
terms = ['酵母粉', '开水', '冰块', '郫县豆瓣', '味极鲜', '酸菜', '米饭', '蛋液', '熟芝麻', '土豆泥', '南瓜泥']
print(json.dumps([clean_term(term, aliases, set()).to_dict() for term in terms], ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.deepEqual(values.slice(0, 3).map((item) => item.status), ['auxiliary', 'auxiliary', 'auxiliary'])
  assert.deepEqual(values.slice(3, 6).map((item) => item.status), ['excluded', 'excluded', 'excluded'])
  assert.deepEqual(values.slice(6).map((item) => item.status), Array(5).fill('matched'))
  assert.equal(values[6].cleaned_name, '大米')
  assert.equal(values[6].mention_preparation_state, 'cooked')
  assert.equal(values[6].nutrition_status, 'conversion_required')
  assert.equal(values[7].nutrition_status, 'ready')
  assert.equal(values[8].cleaned_name, '芝麻')
  assert.equal(values[8].nutrition_status, 'conversion_required')
})

test('阶段一执行器生成决定、未决项和零模型调用基线报告', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-stage1-'))
  const sqlite = path.join(tmp, 'terms.sqlite')
  const decisions = path.join(tmp, 'stage-1-decisions.json')
  const unresolved = path.join(tmp, 'stage-1-unresolved.json')
  const report = path.join(tmp, 'stage-1-baseline-report.json')
  const setup = runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.executescript('''
CREATE TABLE ingredient_alias (normalized_alias TEXT, concept_id TEXT, review_status TEXT);
CREATE TABLE source_localized_name (name TEXT, locale TEXT);
CREATE TABLE recipe_ingredient_term (
  normalized_name TEXT, example_raw_name TEXT, occurrence_count INTEGER
);
INSERT INTO ingredient_alias VALUES ('牛油果', 'ingredient_avocado', 'approved');
INSERT INTO source_localized_name VALUES ('柠檬', 'zh-CN');
INSERT INTO recipe_ingredient_term VALUES
  ('粟米油', '粟米油', 10),
  ('鳄梨', '鳄梨', 8),
  ('冷开水', '冷开水', 6),
  ('柠檬', '柠檬', 5),
  ('未知原料', '未知原料', 1);
''')
conn.commit()
conn.close()
`, [sqlite])
  assert.equal(setup.status, 0, setup.stderr)
  const result = runStage1([
    '--sqlite', sqlite,
    '--decisions', decisions,
    '--unresolved', unresolved,
    '--report', report
  ])
  assert.equal(result.status, 0, result.stderr)
  const decisionDocument = JSON.parse(fs.readFileSync(decisions, 'utf8'))
  const unresolvedDocument = JSON.parse(fs.readFileSync(unresolved, 'utf8'))
  const reportDocument = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.deepEqual(decisionDocument.items.map((item) => item.decision), [
    'excluded', 'mapped_existing', 'auxiliary'
  ])
  assert.deepEqual(unresolvedDocument.items.map((item) => item.status), [
    'source_candidate', 'model_candidate'
  ])
  assert.equal(reportDocument.normalization_policy_id, 'recipeIngredientNormalization/v3')
  assert.equal(reportDocument.model_calls, 0)
  assert.equal(reportDocument.external_api_token_cost, 0)
  assert.equal(reportDocument.term_count, 5)
  assert.equal(reportDocument.decision_term_count, 3)
  assert.equal(reportDocument.unresolved_term_count, 2)
  assert.equal(Object.keys(reportDocument.artifact_sha256).length, 2)
})

test('阶段一未决分流器生成互斥队列并保持词项与提及次数守恒', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-stage1-routing-'))
  const unresolved = path.join(tmp, 'stage-1-unresolved.json')
  const outDir = path.join(tmp, 'routes')
  fs.writeFileSync(unresolved, JSON.stringify({
    contract: 'recipeIngredientStage1Unresolved/v1',
    normalization_policy_id: 'recipeIngredientNormalization/v3',
    items: [
      { normalized_name: '玉米淀粉', cleaned_name: '玉米淀粉', status: 'source_candidate', occurrence_count: 10 },
      { normalized_name: '瘦肉', cleaned_name: '瘦肉', status: 'ambiguous', occurrence_count: 9 },
      { normalized_name: '酵母粉', cleaned_name: '酵母粉', status: 'model_candidate', occurrence_count: 8 },
      { normalized_name: '郫县豆瓣', cleaned_name: '郫县豆瓣', status: 'model_candidate', occurrence_count: 7 },
      { normalized_name: '米饭', cleaned_name: '米饭', status: 'model_candidate', occurrence_count: 6 },
      { normalized_name: '火腿肠', cleaned_name: '火腿肠', status: 'model_candidate', occurrence_count: 5 },
      { normalized_name: '牛奶', cleaned_name: '牛奶', status: 'model_candidate', occurrence_count: 4 }
    ]
  }))
  const result = runStage1Router(['--unresolved', unresolved, '--out-dir', outDir])
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.input_term_count, 7)
  assert.equal(manifest.output_term_count, 7)
  assert.equal(manifest.input_occurrence_count, 49)
  assert.equal(manifest.output_occurrence_count, 49)
  assert.deepEqual(manifest.route_term_counts, {
    source_exact: 1,
    generic_ambiguous: 1,
    auxiliary_gap: 1,
    excluded_gap: 1,
    state_conversion: 1,
    processed_or_brand: 1,
    identity_candidate: 1
  })
  const stateRoute = JSON.parse(fs.readFileSync(path.join(outDir, 'state_conversion.json'), 'utf8'))
  assert.equal(stateRoute.items[0].base_name_zh, '大米')
  assert.equal(stateRoute.items[0].nutrition_status, 'conversion_required')
})

test('阶段二按英文基础身份聚类不同形态并为同一身份只选择一个来源', () => {
  const result = runPython(`
import json
import sqlite3
import sys

sys.path.insert(0, 'scripts/fooddata')
from cluster_source_food_identities import build_stage2, load_source_rows

conn = sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE source_release (release_id TEXT, source_version TEXT);
CREATE TABLE source_food (
  source_release_id TEXT, fdc_id INTEGER, food_category_id INTEGER, description TEXT
);
CREATE TABLE source_localized_name (
  source_release_id TEXT, fdc_id INTEGER, locale TEXT, name TEXT
);
CREATE TABLE source_food_nutrient (
  source_release_id TEXT, fdc_id INTEGER, source_record_id TEXT
);
INSERT INTO source_release VALUES ('r1', 'foundation'), ('r2', 'sr_legacy_2018_04');
INSERT INTO source_food VALUES
  ('r1', 1, 1, 'Milk, whole, fluid'),
  ('r2', 2, 1, 'Milk, dry, nonfat'),
  ('r2', 3, 1, 'Milk, goat, fluid'),
  ('r2', 4, 12, 'Seeds, sesame seeds, whole, dried'),
  ('r2', 5, 12, 'Seeds, sesame butter, tahini'),
  ('r2', 6, 11, 'Jew''s ear, raw'),
  ('r2', 7, 11, 'Fungi, Cloud ears, dried'),
  ('r2', 8, 11, 'Chayote, fruit, raw'),
  ('r2', 9, 1, 'Milk, reduced fat, fluid, 2% milkfat');
INSERT INTO source_localized_name VALUES
  ('r1', 1, 'zh-CN', '全脂牛奶'),
  ('r2', 2, 'zh-CN', '牛奶，干，无脂'),
  ('r2', 3, 'zh-CN', '山羊奶'),
  ('r2', 4, 'zh-CN', '种子，芝麻，整个，干'),
  ('r2', 5, 'zh-CN', '芝麻酱'),
  ('r2', 6, 'zh-CN', '犹太人的耳朵'),
  ('r2', 7, 'zh-CN', '真菌，云耳，干燥'),
  ('r2', 8, 'zh-CN', '油菜'),
  ('r2', 9, 'zh-CN', '减脂牛奶');
INSERT INTO source_food_nutrient VALUES
  ('r1', 1, 'n1'), ('r2', 2, 'n2'), ('r2', 3, 'n3'), ('r2', 4, 'n4'),
  ('r2', 5, 'n5'), ('r2', 6, 'n6'), ('r2', 7, 'n7'), ('r2', 8, 'n8'),
  ('r2', 9, 'n9a'), ('r2', 9, 'n9b');
''')
rows = load_source_rows(conn)
recipe_items = [
  {'cleaned_name': '牛奶', 'occurrence_count': 100},
  {'cleaned_name': '芝麻', 'occurrence_count': 80},
  {'cleaned_name': '木耳', 'occurrence_count': 60},
  {'cleaned_name': '油菜', 'occurrence_count': 40},
]
clusters, candidates, decisions, report = build_stage2(rows, recipe_items, {'items': []})
print(json.dumps({'clusters': clusters, 'candidates': candidates, 'decisions': decisions, 'report': report}, ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  assert.equal(value.report.source_food_count, 9)
  assert.equal(value.report.accepted_cluster_count, 3)
  assert.equal(value.report.selected_source_count, 3)
  assert.equal(value.report.duplicate_selected_source_count, 0)
  assert.deepEqual(value.candidates.items.map((item) => item.stage2_status), [
    'unique_source_identity', 'unique_source_identity', 'unique_source_identity',
    'bridge_only_unverified'
  ])
  const milk = value.decisions.items.find((item) => item.base_identity === 'milk')
  const sesame = value.decisions.items.find((item) => item.base_identity === 'sesame')
  const woodEar = value.decisions.items.find((item) => item.base_identity === 'wood_ear_mushroom')
  assert.equal(milk.source_candidate_count, 3)
  assert.equal(milk.selected_source.fdc_id, 1)
  assert.equal(sesame.source_candidate_count, 1)
  assert.equal(woodEar.source_candidate_count, 2)
})

test('阶段二决定合并器扩展既有别名并为新身份建立唯一来源概念', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-stage2-catalog-'))
  const base = path.join(tmp, 'base.json')
  const decisions = path.join(tmp, 'decisions.json')
  const output = path.join(tmp, 'output.json')
  const report = path.join(tmp, 'report.json')
  fs.writeFileSync(base, JSON.stringify({
    catalog_version: 'base-v1',
    catalog_schema_version: 2,
    items: [{
      concept_id: 'ingredient_corn', canonical_name_zh: '甜玉米', category_code: 'vegetable',
      subcategory_code: null, aliases: [], variants: [{
        variant_id: 'variant_corn', display_name_zh: '甜玉米（鲜）', preparation_state: 'fresh',
        source_version: 'foundation', fdc_id: 1, description_contains: 'Corn, fresh', is_default: true
      }]
    }]
  }))
  fs.writeFileSync(decisions, JSON.stringify({
    contract: 'recipeIngredientStage2Decisions/v1', policy_id: 'sourceFoodBaseIdentityClustering/v2',
    items: [
      {
        base_identity: 'corn', category_code: 'vegetable', decision: 'mapped_existing_source',
        existing_concept_id: 'ingredient_corn', recipe_terms: [{ cleaned_name: '玉米' }],
        selected_source: { source_version: 'foundation', fdc_id: 1, description: 'Corn, fresh', preparation_state: 'fresh' }
      },
      {
        base_identity: 'milk', category_code: 'dairy', decision: 'new_source_cluster',
        existing_concept_id: null, recipe_terms: [{ cleaned_name: '牛奶' }, { cleaned_name: '纯牛奶' }],
        selected_source: { source_version: 'sr_legacy_2018_04', fdc_id: 2, description: 'Milk, whole, fluid', preparation_state: 'fresh' }
      }
    ]
  }))
  const result = runStage2CatalogIntegrator([
    '--base-catalog', base, '--stage2-decisions', decisions,
    '--catalog-version', 'catalog-v2', '--out-catalog', output, '--report', report
  ])
  assert.equal(result.status, 0, result.stderr)
  const catalog = JSON.parse(fs.readFileSync(output, 'utf8'))
  const summary = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.equal(catalog.items.length, 2)
  assert.equal(summary.added_concept_count, 1)
  assert.equal(summary.extended_concept_count, 1)
  assert.equal(summary.selected_source_count, 2)
  assert.deepEqual(catalog.items.find((item) => item.concept_id === 'ingredient_corn').aliases, ['玉米'])
  const milk = catalog.items.find((item) => item.canonical_name_zh === '牛奶')
  assert.deepEqual(milk.aliases, ['纯牛奶'])
  assert.equal(milk.variants.length, 1)
  assert.equal(milk.variants[0].fdc_id, 2)
})

test('阶段三候选生成器先执行身份门禁并只把2至5候选交给模型', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from prepare_recipe_ingredient_stage3 import prepare_stage3

clusters = {'items': [
  {'cluster_id': 'cream', 'base_identity': 'cream', 'category_code': 'dairy', 'species': None, 'part': None, 'source_count': 1, 'sources': [{'description': 'Cream, heavy'}]},
  {'cluster_id': 'cress', 'base_identity': 'cress', 'category_code': 'vegetable', 'species': None, 'part': None, 'source_count': 1, 'sources': [{'description': 'Cress, raw'}]},
  {'cluster_id': 'wheat_bread', 'base_identity': 'wheat_flours', 'category_code': 'carb', 'species': None, 'part': None, 'source_count': 1, 'sources': [{'description': 'Wheat flours, bread'}]},
  {'cluster_id': 'wheat_whole', 'base_identity': 'wheat_flour', 'category_code': 'carb', 'species': None, 'part': None, 'source_count': 1, 'sources': [{'description': 'Wheat flour, whole-grain'}]},
]}
stage2 = {'items': [
  {'normalized_name': '奶油', 'cleaned_name': '奶油', 'occurrence_count': 10, 'stage2_status': 'multiple_source_identities', 'candidate_cluster_ids': ['cream', 'cress']},
  {'normalized_name': '小麦粉', 'cleaned_name': '小麦粉', 'occurrence_count': 8, 'stage2_status': 'multiple_source_identities', 'candidate_cluster_ids': ['wheat_bread', 'wheat_whole']},
  {'normalized_name': '汤', 'cleaned_name': '汤', 'occurrence_count': 5, 'stage2_status': 'multiple_source_identities', 'candidate_cluster_ids': ['cream', 'cress']},
]}
candidates, decisions, batches, report = prepare_stage3(stage2, clusters, 20)
print(json.dumps({'candidates': candidates, 'decisions': decisions, 'batches': batches, 'report': report}, ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  assert.equal(value.report.deterministic_group_count, 1)
  assert.equal(value.report.model_group_count, 1)
  assert.equal(value.report.isolated_group_count, 1)
  assert.equal(value.decisions.items[0].candidate_id, 'cream')
  assert.deepEqual(value.batches[0].items[0].candidates.map((item) => item.candidate_id), [
    'wheat_bread', 'wheat_whole'
  ])
})

test('阶段三模型双次结果只有候选顺序扰动后完全一致才自动通过', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from run_recipe_ingredient_stage3_lmstudio import consensus_results

items = [
  {'cleaned_name': '甲', 'occurrence_count': 3, 'candidates': [{'candidate_id': 'a'}, {'candidate_id': 'b'}]},
  {'cleaned_name': '乙', 'occurrence_count': 2, 'candidates': [{'candidate_id': 'c'}, {'candidate_id': 'd'}]},
  {'cleaned_name': '丙', 'occurrence_count': 1, 'candidates': [{'candidate_id': 'e'}, {'candidate_id': 'f'}]},
]
values = consensus_results(
  items,
  {'甲': 'a', '乙': 'c', '丙': 'ambiguous'},
  {'甲': 'a', '乙': 'd', '丙': 'ambiguous'},
)
print(json.dumps(values, ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.deepEqual(values.map((item) => item.status), [
    'selected_cluster', 'disagreement', 'isolated'
  ])
  assert.equal(values[0].decision, 'a')
  assert.equal(values[1].decision, null)
  assert.equal(values[2].isolation_reason, 'ambiguous')
})

test('阶段三目录合并器只接受候选内决定并保持一概念一来源', () => {
  const result = runPython(`
import json
import sqlite3
import sys

sys.path.insert(0, 'scripts/fooddata')
from integrate_recipe_ingredient_stage3 import integrate_stage3

conn = sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE source_release (release_id TEXT, source_version TEXT);
CREATE TABLE source_food (source_release_id TEXT, fdc_id INTEGER, description TEXT);
CREATE TABLE source_food_nutrient (source_release_id TEXT, fdc_id INTEGER, source_record_id TEXT);
INSERT INTO source_release VALUES ('r1', 'foundation');
INSERT INTO source_food VALUES ('r1', 2, 'Cream, heavy');
INSERT INTO source_food_nutrient VALUES ('r1', 2, 'n1');
''')
base = {'catalog_version': 'v1', 'catalog_schema_version': 2, 'items': [{
  'concept_id': 'existing', 'canonical_name_zh': '苹果', 'category_code': 'fruit',
  'aliases': [], 'variants': [{'variant_id': 'apple', 'display_name_zh': '苹果（生）',
  'preparation_state': 'raw', 'source_version': 'foundation', 'fdc_id': 1,
  'description_contains': 'Apples', 'is_default': True}]
}]}
candidates = {'items': [{'cleaned_name': '奶油', 'candidates': [{'candidate_id': 'cream'}]}]}
deterministic = {'items': [{'cleaned_name': '奶油', 'occurrence_count': 10,
  'decision': 'selected_cluster', 'candidate_id': 'cream',
  'decision_method': 'deterministic_unique_after_identity_gate'}]}
consensus = {'items': []}
clusters = {'items': [{'cluster_id': 'cream', 'base_identity': 'cream',
  'category_code': 'dairy', 'sources': [{'source_version': 'foundation', 'fdc_id': 2,
  'description': 'Cream, heavy', 'preparation_state': 'unspecified'}]}]}
catalog, report = integrate_stage3(conn, base, candidates, deterministic, consensus, clusters, 'v2')
print(json.dumps({'catalog': catalog, 'report': report}, ensure_ascii=False))
`)
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  assert.equal(value.catalog.items.length, 2)
  assert.equal(value.report.added_concept_count, 1)
  assert.equal(value.report.selected_occurrence_count, 10)
  assert.equal(value.catalog.items.find((item) => item.canonical_name_zh === '奶油').variants.length, 1)
})

test('阶段四身份词典完整覆盖频次波次并只写入受控别名和英文来源', () => {
  const result = runPython(`
import json
import sqlite3
import sys

sys.path.insert(0, 'scripts/fooddata')
from integrate_recipe_ingredient_stage4 import integrate_stage4

conn = sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE source_release (release_id TEXT PRIMARY KEY, source_version TEXT NOT NULL);
CREATE TABLE source_food (
  source_release_id TEXT NOT NULL,
  fdc_id INTEGER NOT NULL,
  food_category_id INTEGER,
  description TEXT NOT NULL
);
CREATE TABLE source_food_nutrient (source_release_id TEXT NOT NULL, fdc_id INTEGER NOT NULL);
INSERT INTO source_release VALUES ('foundation-v1', 'foundation');
INSERT INTO source_release VALUES ('legacy-v1', 'sr_legacy_2018_04');
INSERT INTO source_food VALUES ('foundation-v1', 10, 11, 'Tomato, raw');
INSERT INTO source_food VALUES ('legacy-v1', 20, 10, 'Pork heart, raw');
INSERT INTO source_food_nutrient VALUES ('foundation-v1', 10);
INSERT INTO source_food_nutrient VALUES ('legacy-v1', 20);
''')
base = {
    'catalog_version': 'v1',
    'catalog_schema_version': 2,
    'items': [{
        'concept_id': 'ingredient_tomato',
        'canonical_name_zh': '番茄',
        'category_code': 'vegetable',
        'subcategory_code': None,
        'aliases': [],
        'variants': [{
            'variant_id': 'variant_tomato',
            'display_name_zh': '番茄（生）',
            'preparation_state': 'raw',
            'source_version': 'foundation',
            'fdc_id': 10,
            'description_contains': 'Tomato, raw',
            'is_default': True,
        }],
    }],
}
route = {
    'contract': 'recipeIngredientStage1Route/v1',
    'route': 'identity_candidate',
    'items': [
        {'normalized_name': '小番茄', 'occurrence_count': 10},
        {'normalized_name': '猪心', 'occurrence_count': 8},
    ],
}
lexicon = {
    'contract': 'recipeIngredientIdentityLexicon/v1',
    'lexicon_version': 'test-v1',
    'existing_aliases': [{'concept_id': 'ingredient_tomato', 'terms': ['小番茄']}],
    'new_concepts': [{
        'canonical_name_zh': '猪心',
        'terms': ['猪心'],
        'category_code': 'organ',
        'source_category_ids': [10],
        'source_description_pattern': '^Pork heart, raw$',
    }],
    'isolated': [],
}
catalog, report = integrate_stage4(conn, base, route, lexicon, 'v2', 5)
incomplete = dict(lexicon)
incomplete['new_concepts'] = []
try:
    integrate_stage4(conn, base, route, incomplete, 'v2', 5)
    incomplete_rejected = False
except ValueError:
    incomplete_rejected = True
print(json.dumps({
    'concept_count': len(catalog['items']),
    'tomato_aliases': next(
        item['aliases'] for item in catalog['items'] if item['concept_id'] == 'ingredient_tomato'
    ),
    'selected_fdc_id': next(
        item['variants'][0]['fdc_id']
        for item in catalog['items'] if item['canonical_name_zh'] == '猪心'
    ),
    'accepted_occurrences': report['accepted_occurrence_count'],
    'incomplete_rejected': incomplete_rejected,
}, ensure_ascii=False))
conn.close()
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.equal(values.concept_count, 2)
  assert.deepEqual(values.tomato_aliases, ['小番茄'])
  assert.equal(values.selected_fdc_id, 20)
  assert.equal(values.accepted_occurrences, 18)
  assert.equal(values.incomplete_rejected, true)
})

test('模型批次按清洗后身份聚合且不包含排除项和烹饪辅料', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-model-batches-'))
  const sqlite = path.join(tmp, 'terms.sqlite')
  const reportPath = path.join(tmp, 'report.json')
  const batchesPath = path.join(tmp, 'batches.jsonl')
  const setup = runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
conn.executescript('''
CREATE TABLE ingredient_alias (
  normalized_alias TEXT,
  concept_id TEXT,
  review_status TEXT
);
CREATE TABLE source_localized_name (name TEXT, locale TEXT);
CREATE TABLE recipe_ingredient_term (
  normalized_name TEXT,
  example_raw_name TEXT,
  occurrence_count INTEGER
);
INSERT INTO ingredient_alias VALUES ('胡萝卜', 'ingredient_carrot', 'approved');
INSERT INTO source_localized_name VALUES ('番茄', 'zh-CN');
INSERT INTO recipe_ingredient_term VALUES
  ('盐', '盐', 100),
  ('胡萝卜丝', '胡萝卜丝', 10),
  ('低筋面粉', '低筋面粉', 5),
  ('低粉', '低粉', 4),
  ('清水', '清水', 8),
  ('鱼', '鱼', 7),
  ('番茄', '番茄', 6);
''')
conn.commit()
conn.close()
`, [sqlite])
  assert.equal(setup.status, 0, setup.stderr)

  const result = runModelBatchPreparer([
    '--sqlite', sqlite,
    '--min-model-occurrences', '5',
    '--max-model-terms', '100',
    '--batch-size', '50',
    '--report', reportPath,
    '--model-batches', batchesPath
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const batches = fs.readFileSync(batchesPath, 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(report.status_term_counts, {
    ambiguous: 1,
    auxiliary: 1,
    excluded: 1,
    matched: 1,
    model_candidate: 2,
    source_candidate: 1
  })
  assert.equal(report.model_queue.candidate_terms_before_grouping, 2)
  assert.equal(report.model_queue.identity_groups, 1)
  assert.equal(report.model_queue.occurrences, 9)
  assert.equal(report.model_queue.estimated_tokens, 460)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].terms[0].cleaned_name, '低筋面粉')
  assert.equal(batches[0].terms[0].source_term_count, 2)
})

test('模型结果只有通过字面门禁并命中营养来源才进入概念候选', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const baseSeed = path.join(tmp, 'base.json')
  const batches = path.join(tmp, 'batches.jsonl')
  const resultsDir = path.join(tmp, 'results')
  const candidateSeed = path.join(tmp, 'candidate.json')
  const reportPath = path.join(tmp, 'integration-report.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'model-integration-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)
  fs.writeFileSync(baseSeed, JSON.stringify({
    catalog_version: 'base-v1',
    catalog_schema_version: 2,
    items: []
  }))
  fs.writeFileSync(batches, JSON.stringify({
    batch_id: 'batch_0001',
    terms: [
      { cleaned_name: '番茄块', occurrence_count: 10, source_terms: [] },
      { cleaned_name: '牛腩', occurrence_count: 9, source_terms: [] },
      { cleaned_name: '神秘食材', occurrence_count: 8, source_terms: [] }
    ]
  }) + '\n')
  fs.mkdirSync(resultsDir)
  fs.writeFileSync(path.join(resultsDir, 'manifest.json'), '{}')
  fs.writeFileSync(path.join(resultsDir, 'batch_0001.json'), JSON.stringify({
    results: [
      { cleaned_name: '番茄块', base_name_zh: '番茄', status: 'resolved', resolution_reason: '模型归一' },
      { cleaned_name: '牛腩', base_name_zh: '牛腭', status: 'resolved', resolution_reason: '模型归一' },
      { cleaned_name: '神秘食材', base_name_zh: '神秘食材', status: 'resolved', resolution_reason: '模型归一' }
    ]
  }))

  const result = runModelResultIntegrator([
    '--sqlite', output,
    '--base-seed', baseSeed,
    '--model-batches', batches,
    '--model-results-dir', resultsDir,
    '--candidate-version', 'candidate-v1',
    '--out-candidate-seed', candidateSeed,
    '--report', reportPath
  ])
  assert.equal(result.status, 0, result.stderr)
  const candidate = JSON.parse(fs.readFileSync(candidateSeed, 'utf8'))
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(candidate.items.length, 1)
  assert.equal(candidate.items[0].canonical_name_zh, '番茄')
  assert.deepEqual(candidate.items[0].aliases, ['番茄块'])
  assert.equal(candidate.items[0].nutrition_candidates[0].fdc_id, 10)
  assert.equal(report.discovered_concept_count, 1)
  assert.equal(report.rejected_group_count, 2)
  assert.deepEqual(report.rejected.map((item) => item.reason).sort(), [
    'lexical_identity_gate_failed',
    'no_unique_supported_source'
  ])
})

test('模型合并门禁隔离裸动物并按动物和部位过滤来源候选', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from integrate_recipe_ingredient_model_results import canonical_model_base, identity_is_consistent, source_matches
from select_preferred_ingredient_sources import candidate_score

rows = [
    {'normalized_localized_name': '生带皮鸡翅肉', 'description': 'Chicken, wing, meat and skin, raw', 'food_category_id': 5},
    {'normalized_localized_name': '火鸡整个鸡翅只有肉生的', 'description': 'Turkey, wing, meat only, raw', 'food_category_id': 5},
    {'normalized_localized_name': '猪肉里脊肉排骨', 'description': 'Pork, loin, chops, boneless, raw', 'food_category_id': 10},
    {'normalized_localized_name': '猪肉新鲜排骨', 'description': 'Pork, fresh, backribs, raw', 'food_category_id': 10},
]
print(json.dumps({
    'bare_animal': identity_is_consistent('鸡爪', '鸡'),
    'added_specificity': identity_is_consistent('豆芽', '绿豆芽'),
    'milk_powder': canonical_model_base('全脂奶粉'),
    'chicken': [row['description'] for row in source_matches('鸡翅', rows)],
    'ribs': [row['description'] for row in source_matches('排骨', rows)],
    'unsweetened_first': candidate_score({
        'source_description': 'SILK Unsweetened, soymilk',
        'preparation_state': 'unspecified',
        'source_version': 'sr_legacy_2018_04',
        'nutrient_count': 20,
        'fdc_id': 1,
    }) < candidate_score({
        'source_description': 'Soymilk (all flavors), nonfat',
        'preparation_state': 'unspecified',
        'source_version': 'sr_legacy_2018_04',
        'nutrient_count': 30,
        'fdc_id': 2,
    }),
}))
`)
  assert.equal(result.status, 0, result.stderr)
  const values = JSON.parse(result.stdout)
  assert.equal(values.bare_animal, false)
  assert.equal(values.added_specificity, false)
  assert.equal(values.milk_powder, '奶粉')
  assert.deepEqual(values.chicken, ['Chicken, wing, meat and skin, raw'])
  assert.deepEqual(values.ribs, ['Pork, fresh, backribs, raw'])
  assert.equal(values.unsweetened_first, true)
})

test('覆盖率分母只排除调味料和油且只把标准概念映射计为覆盖', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const seed = path.join(tmp, 'catalog.json')
  const reportPath = path.join(tmp, 'coverage.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'coverage-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)
  fs.writeFileSync(seed, JSON.stringify({
    catalog_version: 'coverage-catalog-v1',
    catalog_schema_version: 2,
    items: [{
      concept_id: 'ingredient_tomato',
      canonical_name_zh: '番茄',
      category_code: 'vegetable',
      subcategory_code: null,
      aliases: [],
      variants: [{
        variant_id: 'variant_tomato_raw',
        display_name_zh: '番茄（生）',
        preparation_state: 'raw',
        source_version: 'foundation',
        fdc_id: 10,
        description_contains: 'Tomato, raw',
        is_default: true
      }]
    }]
  }))
  const seedResult = runCatalogSeeder(['--sqlite', output, '--seed', seed])
  assert.equal(seedResult.status, 0, seedResult.stderr)
  const result = runCoverageReporter(['--sqlite', output, '--report', reportPath])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.total_occurrence_count, 4)
  assert.deepEqual(report.excluded_occurrence_counts, { seasoning: 1 })
  assert.equal(report.denominator_occurrence_count, 3)
  assert.equal(report.covered_occurrence_count, 1)
  assert.equal(report.occurrence_coverage, 1 / 3)
})

test('标准食材自动选择唯一的生鲜去骨去皮烹调基准来源', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const candidateSeed = path.join(tmp, 'catalog-candidates.json')
  const selectedSeed = path.join(tmp, 'catalog-selected.json')
  const reportPath = path.join(tmp, 'selection-report.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-08-11-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  const insertCandidates = runPython(`
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
release_id = conn.execute(
    "SELECT release_id FROM source_release WHERE source_version = 'foundation'"
).fetchone()[0]
conn.executemany(
    "INSERT INTO source_food (source_release_id, fdc_id, data_type, description) VALUES (?, ?, 'foundation_food', ?)",
    [
        (release_id, 30, 'Chicken, breast, meat only, cooked, roasted'),
        (release_id, 31, 'Chicken, breast, boneless, skinless, raw'),
        (release_id, 32, 'Chicken, breast, with bone and skin, raw'),
    ],
)
conn.executemany(
    "INSERT INTO source_food_nutrient (source_release_id, source_record_id, fdc_id, nutrient_id, amount) VALUES (?, ?, ?, 1003, ?)",
    [
        (release_id, 300, 30, 31.0),
        (release_id, 301, 31, 23.0),
        (release_id, 302, 32, 20.0),
    ],
)
conn.commit()
conn.close()
`, [output])
  assert.equal(insertCandidates.status, 0, insertCandidates.stderr)

  fs.writeFileSync(candidateSeed, JSON.stringify({
    catalog_version: 'candidate-v1',
    items: [{
      concept_id: 'ingredient_chicken_breast',
      canonical_name_zh: '鸡胸肉',
      category_code: 'meat',
      subcategory_code: 'poultry',
      aliases: ['鸡胸'],
      variants: [
        {
          variant_id: 'variant_chicken_breast_cooked',
          display_name_zh: '鸡胸肉（熟）',
          preparation_state: 'cooked',
          source_version: 'foundation',
          fdc_id: 30,
          description_contains: 'cooked, roasted',
          is_default: true
        },
        {
          variant_id: 'variant_chicken_breast_raw_skinless',
          display_name_zh: '鸡胸肉（生，去皮去骨）',
          preparation_state: 'raw',
          source_version: 'foundation',
          fdc_id: 31,
          description_contains: 'boneless, skinless, raw',
          is_default: false
        },
        {
          variant_id: 'variant_chicken_breast_raw_bone_skin',
          display_name_zh: '鸡胸肉（生，带皮带骨）',
          preparation_state: 'raw',
          source_version: 'foundation',
          fdc_id: 32,
          description_contains: 'with bone and skin, raw',
          is_default: false
        }
      ]
    }]
  }))

  const selectResult = runSourceSelector([
    '--sqlite', output,
    '--candidate-seed', candidateSeed,
    '--catalog-version', 'test-catalog-v2',
    '--out-seed', selectedSeed,
    '--report', reportPath
  ])
  assert.equal(selectResult.status, 0, selectResult.stderr)

  const selected = JSON.parse(fs.readFileSync(selectedSeed, 'utf8'))
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(selected.catalog_schema_version, 2)
  assert.equal(selected.selection_policy.policy_id, 'readyToCookNutritionSource/v1')
  assert.equal(selected.items[0].variants.length, 1)
  assert.equal(selected.items[0].variants[0].fdc_id, 31)
  assert.equal(selected.items[0].variants[0].is_default, true)
  assert.equal(report.concept_count, 1)
  assert.equal(report.selected_source_count, 1)
  assert.equal(report.items[0].candidate_count, 3)
  assert.equal(report.items[0].selected_fdc_id, 31)
  assert.equal(report.items[0].rejected_candidates.length, 2)

  const seedResult = runCatalogSeeder(['--sqlite', output, '--seed', selectedSeed])
  assert.equal(seedResult.status, 0, seedResult.stderr)
  assert.deepEqual(JSON.parse(seedResult.stdout).counts, {
    ingredient_concept: 1,
    ingredient_alias: 2,
    ingredient_variant: 1
  })

  const databaseResult = runPython(`
import json
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
row = conn.execute(
    "SELECT concept_id, source_food_id, is_default FROM ingredient_variant"
).fetchone()
print(json.dumps(row))
conn.close()
`, [output])
  assert.equal(databaseResult.status, 0, databaseResult.stderr)
  assert.deepEqual(JSON.parse(databaseResult.stdout), [
    'ingredient_chicken_breast',
    31,
    1
  ])
})

test('烹调基准来源不会因生鲜描述省略 unsweetened 而错误优先冷冻水果', () => {
  const result = runPython(`
import json
import sys

sys.path.insert(0, 'scripts/fooddata')
from select_preferred_ingredient_sources import candidate_score

raw = {
  'source_description': 'Raspberries, raw', 'description': 'Raspberries, raw',
  'preparation_state': 'raw', 'source_version': 'sr_legacy_2018_04',
  'nutrient_count': 10, 'is_default': False, 'fdc_id': 1, 'variant_id': 'raw'
}
frozen = {
  'source_description': 'Raspberries, frozen, unsweetened',
  'description': 'Raspberries, frozen, unsweetened',
  'preparation_state': 'frozen', 'source_version': 'sr_legacy_2018_04',
  'nutrient_count': 20, 'is_default': False, 'fdc_id': 2, 'variant_id': 'frozen'
}
print(json.dumps({'raw': candidate_score(raw), 'frozen': candidate_score(frozen)}))
`)
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  assert.equal(value.raw[1], value.frozen[1])
  assert.ok(value.raw[2] < value.frozen[2])
})

test('标准食材目录 v2 拒绝一个概念写入多个营养来源', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const seedPath = path.join(tmp, 'invalid-multi-source-catalog.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-08-11-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  fs.writeFileSync(seedPath, JSON.stringify({
    catalog_version: 'test-catalog-v2',
    catalog_schema_version: 2,
    items: [{
      concept_id: 'ingredient_test',
      canonical_name_zh: '测试食材',
      category_code: 'vegetable',
      aliases: [],
      variants: [
        {
          variant_id: 'variant_test_a',
          display_name_zh: '测试食材 A',
          preparation_state: 'raw',
          source_version: 'foundation',
          fdc_id: 10,
          description_contains: 'Tomato, raw',
          is_default: true
        },
        {
          variant_id: 'variant_test_b',
          display_name_zh: '测试食材 B',
          preparation_state: 'raw',
          source_version: 'sr_legacy_2018_04',
          fdc_id: 20,
          description_contains: 'Pork heart, raw',
          is_default: false
        }
      ]
    }]
  }))

  const result = runCatalogSeeder(['--sqlite', output, '--seed', seedPath])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /必须只有一个烹调基准营养来源/)
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

test('犬食安全策略完整覆盖目录并按 non-blocked 规则生成运行时投影', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const catalogSeed = path.join(tmp, 'catalog.json')
  const policySeed = path.join(tmp, 'policies.json')
  const rankingRules = path.join(tmp, 'rankings.json')
  const sourceDeclaration = path.join(tmp, 'recipe-source.json')
  const recipeMapping = path.join(tmp, 'recipe-mapping.json')
  const outDir = path.join(tmp, 'cloudbase')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', '2026-07-22-test'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  fs.writeFileSync(catalogSeed, JSON.stringify({
    catalog_version: 'test-catalog-v1',
    items: [
      {
        concept_id: 'ingredient_tomato',
        canonical_name_zh: '番茄',
        category_code: 'vegetable',
        subcategory_code: 'fruit_vegetable',
        aliases: [],
        variants: [{
          variant_id: 'variant_tomato_raw',
          display_name_zh: '番茄（生）',
          preparation_state: 'raw',
          source_version: 'foundation',
          fdc_id: 10,
          description_contains: 'Tomato, raw',
          is_default: true
        }]
      },
      {
        concept_id: 'ingredient_pork_heart',
        canonical_name_zh: '猪心',
        category_code: 'organ',
        subcategory_code: 'heart',
        aliases: [],
        variants: [{
          variant_id: 'variant_pork_heart_raw',
          display_name_zh: '猪心（生）',
          preparation_state: 'raw',
          source_version: 'sr_legacy_2018_04',
          fdc_id: 20,
          description_contains: 'Pork heart, raw',
          is_default: true
        }]
      }
    ]
  }))
  assert.equal(runCatalogSeeder(['--sqlite', output, '--seed', catalogSeed]).status, 0)

  fs.writeFileSync(policySeed, JSON.stringify({
    policy_version: 'test-policy-v1',
    compatible_catalog_version: 'test-catalog-v1',
    evidence_reviewed_at: '2026-07-22',
    review: {
      reviewed_by: 'test-reviewer',
      reviewed_at: '2026-07-22',
      next_review_at: '2026-10-22'
    },
    evidence_library: {
      test_source: {
        title: 'Test evidence',
        publisher: 'Test veterinary source',
        url: 'https://example.test/evidence',
        accessed_at: '2026-07-22',
        species: 'dog'
      }
    },
    concept_policies: [{
      concept_id: 'ingredient_tomato',
      decision: 'allowed',
      evidence_ids: ['test_source'],
      rationale: '测试允许策略。'
    }],
    variant_policies: []
  }))
  const policyResult = runPolicySeeder(['--sqlite', output, '--seed', policySeed])
  assert.equal(policyResult.status, 0, policyResult.stderr)
  assert.deepEqual(JSON.parse(policyResult.stdout).decisions, {
    allowed: 1,
    blocked: 0,
    conditional: 0,
    unknown: 1
  })

  fs.writeFileSync(rankingRules, JSON.stringify({
    ranking_version: 'test-ranking-v1',
    compatible_catalog_version: 'test-catalog-v1',
    compatible_policy_version: 'test-policy-v1',
    generated_at: '2026-07-22T00:00:00Z',
    max_items: 20,
    nutrients: [
      {
        nutrient_code: 'protein',
        nutrient_name_zh: '蛋白质',
        unit_name: 'G',
        formulas: [[{ nutrient_id: 1003 }]]
      },
      {
        nutrient_code: 'vitamin_d',
        nutrient_name_zh: '维生素 D',
        unit_name: 'UG',
        formulas: [[{ nutrient_id: 1114 }], [{ nutrient_id: 1110, factor: 0.025 }]]
      }
    ]
  }))
  const rankingResult = runRankingSeeder(['--sqlite', output, '--rules', rankingRules])
  assert.equal(rankingResult.status, 0, rankingResult.stderr)
  assert.deepEqual(JSON.parse(rankingResult.stdout), {
    ranking_version: 'test-ranking-v1',
    compatible_catalog_version: 'test-catalog-v1',
    compatible_policy_version: 'test-policy-v1',
    non_blocked_variants: 2,
    nutrient_rankings: 2,
    ranking_items: 2,
    empty_rankings: 1
  })

  const recipeSha256 = crypto.createHash('sha256').update(fs.readFileSync(recipes)).digest('hex')
  fs.writeFileSync(sourceDeclaration, JSON.stringify({
    source_id: 'test-recipes',
    source_version: 'capu_5w_source',
    source_sha256: recipeSha256,
    license_status: 'verified',
    authorization_basis: '测试授权。',
    authorization_confirmed_by: 'test-owner',
    authorization_confirmed_at: '2026-07-23'
  }))
  fs.writeFileSync(recipeMapping, JSON.stringify({
    mapping_version: 'test-recipe-mapping-v1',
    compatible_catalog_version: 'test-catalog-v1',
    compatible_policy_version: 'test-policy-v1',
    source_declaration: sourceDeclaration,
    generated_at: '2026-07-23T00:00:00Z',
    automatic_rules: ['approved_alias_exact'],
    review_task_min_occurrences: 1,
    manual_decisions: []
  }))
  const mappingResult = runRecipeMappingSeeder([
    '--sqlite', output,
    '--mapping', recipeMapping
  ])
  assert.equal(mappingResult.status, 0, mappingResult.stderr)
  assert.deepEqual(JSON.parse(mappingResult.stdout), {
    mapping_version: 'test-recipe-mapping-v1',
    compatible_catalog_version: 'test-catalog-v1',
    compatible_policy_version: 'test-policy-v1',
    source_release_id: JSON.parse(buildResult.stdout).source_releases.human_recipes,
    source_license_status: 'verified',
    terms: 4,
    occurrences: 4,
    matched_occurrences: 1,
    occurrence_coverage: 0.25,
    decisions: {
      alternative: 0,
      ambiguous: 0,
      composite: 0,
      matched: 1,
      unmatched: 3
    },
    components: 1,
    review_tasks: 3
  })

  const exportResult = runExporter(['--sqlite', output, '--out-dir', outDir])
  assert.equal(exportResult.status, 0, exportResult.stderr)
  const manifest = JSON.parse(fs.readFileSync(
    path.join(outDir, 'cloudbase-ingredient-import-manifest.json'),
    'utf8'
  ))
  const policies = fs.readFileSync(
    path.join(outDir, 'canine_ingredient_policies.jsonl'),
    'utf8'
  ).trim().split('\n').map((line) => JSON.parse(line))
  const catalog = fs.readFileSync(path.join(outDir, 'ingredient_catalog.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line))
  const rankings = fs.readFileSync(path.join(outDir, 'nutrient_rankings.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line))
  const humanRecipes = fs.readFileSync(path.join(outDir, 'human_recipes.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line))
  const release = JSON.parse(fs.readFileSync(
    path.join(outDir, 'data_releases.jsonl'),
    'utf8'
  ).trim())
  const projectionReportPath = path.join(outDir, 'human-recipe-projection-report.json')
  const projectionReport = JSON.parse(fs.readFileSync(projectionReportPath, 'utf8'))

  assert.equal(manifest.collections.canine_ingredient_policies.rows, 2)
  assert.equal(manifest.pending_collections.includes('canine_ingredient_policies'), false)
  assert.equal(policies.length, 2)
  assert.equal('is_selectable' in catalog.find((item) => item.concept_id === 'ingredient_tomato'), false)
  assert.equal(catalog.find((item) => item.concept_id === 'ingredient_pork_heart').policy_status, 'unknown')
  assert.equal(manifest.collections.nutrient_rankings.rows, 2)
  assert.equal(manifest.pending_collections.includes('nutrient_rankings'), false)
  assert.equal(release.ranking_version, 'test-ranking-v1')
  assert.equal(release.collections.nutrient_rankings, 2)
  assert.equal(rankings.find((item) => item.nutrient_code === 'vitamin_d').ranked_count, 0)
  const protein = rankings.find((item) => item.nutrient_code === 'protein')
  assert.equal(protein.items.length, 2)
  assert.deepEqual(protein.items.map((item) => item.variant_id), [
    'variant_pork_heart_raw',
    'variant_tomato_raw'
  ])
  assert.equal(protein.items[1].amount_per_100g, 0.88)
  assert.equal(manifest.collections.human_recipes.rows, 1)
  assert.equal(manifest.pending_collections.includes('human_recipes'), false)
  assert.equal(
    release.recipe_version,
    'human-recipe-runtime-v2-test-recipe-mapping-v1'
  )
  assert.equal(release.mapping_version, 'test-recipe-mapping-v1')
  assert.equal(
    release.release_id,
    'human-recipe-release-v2-2026-07-22-test-test-recipe-mapping-v1'
  )
  assert.equal(
    release.rollback_candidate.recipe_version,
    'test-recipe-mapping-v1'
  )
  assert.equal(release.recipe_source_count, 2)
  assert.equal(release.collections.human_recipes, 1)
  const tomatoRecipe = humanRecipes.find((item) => item.source_recipe_id === '1')
  assert.equal(tomatoRecipe.recipe_version, release.recipe_version)
  assert.equal(tomatoRecipe.mapping_version, 'test-recipe-mapping-v1')
  assert.equal(tomatoRecipe.release_id, release.release_id)
  assert.equal(tomatoRecipe.non_blocked_component_count, 1)
  assert.equal(tomatoRecipe.amounts_are_reference_only, true)
  assert.equal(tomatoRecipe.ingredients[0].components[0].concept_id, 'ingredient_tomato')
  assert.equal('is_selectable' in tomatoRecipe.ingredients[0].components[0], false)
  assert.equal(tomatoRecipe.ingredients[1].mapping_status, 'unmatched')
  assert.equal(projectionReport.$schema, 'humanRecipeProjectionStagingReport/v1')
  assert.equal(projectionReport.counts.recipes, humanRecipes.length)
  assert.equal(
    manifest.reports.human_recipe_projection.sha256,
    crypto.createHash('sha256').update(fs.readFileSync(projectionReportPath)).digest('hex')
  )

  const invalidReportMutations = [
    'missing-required',
    'wrong-const',
    'extra-property',
    'wrong-type'
  ]
  const invalidReportScript = `
import importlib.util
import pathlib
import sys

root = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location(
    "projection",
    root / "scripts/fooddata/export_ingredient_cloudbase.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original_builder = module.build_human_recipe_projection_report
mutation = sys.argv[3]

def invalid_builder(*args, **kwargs):
    report = original_builder(*args, **kwargs)
    if mutation == "missing-required":
        del report["counts"]
    elif mutation == "wrong-const":
        report["activation"]["targetStatus"] = "active"
    elif mutation == "extra-property":
        report["unexpected"] = True
    elif mutation == "wrong-type":
        report["counts"]["recipes"] = "one"
    return report

module.build_human_recipe_projection_report = invalid_builder
try:
    module.export_documents(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
except ValueError as error:
    print(str(error))
    raise SystemExit(3)
raise SystemExit(0)
`

  invalidReportMutations.forEach((mutation) => {
    const invalidOutDir = path.join(tmp, `cloudbase-invalid-report-${mutation}`)
    const invalidResult = runPython(
      invalidReportScript,
      [output, invalidOutDir, mutation]
    )

    assert.equal(invalidResult.status, 3, invalidResult.stderr || invalidResult.stdout)
    assert.match(invalidResult.stdout, /投影报告.*schema|schema.*投影报告/)
    assert.equal(
      fs.existsSync(path.join(invalidOutDir, 'human-recipe-projection-report.json')),
      false
    )
    assert.equal(
      fs.existsSync(path.join(invalidOutDir, 'cloudbase-ingredient-import-manifest.json')),
      false
    )
  })
})

test('食材目录种子拒绝未受控分类和跨概念别名冲突', () => {
  const { tmp, foundation, srDir, recipes, output } = createFixtureSet()
  const seedPath = path.join(tmp, 'invalid-catalog.json')
  const buildResult = runBuilder([
    '--foundation-sqlite', foundation,
    '--sr-legacy-dir', srDir,
    '--recipes-csv', recipes,
    '--out-sqlite', output,
    '--release-id', 'test-release'
  ])
  assert.equal(buildResult.status, 0, buildResult.stderr)

  const baseItem = {
    category_code: 'vegetable',
    subcategory_code: 'fruit_vegetable',
    aliases: [],
    variants: [{
      display_name_zh: '番茄（生）',
      preparation_state: 'raw',
      source_version: 'foundation',
      fdc_id: 10,
      description_contains: 'Tomato, raw',
      is_default: true
    }]
  }

  fs.writeFileSync(seedPath, JSON.stringify({
    catalog_version: 'test-invalid-category',
    items: [{
      ...baseItem,
      concept_id: 'ingredient_tomato',
      canonical_name_zh: '番茄',
      category_code: 'temporary_category',
      variants: [{ ...baseItem.variants[0], variant_id: 'variant_tomato_raw' }]
    }]
  }))
  const categoryResult = runCatalogSeeder(['--sqlite', output, '--seed', seedPath])
  assert.notEqual(categoryResult.status, 0)
  assert.match(categoryResult.stderr, /未受控的一级分类/)

  fs.writeFileSync(seedPath, JSON.stringify({
    catalog_version: 'test-alias-conflict',
    items: [
      {
        ...baseItem,
        concept_id: 'ingredient_tomato',
        canonical_name_zh: '番茄',
        aliases: ['西红柿'],
        variants: [{ ...baseItem.variants[0], variant_id: 'variant_tomato_raw' }]
      },
      {
        ...baseItem,
        concept_id: 'ingredient_other_tomato',
        canonical_name_zh: '其他番茄',
        aliases: ['西红柿'],
        variants: [{ ...baseItem.variants[0], variant_id: 'variant_other_tomato_raw' }]
      }
    ]
  }))
  const aliasResult = runCatalogSeeder(['--sqlite', output, '--seed', seedPath])
  assert.notEqual(aliasResult.status, 0)
  assert.match(aliasResult.stderr, /规范化别名跨概念冲突/)
})
