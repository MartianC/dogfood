const test = require('node:test')
const assert = require('node:assert/strict')

const calculator = require('../utils/calculator')
const planCalculatorService = require('../services/planCalculatorService')

const recipe = {
  id: 'fish-light',
  title: '低脂鳕鱼饭',
  baseWeightKg: 10,
  sourceType: 'builtInRecipe',
  ingredients: [
    { name: '鳕鱼', category: 'meat', baseAmountGram: 140, ratioPercent: 56, allergenKey: 'fish' },
    { name: '西蓝花', category: 'vegetable', baseAmountGram: 40, ratioPercent: 16 },
    { name: '胡萝卜', category: 'vegetable', baseAmountGram: 35, ratioPercent: 14 },
    { name: '熟米饭', category: 'carb', baseAmountGram: 35, ratioPercent: 14, allergenKey: 'grain' }
  ],
  steps: ['清洗食材', '蒸熟后混合', '按餐分装']
}

const pudding = {
  id: 'dog_pudding',
  name: '布丁',
  ageStage: 'adult',
  weightKg: 12,
  dailyMeals: 2,
  dietGoal: 'daily',
  allergens: [],
  avoidIngredients: []
}

const cola = {
  id: 'dog_cola',
  name: '可乐',
  ageStage: 'senior',
  weightKg: 8,
  dailyMeals: 3,
  dietGoal: 'lowFat',
  allergens: [],
  avoidIngredients: []
}

test('单只狗按体重和周期换算每餐克重与采购总量', () => {
  const plan = calculator.calcBatchPlan(recipe, pudding, 15)

  assert.equal(plan.totalMeals, 30)
  assert.equal(plan.perMealTotalGram, 300)
  assert.deepEqual(
    plan.perMealItems.map((item) => [item.name, item.amountGram]),
    [
      ['鳕鱼', 170],
      ['西蓝花', 50],
      ['胡萝卜', 40],
      ['熟米饭', 40]
    ]
  )
  assert.deepEqual(
    plan.totalItems.map((item) => [item.name, item.amountGram]),
    [
      ['鳕鱼', 5100],
      ['西蓝花', 1500],
      ['胡萝卜', 1200],
      ['熟米饭', 1200]
    ]
  )
})

test('多狗共同制作时分别计算分装份数并合并同名采购项', async () => {
  const plan = await planCalculatorService.generate({
    recipe,
    dogs: [pudding, cola],
    periodDays: 15,
    targetDogIds: ['dog_pudding', 'dog_cola'],
    options: { algorithmMode: 'local' }
  })

  assert.equal(plan.algorithmVersion, 'local-rules-v1')
  assert.equal(plan.algorithmSource, 'local')
  assert.equal(plan.targetMode, 'multipleDogs')
  assert.equal(plan.totalPortions, 75)
  assert.deepEqual(
    plan.dogMealSummaries.map((item) => [item.dogName, item.totalMeals, item.perMealTotalGram]),
    [
      ['布丁', 30, 300],
      ['可乐', 45, 200]
    ]
  )
  assert.deepEqual(
    plan.totalItems.map((item) => [item.name, item.amountGram]),
    [
      ['鳕鱼', 10050],
      ['西蓝花', 2850],
      ['胡萝卜', 2550],
      ['熟米饭', 2550]
    ]
  )
})

test('自定义周期限制在 1 到 30 天', async () => {
  await assert.rejects(
    () => planCalculatorService.generate({
      recipe,
      dogs: [pudding],
      periodDays: 45,
      targetDogIds: ['dog_pudding'],
      options: { algorithmMode: 'local' }
    }),
    /制作周期/
  )
})
