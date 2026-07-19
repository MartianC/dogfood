const test = require('node:test')
const assert = require('node:assert/strict')

const risk = require('../utils/risk')
const recipeAdviceService = require('../subpackages/custom-recipe/services/recipeAdviceService')
const ingredientAdvice = require('../subpackages/custom-recipe/services/ingredientAdvice')
const { decorateDog } = require('../services/lifeStageEstimator')

const TEST_TODAY = '2026-07-18'

function decoratedDog(rawDog) {
  return decorateDog(rawDog, TEST_TODAY)
}

test('风险提示按过敏源、忌口、年龄和饮食目标生成', () => {
  const recipe = {
    title: '鸡肉南瓜饭',
    tags: ['日常'],
    suitableAgeStages: ['adult'],
    ingredients: [
      { name: '鸡胸肉', category: 'meat', allergenKey: 'chicken' },
      { name: '南瓜', category: 'vegetable' }
    ]
  }
  const dog = decoratedDog({
    name: '可乐',
    birthDate: '2010-01-18',
    ageStage: 'senior',
    dietGoal: 'lowFat',
    allergens: ['chicken'],
    avoidIngredients: ['南瓜']
  })

  const warnings = risk.checkRisk(recipe, dog)

  assert.equal(warnings[0].level, 'danger')
  assert.match(warnings[0].msg, /鸡胸肉过敏/)
  assert.equal(warnings[1].level, 'warning')
  assert.match(warnings[1].msg, /南瓜/)
  assert.equal(warnings[2].level, 'info')
  assert.equal(warnings[3].level, 'info')
})

test('自定义食谱建议覆盖确定性六类规则并给出理由', async () => {
  const customRecipe = {
    title: '家里简单饭',
    ingredients: [
      { name: '鸡胸肉', category: 'meat', perMealAmountGram: 120, allergenKey: 'chicken' },
      { name: '肥猪肉', category: 'meat', perMealAmountGram: 80, allergenKey: 'porkBelly' },
      { name: '熟米饭', category: 'carb', perMealAmountGram: 160, allergenKey: 'grain' },
      { name: '胡萝卜', category: 'vegetable', perMealAmountGram: 20 },
      { name: '鳕鱼', category: 'meat', perMealAmountGram: 100, allergenKey: 'fish' }
    ]
  }
  const dog = decoratedDog({
    id: 'dog_pudding',
    name: '布丁',
    birthDate: '2010-01-18',
    ageStage: 'senior',
    weightKg: 12,
    dailyMeals: 2,
    dietGoal: 'lowFat',
    allergens: ['chicken'],
    avoidIngredients: ['grain']
  })

  const result = await recipeAdviceService.buildAdvice({
    customRecipe,
    dogs: [dog],
    options: { algorithmMode: 'local' }
  })

  const byName = Object.fromEntries(result.advices.map((item) => [item.ingredientName, item]))
  assert.equal(byName['鸡胸肉'].level, 'avoid')
  assert.match(byName['鸡胸肉'].reason, /过敏/)
  assert.equal(byName['熟米饭'].level, 'adjust')
  assert.match(byName['熟米饭'].reason, /忌口/)
  assert.equal(byName['肥猪肉'].level, 'adjust')
  assert.match(byName['肥猪肉'].reason, /低脂/)
  assert.equal(byName['鳕鱼'].level, 'adjust')
  assert.match(byName['鳕鱼'].reason, /老年犬/)
  assert.match(result.adviceSummary, /需要调整/)
})

test('风险与食材建议优先消费出生日期派生阶段而不是冲突旧字段', () => {
  const adult = decoratedDog({
    name: '可乐',
    birthDate: '2022-07-18',
    ageStage: 'senior',
    dietGoal: 'daily',
    allergens: [],
    avoidIngredients: []
  })
  const runtimeConflict = { ...adult, ageStage: 'senior' }
  const recipe = {
    suitableAgeStages: ['adult'],
    ingredients: [
      { name: '鸡胸肉', category: 'meat', perMealAmountGram: 50 },
      { name: '南瓜', category: 'vegetable', perMealAmountGram: 25 },
      { name: '熟米饭', category: 'carb', perMealAmountGram: 25 }
    ]
  }

  assert.equal(adult.lifeStage.legacyAgeStage, 'adult')
  assert.equal(risk.checkRisk(recipe, runtimeConflict).length, 0)

  const [advice] = ingredientAdvice.buildAdviceForDog(recipe, runtimeConflict)
  assert.equal(advice.level, 'ok')
  assert.doesNotMatch(advice.reason, /老年犬/)
})
