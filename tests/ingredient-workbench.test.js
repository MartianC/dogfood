const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const ingredientService = require('../subpackages/custom-recipe/services/ingredientService')
const ingredientWorkbench = require('../subpackages/custom-recipe/services/ingredientWorkbench')
const runtimeDataReleaseService = require('../subpackages/custom-recipe/services/runtimeDataReleaseService')

test.beforeEach(() => {
  storage.removeSync('recentIngredients')
})

test('空关键词返回最近添加的食材，非空关键词从食材库过滤', async () => {
  ingredientService.recordRecentIngredient({ id: 'recent_1', name: '西蓝花', category: 'vegetable' })

  const recent = await ingredientService.searchIngredients('')
  const results = await ingredientService.searchIngredients('鸡胸')

  assert.equal(recent[0].name, '西蓝花')
  assert.ok(results.length > 0)
  assert.ok(results.every((item) => item.name.includes('鸡胸')))
})

test('搜索不到食材时返回空数组', async () => {
  assert.deepEqual(await ingredientService.searchIngredients('不存在的食材'), [])
})

test('运行时发布优先 active，无 active 时回退最新 staging', async () => {
  const statuses = []
  runtimeDataReleaseService.clearCache()
  const database = {
    collection(name) {
      assert.equal(name, 'data_releases')
      return {
        where(condition) {
          statuses.push(condition.status)
          return {
            skip() { return this },
            limit() { return this },
            async get() {
              if (condition.status === 'active') return { data: [] }
              return {
                data: [
                  { release_id: 'release-old', status: 'staging', generated_at: '2026-07-21T00:00:00Z' },
                  { release_id: 'release-new', status: 'staging', generated_at: '2026-07-23T00:00:00Z' }
                ]
              }
            }
          }
        }
      }
    }
  }

  try {
    const release = await runtimeDataReleaseService.loadRuntimeRelease(database)
    assert.deepEqual(statuses, ['active', 'staging'])
    assert.equal(release.release_id, 'release-new')
  } finally {
    runtimeDataReleaseService.clearCache()
  }
})

