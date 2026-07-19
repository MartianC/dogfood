const env = require('../../../config/env')
const storage = require('../../../utils/storage')
const recipes = require('../../../data/recipes')

const RECENT_KEY = 'recentIngredients'
const MAX_RECENT = 8
const categoryLabels = {
  meat: '肉类',
  vegetable: '蔬菜',
  carb: '主食',
  other: '其他'
}

const COMMON_INGREDIENTS = [
  { id: 'common_beef', name: '牛肉', category: 'meat' },
  { id: 'common_egg', name: '鸡蛋', category: 'other' },
  { id: 'common_pumpkin', name: '南瓜', category: 'vegetable' },
  { id: 'common_broccoli', name: '西兰花', category: 'vegetable' }
]

function normalizeIngredient(item = {}) {
  const category = item.category || 'other'
  const categoryLabel = item.categoryLabel || categoryLabels[category] || '其他'
  const rawEnergyKcal = item.energyKcalPer100g
  const energyKcalPer100g = rawEnergyKcal === null || rawEnergyKcal === undefined || rawEnergyKcal === ''
    ? NaN
    : Number(rawEnergyKcal)
  return {
    id: String(item.id || item.ingredientId || item.foodId || item.name || ''),
    name: String(item.name || '').trim(),
    category,
    categoryLabel,
    energyKcalPer100g: Number.isFinite(energyKcalPer100g) ? energyKcalPer100g : null,
    displayDescription: item.displayDescription || (
      Number.isFinite(energyKcalPer100g)
        ? `每 100 g 约 ${Math.round(energyKcalPer100g)} kcal`
        : categoryLabel
    )
  }
}

function buildMockIngredients() {
  const seen = new Set()
  return recipes.flatMap((recipe) => recipe.ingredients || []).reduce((result, item) => {
    const normalized = normalizeIngredient(item)
    if (!normalized.name || seen.has(normalized.name)) return result
    seen.add(normalized.name)
    result.push({ ...normalized, id: `mock_${normalized.name}` })
    return result
  }, [])
}

function getRecentIngredients(currentIngredients = []) {
  const stored = storage.getSync(RECENT_KEY, [])
  const current = currentIngredients
    .slice()
    .reverse()
    .map(normalizeIngredient)
    .filter((item) => item.name)
  const candidates = current.concat(
    Array.isArray(stored) ? stored.map(normalizeIngredient) : [],
    COMMON_INGREDIENTS.map(normalizeIngredient),
    buildMockIngredients()
  )
  const seen = new Set()
  return candidates.filter((item) => {
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  }).slice(0, MAX_RECENT)
}

function recordRecentIngredient(ingredient) {
  const normalized = normalizeIngredient(ingredient)
  if (!normalized.name) return
  const next = [normalized].concat(storage.getSync(RECENT_KEY, [])).filter((item, index, list) => {
    return list.findIndex((candidate) => normalizeIngredient(candidate).name === normalized.name) === index
  }).slice(0, MAX_RECENT)
  storage.setSync(RECENT_KEY, next)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function searchCloudIngredients(keyword) {
  const database = wx.cloud.database()
  const result = await database.collection('food_localized_name')
    .where({
      locale: 'zh-CN',
      name: database.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    })
    .limit(20)
    .get()
  const seen = new Set()
  return result.data.map((item) => normalizeIngredient({
    id: item.food_id || item.fdc_id,
    foodId: item.food_id || item.fdc_id,
    name: item.name,
    category: 'other',
    energyKcalPer100g: item.energy_kcal_per_100g
  })).filter((item) => {
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  })
}

async function searchIngredients(keyword) {
  const query = String(keyword || '').trim()
  if (!query) return getRecentIngredients()
  if (env.useCloudBase && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.database === 'function') {
    return searchCloudIngredients(query)
  }
  const lowerQuery = query.toLocaleLowerCase()
  return buildMockIngredients().filter((item) => item.name.toLocaleLowerCase().includes(lowerQuery)).slice(0, 20)
}

module.exports = {
  getRecentIngredients,
  searchIngredients,
  recordRecentIngredient,
  normalizeIngredient,
  buildMockIngredients
}
