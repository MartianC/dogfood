const test = require('node:test')
const assert = require('node:assert/strict')
const mealAssessmentService = require('../subpackages/custom-recipe/services/mealAssessmentService')
const nutritionDataService = require('../subpackages/custom-recipe/services/nutritionDataService')

function runtimeReleaseQuery(condition) {
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

function buildStandards() {
  const gbRequirement = {
    pet_nutrient_code: 'protein',
    name_zh: '蛋白质',
    category: 'proximate',
    requirement_type: 'min',
    value: 10,
    unit: '%',
    basis: 'dry_matter'
  }
  const fediafRequirement = (value) => ({
    pet_nutrient_code: 'protein',
    name_zh: '蛋白质',
    category: 'proximate',
    requirement_type: 'min',
    value,
    unit: 'g',
    basis: 'dry_matter'
  })
  return [
    {
      standard_code: 'GB/T 31216-2014',
      authority: 'GB/T',
      profiles: [
        {
          profile_code: 'adult',
          profile_name: '成年犬粮',
          requirements: [gbRequirement]
        },
        {
          profile_code: 'growth_gestation_lactation',
          profile_name: '幼年犬粮、妊娠期犬粮、哺乳期犬粮',
          requirements: [gbRequirement]
        }
      ]
    },
    {
      standard_code: 'FEDIAF Nutritional Guidelines 2025',
      authority: 'FEDIAF',
      profiles: [
        {
          profile_code: 'fediaf_2025_dog_adult_mer_95',
          profile_name: '成年犬完整食品（MER 95）',
          requirements: [fediafRequirement(50)]
        },
        {
          profile_code: 'fediaf_2025_dog_adult_mer_110',
          profile_name: '成年犬完整食品（MER 110）',
          requirements: [fediafRequirement(10)]
        },
        {
          profile_code: 'fediaf_2025_dog_late_growth',
          profile_name: '幼犬晚期生长',
          requirements: [fediafRequirement(10)]
        }
      ]
    }
  ]
}

function adultNutrients({ energy = 310, water = 50, protein = 20 } = {}) {
  return [
    { food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: energy },
    { food_id: 'food_a', nutrient_id: 1051, unit_name: 'G', amount: water },
    { food_id: 'food_a', nutrient_id: 1003, unit_name: 'G', amount: protein }
  ]
}

function adultInput(overrides = {}) {
  return {
    ingredients: [{ ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 100 }],
    dog: {
      id: 'dog_1',
      name: '布丁',
      birthDate: '2023-01-01',
      weightKg: 10,
      dailyMeals: 2,
      dailyActivityHours: 1.5,
      activityLevel: 'low',
      bodyCondition: 'ideal'
    },
    standards: buildStandards(),
    nutrientRecords: adultNutrients(),
    today: '2026-07-19',
    ...overrides
  }
}

test('两轴成功时使用时长派生活动口径且不生成总体状态', () => {
  const result = mealAssessmentService.buildMealAssessment(adultInput())

  assert.equal(result.lifeStage.energyStage, 'adult')
  assert.equal(result.energy.available, true)
  assert.equal(result.energy.status, 'near_target')
  assert.equal(result.energy.statusLabel, '能量接近估算目标')
  assert.equal(result.energy.currentKcal, 310)
  assert.equal(result.energy.scaleSuggestion.available, false)
  assert.equal(result.nutritionDensity.available, true)
  assert.equal(result.nutritionDensity.status, 'suitable')
  assert.equal(
    result.nutritionDensity.standards[1].profileCode,
    'fediaf_2025_dog_adult_mer_110'
  )
  assert.equal(result.contextText, '布丁 · 成年犬 · 日均 1.5 小时 · 每日 2 餐')
  assert.equal(result.basisText, '本餐按每日餐数等额分配；不包含零食及其他额外喂食')
  assert.equal(Object.hasOwn(result, 'overallStatus'), false)
})

test('能量偏少但营养密度合适时两轴保留各自结论', () => {
  const result = mealAssessmentService.buildMealAssessment(adultInput({
    nutrientRecords: adultNutrients({ energy: 200 })
  }))

  assert.equal(result.energy.status, 'below_target')
  assert.equal(result.energy.statusLabel, '能量低于估算目标')
  assert.equal(result.energy.scaleSuggestion.available, true)
  assert.deepEqual(result.energy.scaleSuggestion.targetRange, result.energy.mealTarget)
  assert.equal(result.nutritionDensity.status, 'suitable')
  assert.equal(Object.hasOwn(result, 'overallStatus'), false)
})

test('高活动 C05 保留目标范围且直接按范围判断', () => {
  const input = adultInput({ nutrientRecords: adultNutrients({ energy: 450 }) })
  const result = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: {
      ...input.dog,
      dailyActivityHours: 3.5,
      activityLevel: 'low'
    }
  })

  assert.ok(result.energy.mealTarget.max > result.energy.mealTarget.min)
  assert.equal(result.energy.status, 'near_target')
  assert.equal(result.energy.scaleSuggestion.available, false)
  assert.equal(
    result.nutritionDensity.standards[1].profileCode,
    'fediaf_2025_dog_adult_mer_110'
  )
})

