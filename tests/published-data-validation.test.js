const test = require('node:test')
const assert = require('node:assert/strict')
const { validatePublishedIngredients } = require('../cloudfunctions/sharedMealRecord/publishedDataValidation')

function databaseFor({ catalog = [] } = {}) {
  return {
    collection(name) {
      return {
        where(condition) {
          return {
            limit() {
              return { get: async () => ({ data: name === 'ingredient_catalog'
                ? catalog.filter((row) => Object.keys(condition).every((key) => row[key] === condition[key]))
                : [] }) }
            }
          }
        }
      }
    }
  }
}

const release = {
  release_id: 'release-v3',
  catalog_version: 'catalog-v3',
  policy_version: 'policy-v3'
}

function ingredient(overrides = {}) {
  return {
    foodId: 'food-1', conceptId: 'concept-1', variantId: 'variant-1',
    dataVersions: {
      runtimeReleaseId: 'release-v3', catalogVersion: 'catalog-v3', policyVersion: 'policy-v3'
    },
    ...overrides
  }
}

test('发布目录身份和 allowed 策略通过二次校验', async () => {
  await validatePublishedIngredients(databaseFor({ catalog: [{
    concept_id: 'concept-1', variant_id: 'variant-1', catalog_version: 'catalog-v3',
    policy_version: 'policy-v3', food_id: 'food-1', policy_status: 'allowed'
  }] }), [ingredient()], release)
})

test('缺少目录身份时 fail closed', async () => {
  await assert.rejects(
    validatePublishedIngredients(databaseFor(), [ingredient({ conceptId: '' })], release),
    (error) => error.code === 'INVALID_INGREDIENT'
  )
})

test('unknown、conditional 可保存，仅 blocked 不可保存', async () => {
  for (const policy_status of ['unknown', 'conditional']) {
    await validatePublishedIngredients(databaseFor({ catalog: [{
      concept_id: 'concept-1', variant_id: 'variant-1', catalog_version: 'catalog-v3',
      policy_version: 'policy-v3', food_id: 'food-1', policy_status
    }] }), [ingredient()], release)
  }
  await assert.rejects(
    validatePublishedIngredients(databaseFor({ catalog: [{
        concept_id: 'concept-1', variant_id: 'variant-1', catalog_version: 'catalog-v3',
        policy_version: 'policy-v3', food_id: 'food-1', policy_status: 'blocked'
      }] }), [ingredient()], release),
    (error) => error.code === 'BLOCKED_INGREDIENT'
  )
})

test('版本不一致时拒绝客户端旧快照', async () => {
  await assert.rejects(
    validatePublishedIngredients(databaseFor(), [ingredient({
      dataVersions: { runtimeReleaseId: 'old', catalogVersion: 'catalog-v3', policyVersion: 'policy-v3' }
    })], release),
    (error) => error.code === 'VERSION_CONFLICT'
  )
})
