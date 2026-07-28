const test = require('node:test')
const assert = require('node:assert/strict')

const {
  evaluateSharedMealDogEligibility
} = require('../services/sharedMealDogEligibility')

const eligibleDog = {
  id: 'dog-1',
  name: '布丁',
  birthDate: '2020-01-01',
  breed: 'shiba-inu',
  weightKg: 10,
  dailyMeals: 2,
  dailyActivityHours: 1.5,
  bodyCondition: 'ideal',
  specialNutritionNeeds: {
    hasDisease: false,
    reproductiveStatus: 'none',
    therapeuticWeightManagement: 'none'
  }
}

test('疾病、生殖状态和治疗性体重管理逐项阻断共享本餐', () => {
  const cases = [
    [{ hasDisease: true }, 'diagnosed_disease'],
    [{ reproductiveStatus: 'pregnant' }, 'pregnant'],
    [{ reproductiveStatus: 'lactating' }, 'lactating'],
    [{ therapeuticWeightManagement: 'loss' }, 'therapeutic_weight_loss'],
    [{ therapeuticWeightManagement: 'gain' }, 'therapeutic_weight_gain']
  ]

  cases.forEach(([override, reasonCode]) => {
    const result = evaluateSharedMealDogEligibility({
      ...eligibleDog,
      specialNutritionNeeds: {
        ...eligibleDog.specialNutritionNeeds,
        ...override
      }
    }, { today: '2026-07-27' })
    assert.equal(result.status, 'blocked')
    assert.ok(result.reasonCodes.includes(reasonCode))
  })
})

test('8 周以下阻断共享本餐', () => {
  const result = evaluateSharedMealDogEligibility({
    ...eligibleDog,
    birthDate: '2026-07-01'
  }, { today: '2026-07-27' })

  assert.equal(result.status, 'blocked')
  assert.deepEqual(result.reasonCodes, ['under_eight_weeks'])
})

test('任一计算必需字段或特殊状态未确认都判定 incomplete', () => {
  const cases = [
    ['birthDate', '', 'missing_birth_date'],
    ['breed', '', 'missing_breed'],
    ['weightKg', null, 'invalid_weight'],
    ['dailyMeals', null, 'invalid_daily_meals'],
    ['dailyActivityHours', null, 'missing_activity_duration'],
    ['bodyCondition', '', 'missing_body_condition']
  ]

  cases.forEach(([key, value, reasonCode]) => {
    const result = evaluateSharedMealDogEligibility({ ...eligibleDog, [key]: value }, {
      today: '2026-07-27'
    })
    assert.equal(result.status, 'incomplete')
    assert.ok(result.reasonCodes.includes(reasonCode))
  })

  ;[
    ['hasDisease', 'unconfirmed_disease_status'],
    ['reproductiveStatus', 'unconfirmed_reproductive_status'],
    ['therapeuticWeightManagement', 'unconfirmed_therapeutic_weight_management']
  ].forEach(([key, reasonCode]) => {
    const result = evaluateSharedMealDogEligibility({
      ...eligibleDog,
      specialNutritionNeeds: {
        ...eligibleDog.specialNutritionNeeds,
        [key]: null
      }
    }, { today: '2026-07-27' })
    assert.equal(result.status, 'incomplete')
    assert.ok(result.reasonCodes.includes(reasonCode))
  })
})

test('完整且满 8 周的普通档案 eligible，不从旧字段推断治疗需求', () => {
  const result = evaluateSharedMealDogEligibility({
    ...eligibleDog,
    bodyCondition: 'overweight',
    dietGoal: 'gainWeight',
    healthNotes: '曾经生病，咨询过减重'
  }, { today: '2026-07-27' })

  assert.deepEqual(result, { status: 'eligible', reasonCodes: [] })
})

test('非法或损坏的特殊营养需求失败关闭，不得判定 eligible', () => {
  const invalidNeeds = [
    {
      hasDisease: 'false',
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'none'
    },
    {
      hasDisease: false,
      reproductiveStatus: 'unknown',
      therapeuticWeightManagement: 'none'
    },
    {
      hasDisease: false,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'daily'
    }
  ]

  invalidNeeds.forEach((specialNutritionNeeds) => {
    const result = evaluateSharedMealDogEligibility({
      ...eligibleDog,
      specialNutritionNeeds
    }, { today: '2026-07-27' })

    assert.equal(result.status, 'incomplete')
    assert.deepEqual(result.reasonCodes, ['invalid_special_nutrition_needs'])
  })
})
