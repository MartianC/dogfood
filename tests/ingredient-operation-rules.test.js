const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const rules = require('../contracts/shared-meal/ingredient-operation-rules-v1.json')
const {
  canSearchIngredient,
  canAddIngredient,
  canAutoIncludeIngredient,
  KNOWN_POLICY_STATUSES,
  BLOCKED_POLICY_STATUS,
  OPERABLE_POLICY_STATUSES
} = require('../subpackages/shared-meal/services/ingredientOperationRules')

const expected = {
  allowed: true,
  conditional: true,
  unknown: true,
  blocked: false
}

test('唯一食材操作规则对搜索、添加、自动带入和排行使用同一 not-blocked 判定', () => {
  assert.equal(rules.contract, 'ingredientOperationRules/v1')
  assert.deepEqual(KNOWN_POLICY_STATUSES, rules.knownStatuses)
  assert.equal(BLOCKED_POLICY_STATUS, rules.blockedStatus)
  assert.deepEqual(OPERABLE_POLICY_STATUSES, rules.operableStatuses)
  assert.deepEqual(rules.operations, {
    search: 'notBlocked', add: 'notBlocked', autoInclude: 'notBlocked', nutrientRanking: 'notBlocked'
  })
  for (const [status, allowed] of Object.entries(expected)) {
    assert.equal(canSearchIngredient({ policy_status: status }), allowed)
    assert.equal(canAddIngredient({ policyStatus: status }), allowed)
    assert.equal(canAutoIncludeIngredient(status), allowed)
  }
})

test('小程序运行时规则不直接 require 机器契约 JSON', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'subpackages/shared-meal/services/ingredientOperationRules.js'),
    'utf8'
  )
  assert.doesNotMatch(source, /require\([^)]*contracts\/shared-meal\/[^)]*\.json/)
})

test('Python 投影与排行构建器和 JavaScript 对四态规则保持一致', () => {
  const root = path.resolve(__dirname, '..')
  const script = `
import importlib.util
import json
import pathlib

root = pathlib.Path(${JSON.stringify(root)})
matrix = {}
for module_name, relative_path in [
    ("projection", "scripts/fooddata/export_ingredient_cloudbase.py"),
    ("ranking", "scripts/fooddata/seed_nutrient_rankings.py"),
]:
    spec = importlib.util.spec_from_file_location(module_name, root / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    matrix[module_name] = {
        status: module.can_operate_ingredient(status)
        for status in ("allowed", "conditional", "unknown", "blocked")
    }
print(json.dumps(matrix))
`
  const result = spawnSync('python3', ['-c', script], {
    cwd: root,
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    projection: expected,
    ranking: expected
  })
})
