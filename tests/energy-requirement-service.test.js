const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../subpackages/custom-recipe/services/energyRequirementService')
const sharedMealService = require('../subpackages/shared-meal/services/energyRequirementService')

test('两个分包的生成实现保持行为一致且模块状态隔离', () => {
  assert.notEqual(sharedMealService, service)
  assert.deepEqual(sharedMealService.ACTIVITY_FACTORS, service.ACTIVITY_FACTORS)
  const input = {
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 1.5 },
    lifeStage: { available: true, energyStage: 'adult' }
  }
  assert.deepEqual(
    sharedMealService.calculateEnergyRequirement(input),
    service.calculateEnergyRequirement(input)
  )
})

test('幼犬按品种估算的成年体重计算每日和本餐目标', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 8, expectedAdultWeightKg: 10.5, dailyMeals: 2 },
    lifeStage: { available: true, energyStage: 'puppy' }
  })
  const expectedDaily = (254.1 - 135 * (8 / 10.5)) * Math.pow(8, 0.75)

  assert.equal(result.available, true)
  assert.ok(Math.abs(result.dailyTarget.min - expectedDaily) < 0.01)
  assert.ok(Math.abs(result.dailyTarget.max - expectedDaily) < 0.01)
  assert.ok(Math.abs(result.mealTarget.min - expectedDaily / 2) < 0.01)
  assert.ok(Math.abs(result.mealTarget.max - expectedDaily / 2) < 0.01)
  assert.deepEqual(result.factorRange, {
    min: 254.1 - 135 * (8 / 10.5),
    max: 254.1 - 135 * (8 / 10.5)
  })
  assert.equal(result.provisional, false)
  assert.equal(result.basisCode, 'fediaf_growth')
})

test('成年犬按日均活动时长派生固定活动系数', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 1.5, activityLevel: 'high' },
    lifeStage: { available: true, energyStage: 'adult' }
  })
  const expectedDaily = 110 * Math.pow(10, 0.75)

  assert.equal(result.available, true)
  assert.deepEqual(result.factorRange, { min: 110, max: 110 })
  assert.ok(Math.abs(result.dailyTarget.min - expectedDaily) < 0.01)
  assert.ok(Math.abs(result.mealTarget.min - expectedDaily / 2) < 0.01)
  assert.equal(result.provisional, false)
  assert.equal(result.basisCode, 'fediaf_activity_duration')
})

test('生命周期不可用时透传稳定原因且不产生目标数值', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2 },
    lifeStage: { available: false, reason: 'under_eight_weeks' }
  })

  assert.deepEqual(result, {
    available: false,
    reason: 'under_eight_weeks',
    dailyTarget: null,
    mealTarget: null,
    factorRange: null,
    provisional: false,
    basisCode: ''
  })
})

test('体重无效时能量需求不可用', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 'not-a-number', dailyMeals: 2, dailyActivityHours: 1 },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'invalid_weight')
  assert.equal(result.dailyTarget, null)
})

test('每日餐数无效时能量需求不可用', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 0, dailyActivityHours: 1 },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'invalid_daily_meals')
  assert.equal(result.mealTarget, null)
})

test('幼犬缺少品种成年体重估算时只降级能量需求', () => {
  const result = service.calculateEnergyRequirement({
    dog: {
      weightKg: 8,
      dailyMeals: 2,
      expectedAdultWeightKg: null,
      adultWeightEstimateReason: 'breed_estimate_unavailable'
    },
    lifeStage: { available: true, energyStage: 'puppy' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'breed_estimate_unavailable')
  assert.equal(result.dailyTarget, null)
})

test('幼犬当前体重超过品种成年体重估算时要求复核', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 12, dailyMeals: 2, expectedAdultWeightKg: 10.5 },
    lifeStage: { available: true, energyStage: 'puppy' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'breed_estimate_inconsistent')
  assert.equal(result.factorRange, null)
})

test('旧档案只有 normal 活动值时临时沿用兼容系数', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, activityLevel: 'normal' },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, true)
  assert.deepEqual(result.factorRange, { min: 110, max: 110 })
  assert.equal(result.provisional, false)
  assert.equal(result.basisCode, 'fediaf_activity_legacy')
})

test('成年犬缺少时长和兼容活动值时使用临时默认系数', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2 },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, true)
  assert.deepEqual(result.factorRange, { min: 110, max: 110 })
  assert.equal(result.provisional, true)
  assert.equal(result.basisCode, 'fediaf_age_default')
})

test('时长字段存在但超出 Slider 范围时不回退旧活动值', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 6.5, activityLevel: 'high' },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'invalid_activity_duration')
  assert.equal(result.factorRange, null)
})

test('时长不是 Slider 的 0.5 小时步进时不可用于计算', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 1.25 },
    lifeStage: { available: true, energyStage: 'adult' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'invalid_activity_duration')
})

test('Slider 边界值稳定派生四档活动系数', () => {
  const cases = [
    [0, { min: 95, max: 95 }],
    [0.5, { min: 95, max: 95 }],
    [1, { min: 110, max: 110 }],
    [1.5, { min: 110, max: 110 }],
    [2, { min: 125, max: 125 }],
    [2.5, { min: 125, max: 125 }],
    [3, { min: 150, max: 175 }],
    [6, { min: 150, max: 175 }]
  ]

  cases.forEach(([dailyActivityHours, factorRange]) => {
    const result = service.calculateEnergyRequirement({
      dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours },
      lifeStage: { available: true, energyStage: 'adult' }
    })
    assert.deepEqual(result.factorRange, factorRange, `${dailyActivityHours} 小时的系数错误`)
  })
})

test('高活动老年犬保留活动目标范围', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 3.5 },
    lifeStage: { available: true, energyStage: 'senior' }
  })

  assert.deepEqual(result.factorRange, { min: 150, max: 175 })
  assert.ok(result.dailyTarget.max > result.dailyTarget.min)
  assert.ok(result.mealTarget.max > result.mealTarget.min)
  assert.equal(result.provisional, false)
})

test('老年犬缺少活动数据时使用 95 临时默认系数', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2 },
    lifeStage: { available: true, energyStage: 'senior' }
  })

  assert.deepEqual(result.factorRange, { min: 95, max: 95 })
  assert.equal(result.provisional, true)
  assert.equal(result.basisCode, 'fediaf_age_default')
})

test('未知能量生命周期不静默套用成年犬公式', () => {
  const result = service.calculateEnergyRequirement({
    dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 1 },
    lifeStage: { available: true, energyStage: 'unknown' }
  })

  assert.equal(result.available, false)
  assert.equal(result.reason, 'unsupported_energy_stage')
})
