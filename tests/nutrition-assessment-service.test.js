const test = require('node:test')
const assert = require('node:assert/strict')

const nutritionAssessmentService = require('../subpackages/custom-recipe/services/nutritionAssessmentService')
const nutritionDataService = require('../subpackages/custom-recipe/services/nutritionDataService')
const fediafSeed = require('../data/pet-nutrition-standards/fediaf-2025-dog.json')
const fediafStandard = {
  ...fediafSeed.standard,
  profiles: fediafSeed.profiles.map((profile) => ({
    ...profile,
    requirements: profile.requirements.map((requirement) => ({
      ...requirement,
      pet_nutrient_code: requirement.nutrient_code
    }))
  }))
}

const standards = [
  {
    standard_code: 'GB/T 31216-2014',
    authority: 'GB/T',
    profiles: [
      {
        profile_code: 'adult',
        profile_name: '成年犬粮',
        life_stage: 'adult',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 18, unit: '%', basis: 'dry_matter' },
          { pet_nutrient_code: 'calcium', name_zh: '钙', category: 'mineral', requirement_type: 'max', value: 0.8, unit: '%', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.5, unit: '%', basis: 'dry_matter' }
        ]
      },
      {
        profile_code: 'growth_gestation_lactation',
        profile_name: '幼年犬粮、妊娠期犬粮、哺乳期犬粮',
        life_stage: 'growth_gestation_lactation',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 18, unit: '%', basis: 'dry_matter' },
          { pet_nutrient_code: 'calcium', name_zh: '钙', category: 'mineral', requirement_type: 'max', value: 0.8, unit: '%', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.5, unit: '%', basis: 'dry_matter' }
        ]
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
        life_stage: 'adult',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 21, unit: 'g', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.45, unit: 'g', basis: 'dry_matter' }
        ]
      },
      {
        profile_code: 'fediaf_2025_dog_adult_mer_110',
        profile_name: '成年犬完整食品（MER 110）',
        life_stage: 'adult',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 21, unit: 'g', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.45, unit: 'g', basis: 'dry_matter' }
        ]
      },
      {
        profile_code: 'fediaf_2025_dog_early_growth_reproduction',
        profile_name: '幼犬早期生长',
        life_stage: 'early_growth',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 21, unit: 'g', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.45, unit: 'g', basis: 'dry_matter' }
        ]
      },
      {
        profile_code: 'fediaf_2025_dog_late_growth',
        profile_name: '幼犬晚期生长',
        life_stage: 'late_growth',
        requirements: [
          { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 21, unit: 'g', basis: 'dry_matter' },
          { pet_nutrient_code: 'phosphorus', name_zh: '磷', category: 'mineral', requirement_type: 'min', value: 0.45, unit: 'g', basis: 'dry_matter' }
        ]
      }
    ]
  }
]

const ingredients = [
  { ingredientId: 'food_a', name: '食材 A', perMealAmountGram: 100 },
  { ingredientId: 'food_b', name: '食材 B', perMealAmountGram: 100 }
]

const nutrientRecords = [
  { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
  { food_id: 'food_a', nutrient_code: 'protein', unit_name: 'G', amount: 20 },
  { food_id: 'food_a', nutrient_code: 'calcium', unit_name: 'MG', amount: 500 },
  { food_id: 'food_a', nutrient_code: 'phosphorus', unit_name: 'MG', amount: 100 },
  { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 80 },
  { food_id: 'food_b', nutrient_code: 'protein', unit_name: 'G', amount: 10 },
  { food_id: 'food_b', nutrient_code: 'calcium', unit_name: 'MG', amount: 100 },
  { food_id: 'food_b', nutrient_code: 'phosphorus', unit_name: 'MG', amount: 100 }
]

const adultLifeStage = {
  available: true,
  nutritionStage: 'adult',
  energyStage: 'adult',
  label: '成年犬'
}

test('幼犬早期使用派生阶段选择国标生长档案和 FEDIAF 早期生长档案', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 2 },
    lifeStage: { available: true, nutritionStage: 'early_growth', energyStage: 'puppy', label: '幼犬早期' },
    standards,
    nutrientRecords
  })

  assert.equal(assessment.standards[0].profileCode, 'growth_gestation_lactation')
  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_early_growth_reproduction')
})

test('幼犬晚期使用派生阶段选择国标生长档案和 FEDIAF 晚期生长档案', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'senior', activityLevel: 'high', dailyMeals: 2 },
    lifeStage: { available: true, nutritionStage: 'late_growth', energyStage: 'puppy', label: '幼犬晚期' },
    standards,
    nutrientRecords
  })

  assert.equal(assessment.standards[0].profileCode, 'growth_gestation_lactation')
  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_late_growth')
})

