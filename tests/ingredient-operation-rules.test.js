const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rules = require('../contracts/shared-meal/ingredient-operation-rules-v1.json')
const {
  canSearchIngredient,
  canAddIngredient,
  canAutoIncludeIngredient
} = require('../utils/ingredientOperationRules')

const expected = {
  allowed: true,
  conditional: true,
  unknown: true,
  blocked: false
}

test('唯一食材操作规则对搜索、添加和自动带入使用同一非 blocked 判定', () => {
  assert.equal(rules.contract, 'ingredientOperationRules/v1')
  for (const [status, allowed] of Object.entries(expected)) {
    assert.equal(canSearchIngredient({ policy_status: status }), allowed)
    assert.equal(canAddIngredient({ policyStatus: status }), allowed)
    assert.equal(canAutoIncludeIngredient(status), allowed)
  }
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
