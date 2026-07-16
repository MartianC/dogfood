const test = require('node:test')
const assert = require('node:assert/strict')

const nutritionAssessmentService = require('../subpackages/custom-recipe/services/nutritionAssessmentService')

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

test('按食谱干物质密度独立评估国标与 FEDIAF', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 2 },
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
  assert.deepEqual(assessment.counts, { adjust: 2, met: 1, unavailable: 0 })
})

test('偏高项列出贡献最高的食材来源', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'low', dailyMeals: 2 },
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
    standards,
    nutrientRecords: nutrientRecords.filter((item) => !(item.food_id === 'food_b' && item.nutrient_code === 'water'))
  })

  assert.equal(assessment.available, false)
  assert.equal(assessment.status, 'unavailable')
  assert.match(assessment.primaryAdvice, /水分数据/)
  assert.deepEqual(assessment.missingIngredients.map((item) => item.name), ['食材 B'])
})

test('手动 profile 只覆盖当前标准的自动选择', () => {
  const customStandards = standards.map((standard) => standard.authority !== 'GB/T' ? standard : ({
    ...standard,
    profiles: standard.profiles.concat({
      profile_code: 'growth_gestation_lactation',
      profile_name: '幼年犬粮、妊娠期犬粮、哺乳期犬粮',
      life_stage: 'growth_gestation_lactation',
      requirements: standard.profiles[0].requirements
    })
  }))

  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    standards: customStandards,
    nutrientRecords,
    profileOverrides: { gb: 'growth_gestation_lactation' }
  })

  assert.equal(assessment.standards[0].profileCode, 'growth_gestation_lactation')
  assert.equal(assessment.standards[0].profileSelection, 'manual')
  assert.equal(assessment.standards[1].profileCode, 'fediaf_2025_dog_adult_mer_95')
})

test('真实 USDA nutrient id 映射到标准营养元素代码', () => {
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1087 }), 'calcium')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1214 }), 'lysine')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1110, unit_name: 'IU' }), 'vitamin_d')
  assert.equal(nutritionAssessmentService.nutrientCodeOf({ nutrient_id: 1114, unit_name: 'UG' }), 'vitamin_d')
})
