const test = require('node:test')
const assert = require('node:assert/strict')

const nutritionAssessmentService = require('../subpackages/custom-recipe/services/nutritionAssessmentService')

function standardsForRequirements(requirements) {
  return [
    {
      standard_code: 'GB/T 31216-2014',
      authority: 'GB/T',
      profiles: [{ profile_code: 'adult', profile_name: '成年犬粮', requirements }]
    },
    {
      standard_code: 'FEDIAF Nutritional Guidelines 2025',
      authority: 'FEDIAF',
      profiles: [{
        profile_code: 'fediaf_2025_dog_adult_mer_110',
        profile_name: '成年犬完整食品（MER 110）',
        requirements
      }]
    }
  ]
}

const standards = standardsForRequirements([
  { pet_nutrient_code: 'protein', name_zh: '蛋白质', category: 'proximate', requirement_type: 'min', value: 25, unit: '%', basis: 'dry_matter' },
  { pet_nutrient_code: 'calcium', name_zh: '钙', category: 'mineral', requirement_type: 'min', value: 0.5, unit: '%', basis: 'dry_matter' }
])

const adultLifeStage = {
  available: true,
  nutritionStage: 'adult',
  energyStage: 'adult',
  label: '成年犬'
}

const ingredients = [
  { ingredientId: 'food_a', name: '食材 A', perMealAmountGram: 100 },
  { ingredientId: 'food_b', name: '食材 B', perMealAmountGram: 100 }
]

test('缺失的普通营养元素记录按 0 含量参与评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards,
    nutrientRecords: [
      { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_a', nutrient_code: 'protein', unit_name: 'G', amount: 20 }
    ]
  })

  const protein = assessment.elements.find((item) => item.code === 'protein')
  const calcium = assessment.elements.find((item) => item.code === 'calcium')

  assert.equal(assessment.available, true)
  assert.equal(protein.currentValue, 20)
  assert.equal(protein.gb.status, 'low')
  assert.equal(calcium.currentValue, 0)
  assert.equal(calcium.gb.status, 'low')
  assert.deepEqual(assessment.counts, { adjust: 2, met: 0, unavailable: 0 })
})

test('营养元素记录存在但单位无法换算时仍标记为无法评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: standardsForRequirements([
      { pet_nutrient_code: 'vitamin_e', name_zh: '维生素 E', category: 'vitamin', requirement_type: 'min', value: 5, unit: 'IU', basis: 'dry_matter' }
    ]),
    nutrientRecords: [
      { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_a', nutrient_code: 'vitamin_e', unit_name: 'MG', amount: 10 }
    ]
  })

  const vitaminE = assessment.elements.find((item) => item.code === 'vitamin_e')

  assert.equal(vitaminE.currentValue, null)
  assert.equal(vitaminE.gb.status, 'unavailable')
  assert.deepEqual(assessment.counts, { adjust: 0, met: 0, unavailable: 1 })
})

test('营养元素记录存在但数值无效时仍标记为无法评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: standardsForRequirements([standards[0].profiles[0].requirements[0]]),
    nutrientRecords: [
      { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_a', nutrient_code: 'protein', unit_name: 'G', amount: null }
    ]
  })

  const protein = assessment.elements.find((item) => item.code === 'protein')

  assert.equal(protein.currentValue, null)
  assert.equal(protein.gb.status, 'unavailable')
  assert.deepEqual(assessment.counts, { adjust: 0, met: 0, unavailable: 1 })
})

test('组合营养指标缺少直接记录时仍标记为无法评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: standardsForRequirements([
      { pet_nutrient_code: 'epa_plus_dha_omega_3', name_zh: 'EPA+DHA', category: 'fatty_acid', requirement_type: 'min', value: 0.05, unit: 'g', basis: 'dry_matter' }
    ]),
    nutrientRecords: [
      { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_a', nutrient_code: 'epa', unit_name: 'G', amount: 0.02 },
      { food_id: 'food_a', nutrient_code: 'dha', unit_name: 'G', amount: 0.03 }
    ]
  })

  const epaAndDha = assessment.elements.find((item) => item.code === 'epa_plus_dha_omega_3')

  assert.equal(epaAndDha.currentValue, null)
  assert.equal(epaAndDha.gb.status, 'unavailable')
  assert.deepEqual(assessment.counts, { adjust: 0, met: 0, unavailable: 1 })
})

test('条件化营养要求缺少同名记录时仍标记为无法评估', () => {
  const assessment = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: { id: 'dog_1', name: '布丁', ageStage: 'adult', activityLevel: 'normal', dailyMeals: 2 },
    lifeStage: adultLifeStage,
    standards: standardsForRequirements([
      { pet_nutrient_code: 'selenium_wet_diets', name_zh: '硒（湿粮）', category: 'mineral', nutrient_kind: 'atomic', requirement_type: 'min', value: 20, unit: 'µg', basis: 'dry_matter' },
      { pet_nutrient_code: 'selenium_dry_diets', name_zh: '硒（干粮）', category: 'mineral', nutrient_kind: 'atomic', requirement_type: 'min', value: 30, unit: 'µg', basis: 'dry_matter' }
    ]),
    nutrientRecords: [
      { food_id: 'food_a', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_b', nutrient_code: 'water', unit_name: 'G', amount: 50 },
      { food_id: 'food_a', nutrient_code: 'selenium', unit_name: 'UG', amount: 100 }
    ]
  })

  const wetDietSelenium = assessment.elements.find((item) => item.code === 'selenium_wet_diets')
  const dryDietSelenium = assessment.elements.find((item) => item.code === 'selenium_dry_diets')

  assert.equal(wetDietSelenium.gb.status, 'unavailable')
  assert.equal(dryDietSelenium.gb.status, 'unavailable')
  assert.deepEqual(assessment.counts, { adjust: 0, met: 0, unavailable: 2 })
})
