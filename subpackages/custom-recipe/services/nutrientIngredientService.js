const nutritionAssessmentService = require('./nutritionAssessmentService')
const nutritionDataService = require('./nutritionDataService')

const MAX_RESULTS = 20
const NAME_QUERY_CHUNK = 20

function normalizeUnit(value) {
  const unit = String(value || '').trim().toUpperCase()
  if (unit === 'ΜG' || unit === 'MCG' || unit === 'UG' || unit === 'µG') return 'UG'
  return unit
}

function displayUnit(value) {
  const unit = normalizeUnit(value)
  if (unit === 'G') return 'g'
  if (unit === 'MG') return 'mg'
  if (unit === 'UG') return 'µg'
  return unit
}

function displayAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  return Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100)
}

function preferredNameByFood(localizedNames) {
  return (localizedNames || []).reduce((result, item) => {
    if (item.locale && item.locale !== 'zh-CN') return result
    const foodId = String(item.food_id || '')
    const name = String(item.name || '').trim()
    if (!foodId || !name) return result
    const score = (item.name_type === 'preferred' ? 100 : 0) + Number(item.confidence || 0)
    if (!result[foodId] || score > result[foodId].score) result[foodId] = { name, score }
    return result
  }, {})
}

function currentIngredientByFood(currentIngredients) {
  return (currentIngredients || []).reduce((result, item) => {
    const foodId = String(item.ingredientId || item.id || item.foodId || '')
    if (foodId) result[foodId] = item
    return result
  }, {})
}

function candidateRecords(nutrientRecords, nutrientIds, preferredUnit) {
  const idSet = new Set(nutrientIds)
  const valid = (nutrientRecords || []).filter((record) => (
    idSet.has(Number(record.nutrient_id))
    && Number.isFinite(Number(record.amount))
    && Number(record.amount) > 0
  ))
  const targetUnit = normalizeUnit(preferredUnit)
  const matchingUnit = targetUnit ? valid.filter((record) => normalizeUnit(record.unit_name) === targetUnit) : []
  return (matchingUnit.length ? matchingUnit : valid).sort((left, right) => Number(right.amount) - Number(left.amount))
}

function buildNutrientIngredientResults({
  nutrientCode,
  nutrientName,
  preferredUnit,
  nutrientRecords = [],
  localizedNames = [],
  currentIngredients = []
}) {
  const nutrientIds = nutritionAssessmentService.nutrientIdsForCode(nutrientCode)
  const names = preferredNameByFood(localizedNames)
  const current = currentIngredientByFood(currentIngredients)
  const seen = new Set()
  return candidateRecords(nutrientRecords, nutrientIds, preferredUnit).reduce((result, record) => {
    const foodId = String(record.food_id || '')
    if (!foodId || seen.has(foodId) || !names[foodId]) return result
    seen.add(foodId)
    const currentIngredient = current[foodId]
    const suffix = currentIngredient
      ? `已在食谱 ${displayAmount(currentIngredient.perMealAmountGram)} g`
      : '其他'
    const unit = displayUnit(record.unit_name)
    result.push({
      id: foodId,
      ingredientId: foodId,
      foodId,
      name: names[foodId].name,
      category: currentIngredient && currentIngredient.category || 'other',
      categoryLabel: currentIngredient && currentIngredient.categoryLabel || '其他',
      nutrientCode,
      nutrientAmountPer100g: Number(record.amount),
      nutrientUnit: unit,
      displayDescription: `${nutrientName} ${displayAmount(record.amount)} ${unit} / 100 g · ${suffix}`
    })
    return result
  }, []).slice(0, MAX_RESULTS)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function nutrientWhere(database, nutrientIds) {
  return nutrientIds.length === 1 ? nutrientIds[0] : database.command.in(nutrientIds)
}

async function loadNamesForFoodIds(database, foodIds) {
  const chunks = []
  for (let index = 0; index < foodIds.length; index += NAME_QUERY_CHUNK) {
    chunks.push(foodIds.slice(index, index + NAME_QUERY_CHUNK))
  }
  const pages = await Promise.all(chunks.map((chunk) => nutritionDataService.readAll(
    database.collection('food_localized_name').where({
      locale: 'zh-CN',
      food_id: database.command.in(chunk)
    })
  )))
  return pages.flat()
}

async function loadDefaultData(database, nutrientIds, preferredUnit) {
  const nutrientRecords = await nutritionDataService.readAllInParallel(database.collection('food_nutrients').where({
    nutrient_id: nutrientWhere(database, nutrientIds)
  }))
  const foodIds = []
  const seen = new Set()
  candidateRecords(nutrientRecords, nutrientIds, preferredUnit).forEach((record) => {
    const foodId = String(record.food_id || '')
    if (!foodId || seen.has(foodId) || foodIds.length >= MAX_RESULTS * 3) return
    seen.add(foodId)
    foodIds.push(foodId)
  })
  const localizedNames = await loadNamesForFoodIds(database, foodIds)
  return { nutrientRecords, localizedNames }
}

async function loadSearchData(database, nutrientIds, keyword) {
  const nameResult = await database.collection('food_localized_name').where({
    locale: 'zh-CN',
    name: database.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  }).limit(MAX_RESULTS).get()
  const localizedNames = Array.isArray(nameResult.data) ? nameResult.data : []
  const foodIds = [...new Set(localizedNames.map((item) => String(item.food_id || '')).filter(Boolean))]
  if (!foodIds.length) return { nutrientRecords: [], localizedNames }
  const nutrientRecords = await nutritionDataService.readAll(database.collection('food_nutrients').where({
    nutrient_id: nutrientWhere(database, nutrientIds),
    food_id: database.command.in(foodIds)
  }))
  return { nutrientRecords, localizedNames }
}

async function loadNutrientIngredients({
  nutrientCode,
  nutrientName,
  preferredUnit,
  currentIngredients = [],
  keyword = ''
}) {
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.database !== 'function') {
    throw new Error('当前无法读取营养数据库')
  }
  const nutrientIds = nutritionAssessmentService.nutrientIdsForCode(nutrientCode)
  if (!nutrientIds.length) return []
  const database = wx.cloud.database()
  const data = keyword
    ? await loadSearchData(database, nutrientIds, keyword)
    : await loadDefaultData(database, nutrientIds, preferredUnit)
  return buildNutrientIngredientResults({
    nutrientCode,
    nutrientName,
    preferredUnit,
    currentIngredients,
    ...data
  })
}

module.exports = {
  buildNutrientIngredientResults,
  loadNutrientIngredients
}
