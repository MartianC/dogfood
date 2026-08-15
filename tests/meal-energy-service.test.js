const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../subpackages/custom-recipe/services/mealEnergyService')

test('优先汇总每 100g 能量记录', () => {
  const result = service.calculateMealEnergy({
    ingredients: [{ ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 150 }],
    nutrientRecords: [{ food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: 120 }]
  })

  assert.equal(result.available, true)
  assert.equal(result.totalKcal, 180)
  assert.equal(result.knownKcal, 180)
  assert.deepEqual(result.missingIngredients, [])
  assert.deepEqual(result.ingredientEnergies, [
    { id: 'food_a', name: '鸡胸肉', kcal: 180, source: 'direct' }
  ])
})

test('兼容 USDA Atwater 能量营养素 ID', () => {
  const result = service.calculateMealEnergy({
    ingredients: [
      { ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 100 },
      { ingredientId: 'food_b', name: '牛肉', perMealAmountGram: 100 }
    ],
    nutrientRecords: [
      { food_id: 'food_a', nutrient_id: 2047, unit_name: 'KCAL', amount: 106.034 },
      { food_id: 'food_b', nutrient_id: 2048, unit_name: 'KCAL', amount: 112.20227 }
    ]
  })

  assert.equal(result.available, true)
  assert.equal(result.totalKcal, 218.23627)
  assert.deepEqual(result.ingredientEnergies.map(({ id, name, source }) => ({ id, name, source })), [
    { id: 'food_a', name: '鸡胸肉', source: 'direct_atwater_general' },
    { id: 'food_b', name: '牛肉', source: 'direct_atwater_specific' }
  ])
  assert.ok(Math.abs(result.ingredientEnergies[0].kcal - 106.034) < 1e-9)
  assert.ok(Math.abs(result.ingredientEnergies[1].kcal - 112.20227) < 1e-9)
})

test('能量记录缺失时使用完整宏量营养数据估算', () => {
  const result = service.calculateMealEnergy({
    ingredients: [{ ingredientId: 'food_a', name: '测试食材', perMealAmountGram: 50 }],
    nutrientRecords: [
      { food_id: 'food_a', nutrient_id: 1003, unit_name: 'G', amount: 20 },
      { food_id: 'food_a', nutrient_id: 1004, unit_name: 'G', amount: 10 },
      { food_id: 'food_a', nutrient_id: 1005, unit_name: 'G', amount: 30 }
    ]
  })

  assert.equal(result.available, true)
  assert.equal(result.totalKcal, 145)
  assert.equal(result.ingredientEnergies[0].source, 'macro_estimate')
})

test('任一正克重食材能量缺失时仅返回已知能量下限', () => {
  const result = service.calculateMealEnergy({
    ingredients: [
      { ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 150 },
      { ingredientId: 'food_b', name: '南瓜', perMealAmountGram: 80 }
    ],
    nutrientRecords: [
      { food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: 120 },
      { food_id: 'food_b', nutrient_id: 1003, unit_name: 'G', amount: 1 }
    ]
  })

  assert.equal(result.available, false)
  assert.equal(result.totalKcal, null)
  assert.equal(result.knownKcal, 180)
  assert.deepEqual(result.ingredientEnergies, [
    { id: 'food_a', name: '鸡胸肉', kcal: 180, source: 'direct' }
  ])
  assert.deepEqual(result.missingIngredients, [
    { id: 'food_b', name: '南瓜', reason: '缺少能量和完整宏量营养数据' }
  ])
})

test('固定目标的 89.99% 判为低于估算目标', () => {
  const status = service.evaluateEnergyStatus({
    currentKcal: 89.99,
    mealTarget: { min: 100, max: 100 }
  })

  assert.equal(status, 'below_target')
})

test('固定目标的 90% 和 110% 边界均包含在接近目标内', () => {
  const mealTarget = { min: 100, max: 100 }

  assert.equal(service.evaluateEnergyStatus({ currentKcal: 90, mealTarget }), 'near_target')
  assert.equal(service.evaluateEnergyStatus({ currentKcal: 110, mealTarget }), 'near_target')
  assert.equal(service.evaluateEnergyStatus({ currentKcal: 110.01, mealTarget }), 'above_target')
})

test('高活动范围直接按上下界判断且不叠加容差', () => {
  const mealTarget = { min: 150, max: 175 }

  assert.equal(service.evaluateEnergyStatus({ currentKcal: 149.99, mealTarget }), 'below_target')
  assert.equal(service.evaluateEnergyStatus({ currentKcal: 150, mealTarget }), 'near_target')
  assert.equal(service.evaluateEnergyStatus({ currentKcal: 175, mealTarget }), 'near_target')
  assert.equal(service.evaluateEnergyStatus({ currentKcal: 175.01, mealTarget }), 'above_target')
})

