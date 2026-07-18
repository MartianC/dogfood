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
    preferredUnit: 'mg',
    nutrientRecords: [
      { food_id: 'food_tofu', nutrient_id: 1087, unit_name: 'MG', amount: 138 },
      { food_id: 'food_sardine', nutrient_id: 1087, unit_name: 'MG', amount: 382 },
      { food_id: 'food_missing', nutrient_id: 1087, unit_name: 'MG', amount: null },
      { food_id: 'food_protein', nutrient_id: 1003, unit_name: 'G', amount: 20 }
    ],
    localizedNames: [
      { food_id: 'food_tofu', locale: 'zh-CN', name: '北豆腐', name_type: 'preferred', confidence: 0.95 },
      { food_id: 'food_sardine', locale: 'zh-CN', name: '无盐沙丁鱼（熟）', name_type: 'preferred', confidence: 0.98 },
      { food_id: 'food_missing', locale: 'zh-CN', name: '缺少数据的食材', name_type: 'preferred', confidence: 0.9 }
    ],
    currentIngredients: [
      { ingredientId: 'food_tofu', name: '北豆腐', perMealAmountGram: 60 }
    ]
  })

  assert.deepEqual(results.map((item) => item.name), ['无盐沙丁鱼（熟）', '北豆腐'])
  assert.equal(results[0].displayDescription, '钙 382 mg / 100 g · 其他')
  assert.equal(results[1].displayDescription, '钙 138 mg / 100 g · 已在食谱 60 g')
})