test('云端食材搜索开放除 blocked 外的全部可搜索食材', async () => {
  const originalWx = global.wx
  const catalogWhereCalls = []
  const collectionNames = []
  const notBlocked = { operator: 'neq', value: 'blocked' }
  ingredientService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            neq(value) {
              assert.equal(value, 'blocked')
              return notBlocked
            }
          },
          collection(name) {
            collectionNames.push(name)
            if (name === 'data_releases') {
              return {
                where(condition) {
                  return {
                    skip() { return this },
                    limit() { return this },
                    async get() {
                      return {
                        data: condition.status === 'active'
                          ? [{
                            status: 'active',
                            release_id: 'release-v1',
                            catalog_version: 'catalog-v1',
                            policy_version: 'policy-v1',
                            ranking_version: 'ranking-v1'
                          }]
                          : []
                      }
                    }
                  }
                }
              }
            }
            assert.equal(name, 'ingredient_catalog')
            return {
              where(condition) {
                catalogWhereCalls.push(condition)
                return {
                  skip() { return this },
                  limit() { return this },
                  async get() {
                    return {
                      data: [
                        {
                          food_id: 'food_2',
                          concept_id: 'ingredient_carrot',
                          variant_id: 'variant_carrot_cooked',
                          display_name_zh: '胡萝卜（煮熟）',
                          canonical_name_zh: '胡萝卜',
                          aliases: ['红萝卜'],
                          category_code: 'vegetable',
                          is_default: false,
                          catalog_version: 'catalog-v1',
                          policy_version: 'policy-v1',
                          policy_status: 'conditional'
                        },
                        {
                          food_id: 'food_1',
                          concept_id: 'ingredient_carrot',
                          variant_id: 'variant_carrot_raw',
                          display_name_zh: '胡萝卜（生）',
                          canonical_name_zh: '胡萝卜',
                          aliases: ['红萝卜'],
                          category_code: 'vegetable',
                          is_default: true,
                          catalog_version: 'catalog-v1',
                          policy_version: 'policy-v1',
                          policy_status: 'unknown'
                        },
                        {
                          food_id: 'food_3',
                          concept_id: 'ingredient_onion',
                          variant_id: 'variant_onion_raw',
                          display_name_zh: '洋葱（生）',
                          canonical_name_zh: '洋葱',
                          aliases: [],
                          category_code: 'vegetable',
                          is_default: true,
                          catalog_version: 'catalog-v1',
                          policy_version: 'policy-v1',
                          policy_status: 'blocked'
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    const catalog = await ingredientService.loadIngredientCatalog()
    const results = await ingredientService.searchIngredients('红萝卜')

    assert.deepEqual(collectionNames, ['data_releases', 'ingredient_catalog'])
    assert.deepEqual(catalogWhereCalls, [{
      catalog_version: 'catalog-v1',
      policy_version: 'policy-v1',
      policy_status: notBlocked
    }])
    assert.equal(catalog[0].name, '胡萝卜')
    assert.equal(catalog[0].variantName, '胡萝卜（生）')
    assert.equal(catalog.length, 1)
    assert.equal(catalog[0].policyStatus, 'unknown')
    assert.equal(results[0].foodId, 'food_1')
    assert.equal(results[0].conceptId, 'ingredient_carrot')
    assert.equal(results[0].variantId, 'variant_carrot_raw')
  } finally {
    global.wx = originalWx
    ingredientService.clearCache()
  }
})

test('食材安全开放规则只拦截 blocked', () => {
  assert.equal(ingredientService.isIngredientPolicyOpen({ policy_status: 'allowed' }), true)
  assert.equal(ingredientService.isIngredientPolicyOpen({ policy_status: 'conditional' }), true)
  assert.equal(ingredientService.isIngredientPolicyOpen({ policy_status: 'unknown' }), true)
  assert.equal(ingredientService.isIngredientPolicyOpen({ policy_status: 'blocked' }), false)
})

test('默认常用食材顺序和搜索结果摘要保持稳定', () => {
  const commonNames = ingredientService.getRecentIngredients().slice(0, 4).map((item) => item.name)
  const withEnergy = ingredientService.normalizeIngredient({
    id: 'chicken',
    name: '鸡胸肉',
    category: 'meat',
    energyKcalPer100g: 133
  })

  assert.deepEqual(commonNames, ['牛肉', '鸡蛋', '南瓜', '西兰花'])
  assert.equal(withEnergy.displayDescription, '每 100 g 约 133 kcal')
  assert.equal(ingredientService.normalizeIngredient({ name: '南瓜', category: 'vegetable' }).displayDescription, '蔬菜')
})

test('修改克重会实时更新每个食材比例', () => {
  const ingredients = [
    { name: '鸡胸肉', perMealAmountGram: 100 },
    { name: '胡萝卜', perMealAmountGram: 100 }
  ]

  const next = ingredientWorkbench.updateIngredientAmount(ingredients, 0, '300')

  assert.equal(next[0].ratioPercent, 75)
  assert.equal(next[1].ratioPercent, 25)
  assert.equal(ingredientWorkbench.totalIngredientGram(next), 400)
})

test('添加重复食材会合并克重，新增食材会加入列表', () => {
  const current = [{ ingredientId: 'food_1', name: '鸡胸肉', perMealAmountGram: 100 }]

  const merged = ingredientWorkbench.addIngredient(current, { id: 'food_1', name: '鸡胸肉', category: 'meat' }, 50)
  const added = ingredientWorkbench.addIngredient(merged, { id: 'food_2', name: '南瓜', category: 'vegetable' }, 30)

  assert.equal(added.length, 2)
  assert.equal(added[0].perMealAmountGram, 150)
  assert.equal(added[1].perMealAmountGram, 30)
})

test('新增目录食材会保留稳定身份和数据版本', () => {
  const [added] = ingredientWorkbench.addIngredient([], {
    id: 'food_1',
    foodId: 'food_1',
    conceptId: 'ingredient_carrot',
    variantId: 'variant_carrot_raw',
    catalogVersion: 'catalog-v1',
    policyVersion: 'policy-v1',
    sourceReleaseId: 'source-v1',
    name: '胡萝卜（生）',
    category: 'vegetable'
  }, 80)

  assert.equal(added.ingredientId, 'food_1')
  assert.equal(added.conceptId, 'ingredient_carrot')
  assert.equal(added.variantId, 'variant_carrot_raw')
  assert.equal(added.catalogVersion, 'catalog-v1')
  assert.equal(added.policyVersion, 'policy-v1')
  assert.equal(added.sourceReleaseId, 'source-v1')
})