test('能量或目标无效时返回 unavailable 而不是错误状态', () => {
  const cases = [
    { currentKcal: Number.NaN, mealTarget: { min: 100, max: 100 } },
    { currentKcal: -1, mealTarget: { min: 100, max: 100 } },
    { currentKcal: 100, mealTarget: null },
    { currentKcal: 100, mealTarget: { min: Number.NaN, max: 100 } },
    { currentKcal: 100, mealTarget: { min: 110, max: 100 } }
  ]

  cases.forEach((input) => {
    assert.equal(service.evaluateEnergyStatus(input), 'unavailable')
  })
})

test('按目标下界同比例生成整餐份量预览', () => {
  const mealTarget = { min: 312, max: 350 }
  const result = service.buildScaleSuggestion({
    ingredients: [
      { ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 150 },
      { ingredientId: 'food_b', name: '南瓜', perMealAmountGram: 90 }
    ],
    currentKcal: 288,
    mealTarget
  })

  assert.equal(result.available, true)
  assert.ok(Math.abs(result.scale - 1.0833333333333333) < Number.EPSILON)
  assert.equal(result.currentTotalGram, 240)
  assert.equal(result.suggestedTotalGram, 260)
  assert.deepEqual(result.targetRange, mealTarget)
  assert.deepEqual(result.suggestedIngredients, [
    { ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 162.5 },
    { ingredientId: 'food_b', name: '南瓜', perMealAmountGram: 97.5 }
  ])
})

test('没有正克重食材时供给结果不可用且总能量为空', () => {
  const result = service.calculateMealEnergy({
    ingredients: [
      { ingredientId: 'food_a', name: '未添加', perMealAmountGram: 0 },
      { ingredientId: 'food_b', name: '非法克重', perMealAmountGram: -10 }
    ],
    nutrientRecords: [
      { food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: 120 }
    ]
  })

  assert.deepEqual(result, {
    available: false,
    totalKcal: null,
    knownKcal: 0,
    ingredientEnergies: [],
    missingIngredients: []
  })
})

test('空值能量记录不能被误当作零千卡', () => {
  const result = service.calculateMealEnergy({
    ingredients: [{ ingredientId: 'food_a', name: '数据不完整食材', perMealAmountGram: 100 }],
    nutrientRecords: [{ food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: null }]
  })

  assert.equal(result.available, false)
  assert.equal(result.totalKcal, null)
  assert.equal(result.knownKcal, 0)
  assert.equal(result.missingIngredients[0].id, 'food_a')
})

test('缩放输入不完整时不生成空或无穷预览', () => {
  const cases = [
    { ingredients: [], currentKcal: 100, mealTarget: { min: 110, max: 110 } },
    {
      ingredients: [{ ingredientId: 'food_a', perMealAmountGram: 100 }],
      currentKcal: Number.POSITIVE_INFINITY,
      mealTarget: { min: 110, max: 110 }
    },
    {
      ingredients: [{ ingredientId: 'food_a', perMealAmountGram: 100 }],
      currentKcal: 100,
      mealTarget: { min: 120, max: 110 }
    }
  ]

  cases.forEach((input) => {
    assert.deepEqual(service.buildScaleSuggestion(input), { available: false })
  })
})

test('一位小数舍入后总重守恒且食材占比误差小于 0.001', () => {
  const ingredients = [
    { ingredientId: 'food_a', name: '食材 A', perMealAmountGram: 100 },
    { ingredientId: 'food_b', name: '食材 B', perMealAmountGram: 50 }
  ]
  const result = service.buildScaleSuggestion({
    ingredients,
    currentKcal: 120,
    mealTarget: { min: 130, max: 130 }
  })
  const suggestedSum = result.suggestedIngredients.reduce(
    (sum, item) => sum + item.perMealAmountGram,
    0
  )

  assert.equal(suggestedSum, result.suggestedTotalGram)
  result.suggestedIngredients.forEach((item, index) => {
    const beforeRatio = ingredients[index].perMealAmountGram / 150
    const afterRatio = item.perMealAmountGram / result.suggestedTotalGram
    assert.ok(Math.abs(beforeRatio - afterRatio) < 0.001)
  })
})

test('极小缩放比例下也不会产生负克重', () => {
  const result = service.buildScaleSuggestion({
    ingredients: [
      { ingredientId: 'food_a', perMealAmountGram: 1 },
      { ingredientId: 'food_b', perMealAmountGram: 1 },
      { ingredientId: 'food_c', perMealAmountGram: 1 },
      { ingredientId: 'food_d', perMealAmountGram: 1 }
    ],
    currentKcal: 100,
    mealTarget: { min: 6, max: 6 }
  })

  const suggestedSum = result.suggestedIngredients.reduce(
    (sum, item) => sum + item.perMealAmountGram,
    0
  )
  assert.ok(Math.abs(suggestedSum - result.suggestedTotalGram) < 1e-9)
  assert.ok(result.suggestedIngredients.every((item) => item.perMealAmountGram >= 0))
})
