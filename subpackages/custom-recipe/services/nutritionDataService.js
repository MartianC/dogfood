const nutritionAssessmentService = require('./nutritionAssessmentService')

// 小程序端云数据库单次查询最多返回 20 条。
const PAGE_SIZE = 20
let standardsCache = null

function canUseCloudDatabase() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.database === 'function'
}

async function readAll(query) {
  const result = []
  let offset = 0
  while (true) {
    const page = await query.skip(offset).limit(PAGE_SIZE).get()
    const items = Array.isArray(page.data) ? page.data : []
    result.push(...items)
    if (items.length < PAGE_SIZE) return result
    offset += items.length
  }
}

async function loadStandards(database) {
  if (standardsCache) return standardsCache
  const standards = await readAll(database.collection('pet_nutrition_standards'))
  standardsCache = standards.filter((item) => (
    item.standard_code === 'GB/T 31216-2014'
    || item.standard_code === 'FEDIAF Nutritional Guidelines 2025'
  ))
  return standardsCache
}

async function loadFoodNutrients(database, foodIds) {
  if (!foodIds.length) return []
  const command = database.command
  return readAll(database.collection('food_nutrients').where({
    food_id: command.in(foodIds)
  }))
}

async function loadNutritionData(ingredients = []) {
  if (!canUseCloudDatabase()) throw new Error('当前无法读取营养数据库')
  const foodIds = [...new Set(ingredients.map((item) => String(item.ingredientId || item.id || '')).filter(Boolean))]
  const database = wx.cloud.database()
  const [standards, nutrientRecords] = await Promise.all([
    loadStandards(database),
    loadFoodNutrients(database, foodIds)
  ])
  if (standards.length < 2) throw new Error('营养标准数据不完整')
  return { standards, nutrientRecords }
}

async function loadAssessment({ ingredients, dog, profileOverrides }) {
  const data = await loadNutritionData(ingredients)
  return nutritionAssessmentService.buildAssessment({
    ingredients,
    dog,
    profileOverrides,
    ...data
  })
}

function clearCache() {
  standardsCache = null
}

module.exports = {
  loadNutritionData,
  loadAssessment,
  clearCache,
  readAll
}
