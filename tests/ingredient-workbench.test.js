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

  const recent = ingredientService.getRecentIngredients()
  const results = (await ingredientService.loadIngredientPage({ keyword: '鸡胸' })).items

  assert.equal(recent[0].name, '西蓝花')
  assert.ok(results.length > 0)
  assert.ok(results.every((item) => item.name.includes('鸡胸')))
})

test('搜索不到食材时返回空数组', async () => {
  const page = await ingredientService.loadIngredientPage({ keyword: '不存在的食材' })
  assert.deepEqual(page.items, [])
  assert.equal(page.hasMore, false)
})

test('运行时发布只读取 active，无 active 时拒绝回退 staging', async () => {
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
              return { data: [] }
            }
          }
        }
      }
    }
  }

  try {
    await assert.rejects(
      () => runtimeDataReleaseService.loadRuntimeRelease(database),
      /未找到 active 数据发布版本/
    )
    assert.deepEqual(statuses, ['active'])
  } finally {
    runtimeDataReleaseService.clearCache()
  }
})

test('云端食材目录每次只读取 20 条并按偏移量加载下一页', async () => {
  const originalWx = global.wx
  const records = Array.from({ length: 45 }, (_, index) => ({
    food_id: `food_${index}`,
    concept_id: `ingredient_${index}`,
    variant_id: `variant_${index}`,
    canonical_name_zh: `食材${String(index).padStart(2, '0')}`,
    category_code: 'other',
    is_default: true,
    policy_status: 'allowed'
  }))
  const catalogCalls = []
  ingredientService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            neq(value) { return { $neq: value } },
            and(conditions) { return { $and: conditions } },
            or(conditions) { return { $or: conditions } }
          },
          RegExp({ regexp, options }) { return { $regex: regexp, $options: options } },
          collection(name) {
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
                let offset = 0
                return {
                  skip(value) { offset = value; return this },
                  limit(limit) {
                    catalogCalls.push({ condition, offset, limit })
                    return this
                  },
                  async get() {
                    return { data: records.slice(offset, offset + 20) }
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
    const first = await ingredientService.loadIngredientPage({ offset: 0 })
    const second = await ingredientService.loadIngredientPage({ offset: 20 })

    assert.equal(first.items.length, 20)
    assert.equal(first.hasMore, true)
    assert.equal(second.items.length, 20)
    assert.equal(second.hasMore, true)
    assert.deepEqual(catalogCalls.map(({ offset, limit }) => ({ offset, limit })), [
      { offset: 0, limit: 20 },
      { offset: 20, limit: 20 }
    ])
    assert.equal(catalogCalls[0].condition.is_default, true)
    assert.deepEqual(catalogCalls[0].condition.policy_status, { $neq: 'blocked' })
  } finally {
    global.wx = originalWx
    ingredientService.clearCache()
  }
})

test('搜索分页只返回匹配项，不用无关食材补足 20 条', async () => {
  const originalWx = global.wx
  let searchCondition
  ingredientService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            neq(value) { return { $neq: value } },
            and(conditions) { return { $and: conditions } },
            or(conditions) { return { $or: conditions } }
          },
          RegExp({ regexp, options }) { return { $regex: regexp, $options: options } },
          collection(name) {
            if (name === 'data_releases') {
              return {
                where() {
                  return {
                    skip() { return this },
                    limit() { return this },
                    async get() {
                      return {
                        data: [{
                          status: 'active',
                          release_id: 'release-v1',
                          catalog_version: 'catalog-v1',
                          policy_version: 'policy-v1'
                        }]
                      }
                    }
                  }
                }
              }
            }
            return {
              where(condition) {
                searchCondition = condition
                return {
                  skip() { return this },
                  limit() { return this },
                  async get() {
                    return { data: [
                      {
                        food_id: 'food_carrot',
                        concept_id: 'ingredient_carrot',
                        variant_id: 'variant_carrot',
                        canonical_name_zh: '胡萝卜',
                        aliases: ['红萝卜'],
                        category_code: 'vegetable',
                        is_default: true,
                        policy_status: 'allowed'
                      },
                      {
                        food_id: 'food_onion',
                        concept_id: 'ingredient_onion',
                        variant_id: 'variant_onion',
                        canonical_name_zh: '洋葱',
                        category_code: 'vegetable',
                        is_default: true,
                        policy_status: 'allowed'
                      }
                    ] }
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
    const page = await ingredientService.loadIngredientPage({ keyword: '红萝卜' })

    assert.deepEqual(page.items.map((item) => item.name), ['胡萝卜'])
    assert.equal(page.hasMore, false)
    assert.equal(searchCondition.$and[1].$or.length, 3)
    assert.equal(searchCondition.$and[1].$or[0].canonical_name_zh.$regex, '红萝卜')
  } finally {
    global.wx = originalWx
    ingredientService.clearCache()
  }
})

test('食材安全开放规则只拒绝 blocked', () => {
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