test('能量接近目标但营养密度需调整时不生成份量建议', () => {
  const result = mealAssessmentService.buildMealAssessment(adultInput({
    nutrientRecords: adultNutrients({ protein: 2 })
  }))

  assert.equal(result.energy.status, 'near_target')
  assert.equal(result.energy.scaleSuggestion.available, false)
  assert.equal(result.nutritionDensity.available, true)
  assert.equal(result.nutritionDensity.status, 'needs_adjustment')
})

test('食材能量缺失时营养密度仍可独立成功', () => {
  const nutrientRecords = adultNutrients().filter((record) => record.nutrient_id !== 1008)
  const result = mealAssessmentService.buildMealAssessment(adultInput({ nutrientRecords }))

  assert.equal(result.energy.available, false)
  assert.equal(result.energy.status, 'unavailable')
  assert.equal(result.energy.statusLabel, '暂无法判断本餐份量')
  assert.equal(result.energy.currentKcal, null)
  assert.equal(result.energy.knownKcal, 0)
  assert.deepEqual(result.energy.missingIngredients, [
    { id: 'food_a', name: '鸡胸肉', reason: '缺少能量和完整宏量营养数据' }
  ])
  assert.equal(result.nutritionDensity.available, true)
})

test('水分数据缺失导致密度失败时能量结论仍保留', () => {
  const nutrientRecords = adultNutrients().filter((record) => record.nutrient_id !== 1051)
  const result = mealAssessmentService.buildMealAssessment(adultInput({ nutrientRecords }))

  assert.equal(result.energy.available, true)
  assert.equal(result.energy.status, 'near_target')
  assert.equal(result.energy.currentKcal, 310)
  assert.equal(result.nutritionDensity.available, false)
  assert.equal(
    result.nutritionDensity.primaryAdvice,
    '部分食材缺少水分数据，暂时无法按干物质完成评估'
  )
})

test('营养标准加载失败时能量结论不受阻断', () => {
  const result = mealAssessmentService.buildMealAssessment(adultInput({
    dataErrors: { standards: new Error('标准加载失败'), nutrients: null }
  }))

  assert.equal(result.energy.available, true)
  assert.equal(result.energy.status, 'near_target')
  assert.equal(result.nutritionDensity.available, false)
  assert.equal(result.nutritionDensity.primaryAdvice, '营养标准数据不完整')
})

