const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const importer = path.join(root, 'scripts/fooddata/import_ingredient_cloudbase.py')

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function runPreflight(packageDir, extra = []) {
  return spawnSync('python3', [
    importer,
    '--package-dir', packageDir,
    '--preflight-only',
    ...extra
  ], { cwd: root, encoding: 'utf8' })
}

function writePackage(directory) {
  const documents = {
    data_releases: {
      _id: 'release-1',
      release_id: 'release-v1',
      rollback_candidate: {
        status: 'active',
        release_id: 'old-release-v1',
        profile_release_id: 'old-profile-v1',
        catalog_version: 'old-catalog-v1',
        policy_version: 'old-policy-v1',
        ranking_version: 'old-ranking-v1',
        recipe_version: 'old-recipe-v1',
        mapping_version: 'old-mapping-v1'
      }
    },
    food_nutrition_profiles: { _id: 'food-1', release_id: 'release-v1' },
    ingredient_catalog: { _id: 'catalog-1', release_id: 'release-v1' },
    canine_ingredient_policies: { _id: 'policy-1', policy_version: 'policy-v1' },
    nutrient_rankings: { _id: 'ranking-1', ranking_version: 'ranking-v1' },
    human_recipes: { _id: 'recipe-1', recipe_version: 'recipe-v1' }
  }
  const collections = {}
  Object.entries(documents).forEach(([collection, document]) => {
    const file = `${collection}.jsonl`
    const target = path.join(directory, file)
    fs.writeFileSync(target, `${JSON.stringify(document)}\n`)
    collections[collection] = { file, rows: 1, sha256: sha256(target) }
  })
  fs.writeFileSync(
    path.join(directory, 'cloudbase-ingredient-import-manifest.json'),
    JSON.stringify({ pending_collections: [], collections })
  )
  return { documents, collections }
}

test('CloudBase 导入 preflight 默认拒绝仍有 pending 集合的包', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-preflight-'))
  fs.writeFileSync(
    path.join(directory, 'cloudbase-ingredient-import-manifest.json'),
    JSON.stringify({ pending_collections: ['human_recipes'], collections: {} })
  )

  const result = runPreflight(directory)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /仍有未完成集合/)
})

test('CloudBase 导入 preflight 无需 EnvId 或 CLI 且不执行线上写入', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-preflight-'))
  writePackage(directory)

  const result = runPreflight(directory)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /data_releases: 预检完成/)
  assert.match(result.stdout, /human_recipes: 预检完成/)
})

test('CloudBase 导入 preflight 拒绝同一集合混入多个版本', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-preflight-'))
  const { collections } = writePackage(directory)
  const target = path.join(directory, collections.nutrient_rankings.file)
  fs.appendFileSync(target, `${JSON.stringify({
    _id: 'ranking-2',
    ranking_version: 'ranking-v2'
  })}\n`)
  collections.nutrient_rankings.rows = 2
  collections.nutrient_rankings.sha256 = sha256(target)
  fs.writeFileSync(
    path.join(directory, 'cloudbase-ingredient-import-manifest.json'),
    JSON.stringify({ pending_collections: [], collections })
  )

  const result = runPreflight(directory)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /必须且只能包含一个 ranking_version/)
})

test('CloudBase 导入 preflight 拒绝没有完整 active 回滚组合的发布记录', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-preflight-'))
  const { documents, collections } = writePackage(directory)
  documents.data_releases.rollback_candidate = {
    status: 'requires-active-pointer'
  }
  const target = path.join(directory, collections.data_releases.file)
  fs.writeFileSync(target, `${JSON.stringify(documents.data_releases)}\n`)
  collections.data_releases.sha256 = sha256(target)
  fs.writeFileSync(
    path.join(directory, 'cloudbase-ingredient-import-manifest.json'),
    JSON.stringify({ pending_collections: [], collections })
  )

  const result = runPreflight(directory)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /rollback_candidate 不是完整 active 组合/)
})
