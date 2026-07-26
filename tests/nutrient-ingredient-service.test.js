const test = require('node:test')
const assert = require('node:assert/strict')

let nutrientIngredientService = null
try {
  nutrientIngredientService = require('../subpackages/custom-recipe/services/nutrientIngredientService')
} catch (error) {
  nutrientIngredientService = null
}

test('营养食材结果只保留可靠数据并按每 100g 含量倒序', () => {
  assert.ok(nutrientIngredientService, '缺少 nutrientIngredientService')

  const results = nutrientIngredientService.buildNutrientIngredientResults({
    nutrientCode: 'calcium',
    nutrientName: '钙',
    ranking: {
      unit_name: 'MG',
      compatible_catalog_version: 'catalog-v1',
      compatible_policy_version: 'policy-v1',
      items: [
        {
          rank: 1,
          food_id: 'food_sardine',
          concept_id: 'ingredient_sardine',
          variant_id: 'variant_sardine_cooked',
          canonical_name_zh: '沙丁鱼',
          display_name_zh: '无盐沙丁鱼（熟）',
          category_code: 'fish',
          amount_per_100g: 382
        },
        {
          rank: 2,
          food_id: 'food_tofu',
          concept_id: 'ingredient_tofu',
          variant_id: 'variant_tofu_firm',
          canonical_name_zh: '豆腐',
          display_name_zh: '北豆腐',
          category_code: 'legume',
          amount_per_100g: 138
        },
        {
          rank: 3,
          food_id: 'food_missing',
          display_name_zh: '缺少数据的食材',
          amount_per_100g: null
        }
      ]
    },
    currentIngredients: [
      { ingredientId: 'food_tofu', name: '北豆腐', perMealAmountGram: 60 }
    ]
  })

  assert.deepEqual(results.map((item) => item.name), ['沙丁鱼', '豆腐'])
  assert.equal(results[0].displayDescription, '钙 382 mg / 100 g · 其他')
  assert.equal(results[1].displayDescription, '钙 138 mg / 100 g · 已在食谱 60 g')
  assert.equal(results[0].catalogVersion, 'catalog-v1')
  assert.equal(results[0].policyVersion, 'policy-v1')
})

test('富含营养素查询只读取 nutrient_rankings', async () => {
  const originalWx = global.wx
  const collections = []
  global.wx = {
    cloud: {
      database() {
        return {
          collection(name) {
            collections.push(name)
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
            return {
              where(condition) {
                assert.deepEqual(condition, {
                  nutrient_code: 'calcium',
                  ranking_version: 'ranking-v1'
                })
                return this
              },
              limit() { return this },
              async get() {
                return {
                  data: [{
                    nutrient_code: 'calcium',
                    nutrient_name_zh: '钙',
                    unit_name: 'MG',
                    items: [{
                      food_id: 'food_broccoli',
                      display_name_zh: '西兰花（生）',
                      canonical_name_zh: '西兰花',
                      category_code: 'vegetable',
                      amount_per_100g: 46
                    }]
                  }]
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    const results = await nutrientIngredientService.loadNutrientIngredients({
      nutrientCode: 'calcium',
      nutrientName: '钙',
      keyword: '西兰花'
    })
    assert.deepEqual(collections, ['data_releases', 'nutrient_rankings'])
    assert.equal(results[0].name, '西兰花')
  } finally {
    global.wx = originalWx
  }
})
