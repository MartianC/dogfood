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