test('成年犬和老年犬根据活动派生水平选择 FEDIAF MER 档案', () => {
  const cases = [
    {
      name: '低活动成年犬',
      dog: { ageStage: 'puppy', activityLevel: 'low' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'adult', label: '成年犬' },
      expected: 'fediaf_2025_dog_adult_mer_95'
    },
    {
      name: '一般活动成年犬',
      dog: { ageStage: 'senior', activityLevel: 'moderateLowImpact' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'adult', label: '成年犬' },
      expected: 'fediaf_2025_dog_adult_mer_110'
    },
    {
      name: '较多活动成年犬',
      dog: { ageStage: 'puppy', activityLevel: 'moderateHighImpact' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'adult', label: '成年犬' },
      expected: 'fediaf_2025_dog_adult_mer_110'
    },
    {
      name: '低活动老年犬',
      dog: { ageStage: 'puppy', activityLevel: 'low' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'senior', label: '老年犬' },
      expected: 'fediaf_2025_dog_adult_mer_95'
    },
    {
      name: '高活动老年犬',
      dog: { ageStage: 'adult', activityLevel: 'high' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'senior', label: '老年犬' },
      expected: 'fediaf_2025_dog_adult_mer_110'
    },
    {
      name: '缺少活动的成年犬',
      dog: { ageStage: 'senior' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'adult', label: '成年犬' },
      expected: 'fediaf_2025_dog_adult_mer_110'
    },
    {
      name: '缺少活动的老年犬',
      dog: { ageStage: 'adult' },
      lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'senior', label: '老年犬' },
      expected: 'fediaf_2025_dog_adult_mer_95'
    }
  ]

  cases.forEach((item) => {
    const assessment = nutritionAssessmentService.buildAssessment({
      ingredients,
      dog: { id: 'dog_1', name: '布丁', dailyMeals: 2, ...item.dog },
      lifeStage: item.lifeStage,
      standards,
      nutrientRecords
    })

    assert.equal(assessment.standards[0].profileCode, 'adult', item.name)
    assert.equal(assessment.standards[1].profileCode, item.expected, item.name)
    assert.equal(assessment.contextText, `布丁 · ${item.lifeStage.label} · 每日 2 餐`, item.name)
  })
})

test('缺少可用生命周期时不猜测营养标准阶段', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'puppy', activityLevel: 'low', dailyMeals: 2 },
    standards,
    nutrientRecords
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.primaryAdvice, '请完善出生日期后开始营养密度评估')
  assert.deepEqual(assessment.standards, [])
  assert.deepEqual(assessment.elements, [])
})

test('小于 8 周时不自动进行营养密度评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 4 },
    lifeStage: { available: false, reason: 'under_minimum_age', label: '幼犬' },
    standards,
    nutrientRecords
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.primaryAdvice, '小于 8 周暂不自动进行营养密度评估')
})

test('营养标准不完整时不生成空元素的基本合适结论', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'puppy', activityLevel: 'low', dailyMeals: 2 },
    lifeStage: { available: true, nutritionStage: 'adult', energyStage: 'adult', label: '成年犬' },
    standards: standards.slice(0, 1),
    nutrientRecords
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.primaryAdvice, '营养标准数据不完整')
  assert.deepEqual(assessment.elements, [])
  assert.equal(assessment.standards.length, 1)
})

test('标准缺少可用 profile 时营养密度评估明确降级', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', activityLevel: 'moderateLowImpact', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: [standards[0], { ...standards[1], profiles: [] }],
    nutrientRecords
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.primaryAdvice, '营养标准数据不完整')
  assert.deepEqual(assessment.elements, [])
  assert.equal(assessment.standards.length, 1)
})

test('幼犬目标 profile 缺失时不能静默改用成年犬 profile', () => {
  const adultOnlyFediaf = {
    ...standards[1],
    profiles: standards[1].profiles.filter((profile) => /adult_mer_110/.test(profile.profile_code))
  }
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 3 },
    lifeStage: { available: true, nutritionStage: 'early_growth', energyStage: 'puppy', label: '幼犬早期' },
    standards: [standards[0], adultOnlyFediaf],
    nutrientRecords
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.primaryAdvice, '营养标准数据不完整')
  assert.deepEqual(assessment.elements, [])
  assert.equal(assessment.standards.length, 1)
  assert.equal(assessment.standards[0].key, 'gb')
  assert.equal(assessment.standards[0].profile.profile_code, 'growth_gestation_lactation')
})

test('营养数据分页遵守小程序云数据库每页 20 条上限并读取全部记录', async () => {
  const records = Array.from({ length: 45 }, (_, index) => ({ id: index + 1 }))
  const query = {
    offset: 0,
    requestedLimit: 0,
    skip(offset) {
      this.offset = offset
      return this
    },
    limit(limit) {
      this.requestedLimit = limit
      return this
    },
    async get() {
      const actualLimit = Math.min(this.requestedLimit, 20)
      return { data: records.slice(this.offset, this.offset + actualLimit) }
    }
  }

  const result = await nutritionDataService.readAll(query)

  assert.equal(result.length, 45)
  assert.deepEqual(result, records)
})

