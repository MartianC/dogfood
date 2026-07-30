const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  validateSharedMealIngredient
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

const root = path.resolve(__dirname, '..')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')

test('唯一 sharedMealIngredient/v1 schema 与正向 fixture 固定嵌套版本契约', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    root,
    'contracts/shared-meal/shared-meal-ingredient-v1.schema.json'
  ), 'utf8'))

  assert.equal(schema.$id, 'sharedMealIngredient/v1')
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.schemaVersion.const, 1)
  assert.equal(schema.properties.dataVersions.additionalProperties, false)
  assert.deepEqual(schema.properties.dataVersions.required, [
    'runtimeReleaseId',
    'recipeVersion',
    'mappingVersion',
    'catalogVersion',
    'policyVersion',
    'nutritionSourceReleaseId'
  ])
  assert.doesNotThrow(() => validateSharedMealIngredient(fixture))
})

test('共享食材拒绝身份不一致、缺失或重命名版本和扁平版本字段', () => {
  const invalidCases = [
    { ...fixture, foodId: 'food_other' },
    {
      ...fixture,
      dataVersions: { ...fixture.dataVersions, policyVersion: undefined }
    },
    {
      ...fixture,
      dataVersions: {
        ...fixture.dataVersions,
        nutritionSourceReleaseId: undefined,
        sourceReleaseId: fixture.dataVersions.nutritionSourceReleaseId
      }
    },
    { ...fixture, catalogVersion: fixture.dataVersions.catalogVersion },
    { ...fixture, schemaVersion: 2 }
  ]

  invalidCases.forEach((ingredient) => {
    assert.throws(() => validateSharedMealIngredient(ingredient), /共享本餐食材/)
  })
})