test('幼犬品种估重不可用时只降级能量轴', () => {
  const input = adultInput()
  const result = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: {
      ...input.dog,
      birthDate: '2026-01-01',
      weightKg: 8,
      breed: 'mixed_unknown',
      expectedAdultWeightKg: null,
      adultWeightEstimateReason: 'breed_estimate_unavailable'
    }
  })

  assert.equal(result.lifeStage.available, true)
  assert.equal(result.lifeStage.nutritionStage, 'late_growth')
  assert.equal(result.energy.available, false)
  assert.equal(result.energy.status, 'unavailable')
  assert.equal(result.energy.reason, 'breed_estimate_unavailable')
  assert.equal(result.energy.mealTarget, null)
  assert.equal(result.nutritionDensity.available, true)
  assert.equal(result.nutritionDensity.standards[0].profileCode, 'growth_gestation_lactation')
  assert.equal(result.nutritionDensity.standards[1].profileCode, 'fediaf_2025_dog_late_growth')
})

test('旧档案缺少活动时长时不会在评估上下文伪装成 0 小时', () => {
  const input = adultInput()
  const result = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: {
      ...input.dog,
      dailyActivityHours: null,
      activityLevel: 'normal'
    }
  })

  assert.equal(result.energy.available, true)
  assert.equal(result.contextText, '布丁 · 成年犬 · 活动时长待完善 · 每日 2 餐')
})

test('出生日期缺失时 C09A 两轴均不可用且保留明确原因', () => {
  const input = adultInput()
  const result = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: { ...input.dog, birthDate: '' }
  })

  assert.equal(result.lifeStage.available, false)
  assert.equal(result.lifeStage.reason, 'invalid_birth_date')
  assert.equal(result.energy.available, false)
  assert.equal(result.energy.status, 'unavailable')
  assert.equal(result.nutritionDensity.available, false)
  assert.equal(result.nutritionDensity.primaryAdvice, '请完善出生日期后开始营养密度评估')
  assert.equal(Object.hasOwn(result, 'overallStatus'), false)
})

test('小于 8 周时跳过两轴计算并返回专业咨询口径', () => {
  const input = adultInput()
  const result = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: {
      ...input.dog,
      birthDate: '2026-07-01',
      bodyCondition: 'thin'
    }
  })

  assert.equal(result.lifeStage.reason, 'under_minimum_age')
  assert.deepEqual(result.energy, {
    available: false,
    reason: 'under_minimum_age',
    status: 'unavailable',
    statusLabel: '暂无法判断本餐份量',
    currentKcal: null,
    knownKcal: 0,
    mealTarget: null,
    dailyTarget: null,
    provisional: false,
    missingIngredients: [],
    scaleSuggestion: { available: false },
    bodyConditionNote: ''
  })
  assert.equal(result.nutritionDensity.available, false)
  assert.equal(result.contextText, '布丁 · 幼龄犬')
  assert.equal(result.basisText, '小于 8 周暂不自动评估，请咨询兽医或宠物营养专业人士')
})

test('手动营养 profile 保持优先且不改变能量活动系数', () => {
  const automatic = mealAssessmentService.buildMealAssessment(adultInput())
  const manual = mealAssessmentService.buildMealAssessment(adultInput({
    profileOverrides: { fediaf: 'fediaf_2025_dog_adult_mer_95' }
  }))

  assert.equal(manual.nutritionDensity.standards[1].profileCode, 'fediaf_2025_dog_adult_mer_95')
  assert.equal(manual.nutritionDensity.standards[1].profileSelection, 'manual')
  assert.deepEqual(manual.energy.dailyTarget, automatic.energy.dailyTarget)
})

test('偏瘦体况只生成校正提示而不修改能量目标', () => {
  const ideal = mealAssessmentService.buildMealAssessment(adultInput())
  const input = adultInput()
  const thin = mealAssessmentService.buildMealAssessment({
    ...input,
    dog: { ...input.dog, bodyCondition: 'thin' }
  })

  assert.equal(thin.energy.bodyConditionNote, '当前体况偏瘦，请结合体重变化和专业建议校正份量')
  assert.deepEqual(thin.energy.dailyTarget, ideal.energy.dailyTarget)
})

