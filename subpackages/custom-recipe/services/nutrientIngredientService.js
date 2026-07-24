const nutritionAssessmentService = require('./nutritionAssessmentService')
const ingredientService = require('./ingredientService')
const runtimeDataReleaseService = require('./runtimeDataReleaseService')

const MAX_RESULTS = 20

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

function currentIngredientByFood(currentIngredients) {
  return (currentIngredients || []).reduce((result, item) => {
    const foodId = String(item.ingredientId || item.id || item.foodId || '')
    if (foodId) result[foodId] = item
    return result
  }, {})
}

function buildNutrientIngredientResults({
  ranking = {},
  nutrientCode,
  nutrientName,
  currentIngredients = [],
  keyword = ''
}) {
  const current = currentIngredientByFood(currentIngredients)
  const seen = new Set()
  const normalizedKeyword = String(keyword || '').trim().toLocaleLowerCase()
  const unit = displayUnit(ranking.unit_name)
  return (ranking.items || []).reduce((result, item) => {
    const foodId = String(item.food_id || '')
    const name = String(item.canonical_name_zh || item.display_name_zh || '').trim()
    const conceptKey = String(item.concept_id || foodId)
    const matchesKeyword = !normalizedKeyword || [
      name,
      item.display_name_zh
    ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedKeyword))
    if (!foodId || !name || !matchesKeyword || seen.has(conceptKey)) return result
    const amount = Number(item.amount_per_100g)
    if (!Number.isFinite(amount) || amount <= 0) return result
    seen.add(conceptKey)
    const currentIngredient = current[foodId]
    const suffix = currentIngredient
      ? `已在食谱 ${displayAmount(currentIngredient.perMealAmountGram)} g`
      : '其他'
    result.push(ingredientService.normalizeCatalogIngredient({
      ...item,
      id: foodId,
      nutrientCode,
      nutrientAmountPer100g: amount,
      nutrientUnit: unit,
      catalog_version: ranking.compatible_catalog_version,
      policy_version: ranking.compatible_policy_version,
      displayDescription: `${nutrientName} ${displayAmount(amount)} ${unit} / 100 g · ${suffix}`
    }))
    return result
  }, []).slice(0, MAX_RESULTS)
}

async function loadNutrientIngredients({
  nutrientCode,
  nutrientName,
  currentIngredients = [],
  keyword = ''
}) {
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.database !== 'function') {
    throw new Error('当前无法读取营养数据库')
  }
  const normalizedCode = nutritionAssessmentService.normalizeCode(nutrientCode)
  if (!normalizedCode) return []
  const database = wx.cloud.database()
  const release = await runtimeDataReleaseService.loadRuntimeRelease(database)
  const result = await database.collection('nutrient_rankings').where({
    nutrient_code: normalizedCode,
    ranking_version: release.ranking_version
  }).limit(1).get()
  const ranking = Array.isArray(result.data) ? result.data[0] : null
  if (!ranking) return []
  return buildNutrientIngredientResults({
    ranking,
    nutrientCode: normalizedCode,
    nutrientName: nutrientName || ranking.nutrient_name_zh || '营养元素',
    currentIngredients,
    keyword
  })
}

module.exports = {
  buildNutrientIngredientResults,
  loadNutrientIngredients
}