test('大批量营养数据按受控并发分页读取', async () => {
  const records = Array.from({ length: 45 }, (_, index) => ({ id: index + 1 }))
  const calls = []
  const query = {
    count: async () => ({ total: records.length }),
    skip(offset) {
      return {
        limit(limit) {
          return {
            async get() {
              calls.push({ offset, limit })
              return { data: records.slice(offset, offset + limit) }
            }
          }
        }
      }
    }
  }

  const result = await nutritionDataService.readAllInParallel(query, 2)

  assert.deepEqual(result, records)
  assert.deepEqual(calls, [
    { offset: 0, limit: 20 },
    { offset: 20, limit: 20 },
    { offset: 40, limit: 20 }
  ])
})

test('按食谱干物质密度独立评估国标与 FEDIAF', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords
  })

  assert.equal(assessment.available, true)
  assert.equal(assessment.contextText, '布丁 · 成年犬 · 每日 2 餐')
  assert.equal(assessment.standards[0].profileCode, 'adult')
  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_adult_mer_95')

  const protein = assessment.elements.find((item) => item.code === 'protein')
  assert.equal(protein.currentValue, 42.86)
  assert.equal(protein.gb.status, 'met')
  assert.equal(protein.fediaf.status, 'met')

  const phosphorus = assessment.elements.find((item) => item.code === 'phosphorus')
  assert.equal(phosphorus.gb.status, 'low')
  assert.equal(phosphorus.fediaf.status, 'low')
  const phosphorusAdvice = assessment.standards[0].lowItems.find((item) => item.code === 'phosphorus')
  assert.equal(phosphorusAdvice.gapDisplayValue, 214)
  assert.equal(phosphorusAdvice.gapDisplayUnit, 'mg')
  assert.deepEqual(assessment.counts, { adjust: 2, met: 1, unavailable: 0 })
})

test('偏高项列出贡献最高的食材来源', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords
  })

  const calcium = assessment.standards[0].highItems.find((item) => item.code === 'calcium')
  assert.ok(calcium)
  assert.equal(calcium.contributors[0].ingredientName, '食材 A')
  assert.equal(calcium.contributors[0].percent, 83)
  assert.equal(calcium.contributors[1].ingredientName, '食材 B')
})

test('缺少任一食材水分数据时返回数据不足而不是按零计算', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords: nutrientRecords.filter((item) => !(item.food_id === 'food_b' && item.nutrient_code === 'water'))
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.status, 'unavailable')
  assert.match(assessment.primaryAdvice, /水分数据/)
  assert.deepEqual(assessment.missingIngredients.map((item) => item.name), ['食材 B'])
})

test('手动 profile 只覆盖当前标准的自动选择', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords,
    profileOverrides: { gb: 'growth_gestation_lactation' }
  })

  assert.equal(assessment.standards[0].profileCode, 'growth_gestation_lactation')
  assert.equal(assessment.standards[0].profileSelection, 'manual')
  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_adult_mer_110')
})

test('手动 profile override 不存在时继续使用自动推荐', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', activityLevel: 'moderateHighImpact', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords,
    profileOverrides: { fediaf: 'not_exists' }
  })

  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_adult_mer_110')
  assert.equal(assessment.standards[1].profileSelection, 'automatic')
})

test('真实 USDA nutrient id 映射到标准营养元素代码', () => {
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1087 }), 'calcium')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1214 }), 'lysine')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1110, unit_name: 'IU' }), 'vitamin_d')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1114, unit_name: 'UG' }), 'vitamin_d')
  assert.deepEqual(nutritionAssessmentService.nutrientIdsForCode('calcium'), [1087])
})

test('FEDIAF 未设置数值上限时不应把纯鸡胸肉的钠判定为超标', () => {
  const chickenProfile = {
    food_id: 'food_2646170',
    nutrients: {
      1051: { unit: 'G', amount: 74.78 },
      1093: { unit: 'MG', amount: 65.75 }
    }
  }
  const nutrientRecords = Object.entries(chickenProfile.nutrients).map(([nutrientId, nutrient]) => ({
    food_id: chickenProfile.food_id,
    nutrient_id: Number(nutrientId),
    unit_name: nutrient.unit,
    amount: nutrient.amount
  }))
  const gbStandard = {
    standard_code: 'GB/T 31216-2014',
    authority: 'GB/T',
    profiles: [{ profile_code: 'adult', profile_name: '成年犬粮', requirements: [] }]
  }

  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients: [{ ingredientId: chickenProfile.food_id, name: '鸡胸肉', perMealAmountGram: 292 }],
    dog: { id: 'dog_1', name: '布丁', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: [gbStandard, fediafStandard],
    nutrientRecords
  })
  const sodium = assessment.elements.find((item) => item.code === 'sodium')

  assert.equal(sodium.fediaf.currentValue, 0.26)
  assert.equal(sodium.fediaf.status, 'met')
  assert.equal(sodium.fediaf.requirementText, '≥ 0.1 g')
  assert.equal(assessment.standards[1].highItems.some((item) => item.code === 'sodium'), false)
})