test('标准查询失败时仍返回已成功读取的食材营养记录', async () => {
  const originalWx = global.wx
  const standardsError = new Error('标准查询失败')
  const nutritionProfiles = [{
    food_id: 'food_a',
    fdc_id: 1,
    nutrients: {
      1008: { name: 'Energy', unit: 'KCAL', amount: 310, value_status: 'known' }
    }
  }]
  const nutrientRecords = [{
    food_id: 'food_a',
    fdc_id: 1,
    nutrient_id: 1008,
    name: 'Energy',
    unit_name: 'KCAL',
    amount: 310
  }]
  nutritionDataService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: { in: (values) => values },
          collection(name) {
            if (name === 'data_releases') {
              return { where: (condition) => runtimeReleaseQuery(condition) }
            }
            if (name === 'pet_nutrition_standards') {
              return {
                skip() { return this },
                limit() { return this },
                async get() { throw standardsError }
              }
            }
            return {
              where() {
                return {
                  skip() { return this },
                  limit() { return this },
                  async get() { return { data: nutritionProfiles } }
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    const result = await nutritionDataService.loadMealAssessmentData([
      { ingredientId: 'food_a', perMealAmountGram: 100 }
    ])
    assert.deepEqual(result.standards, [])
    assert.deepEqual(result.nutrientRecords, nutrientRecords)
    assert.equal(result.dataErrors.standards, standardsError)
    assert.equal(result.dataErrors.nutrients, null)
  } finally {
    global.wx = originalWx
    nutritionDataService.clearCache()
  }
})

test('食材营养查询失败时仍返回已成功读取的标准', async () => {
  const originalWx = global.wx
  const standards = buildStandards()
  const nutrientsError = new Error('食材营养查询失败')
  nutritionDataService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: { in: (values) => values },
          collection(name) {
            if (name === 'data_releases') {
              return { where: (condition) => runtimeReleaseQuery(condition) }
            }
            if (name === 'pet_nutrition_standards') {
              return {
                skip() { return this },
                limit() { return this },
                async get() { return { data: standards } }
              }
            }
            return {
              where() {
                return {
                  skip() { return this },
                  limit() { return this },
                  async get() { throw nutrientsError }
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    const result = await nutritionDataService.loadMealAssessmentData([
      { ingredientId: 'food_a', perMealAmountGram: 100 }
    ])
    assert.deepEqual(result.standards, standards)
    assert.deepEqual(result.nutrientRecords, [])
    assert.equal(result.dataErrors.standards, null)
    assert.equal(result.dataErrors.nutrients, nutrientsError)
  } finally {
    global.wx = originalWx
    nutritionDataService.clearCache()
  }
})

test('标准使用缓存且每次食材查询只发送去重后的 ID', async () => {
  const originalWx = global.wx
  const standards = buildStandards()
  let standardsReads = 0
  const foodIdBatches = []
  const collectionNames = []
  nutritionDataService.clearCache()
  global.wx = {
    cloud: {
      database() {
        return {
          command: {
            in(values) {
              foodIdBatches.push(values)
              return values
            }
          },
          collection(name) {
            collectionNames.push(name)
            if (name === 'data_releases') {
              return { where: (condition) => runtimeReleaseQuery(condition) }
            }
            if (name === 'pet_nutrition_standards') {
              return {
                skip() { return this },
                limit() { return this },
                async get() {
                  standardsReads += 1
                  return { data: standards }
                }
              }
            }
            return {
              where() {
                return {
                  skip() { return this },
                  limit() { return this },
                  async get() { return { data: [] } }
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    await nutritionDataService.loadMealAssessmentData([
      { ingredientId: 'food_a' },
      { ingredientId: 'food_a' }
    ])
    await nutritionDataService.loadMealAssessmentData([{ ingredientId: 'food_b' }])

    assert.equal(standardsReads, 1)
    assert.deepEqual(foodIdBatches, [['food_a'], ['food_b']])
    assert.equal(collectionNames.includes('food_nutrition_profiles'), true)
    assert.equal(collectionNames.includes('food_nutrients'), false)
  } finally {
    global.wx = originalWx
    nutritionDataService.clearCache()
  }
})
