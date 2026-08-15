const env = require('../../../config/env')
const storage = require('../../../utils/storage')
const recipes = require('../../../data/recipes')
const { canSearchIngredient } = require('./ingredientOperationRules')
const runtimeDataReleaseService = require('./runtimeDataReleaseService')

const RECENT_KEY = 'recentIngredients'
const MAX_RECENT = 8
const PAGE_SIZE = 20
const MAX_SEARCH_RESULTS = 20
const categoryLabels = {
  meat: '肉类',
  organ: '内脏',
  fish: '鱼类',
  seafood: '水产',
  egg: '蛋类',
  vegetable: '蔬菜',
  fruit: '水果',
  carb: '主食',
  legume: '豆类',
  dairy: '乳制品',
  oil: '油脂',
  other: '其他'
}
let ingredientCatalogCache = null

const COMMON_INGREDIENTS = [
  { id: 'common_beef', name: '牛肉', category: 'meat' },
  { id: 'common_egg', name: '鸡蛋', category: 'other' },
  { id: 'common_pumpkin', name: '南瓜', category: 'vegetable' },
  { id: 'common_broccoli', name: '西兰花', category: 'vegetable' }
]

function normalizeIngredient(item = {}) {
  const category = item.category || item.category_code || 'other'
  const categoryLabel = item.categoryLabel || categoryLabels[category] || '其他'
  const policyStatus = String(item.policyStatus || item.policy_status || 'unknown')
  const rawEnergyKcal = item.energyKcalPer100g
  const energyKcalPer100g = rawEnergyKcal === null || rawEnergyKcal === undefined || rawEnergyKcal === ''
    ? NaN
    : Number(rawEnergyKcal)
  const foodId = String(item.foodId || item.food_id || item.ingredientId || item.id || '')
  const name = String(
    item.name
    || item.display_name_zh
    || item.canonical_name_zh
    || ''
  ).trim()
  return {
    id: foodId || String(item.variantId || item.variant_id || name),
    ingredientId: foodId || String(item.variantId || item.variant_id || name),
    foodId,
    conceptId: String(item.conceptId || item.concept_id || ''),
    variantId: String(item.variantId || item.variant_id || ''),
    catalogVersion: String(item.catalogVersion || item.catalog_version || ''),
    policyVersion: String(item.policyVersion || item.policy_version || ''),
    policyStatus,
    sourceReleaseId: String(item.sourceReleaseId || item.source_release_id || ''),
    dataVersions: item.dataVersions && { ...item.dataVersions },
    canonicalName: String(item.canonicalName || item.canonical_name_zh || ''),
    variantName: String(item.variantName || item.display_name_zh || ''),
    aliases: Array.isArray(item.aliases) ? item.aliases.slice() : [],
    isDefault: Boolean(item.isDefault || item.is_default),
    name,
    category,
    categoryLabel,
    energyKcalPer100g: Number.isFinite(energyKcalPer100g) ? energyKcalPer100g : null,
    nutrientCode: String(item.nutrientCode || ''),
    nutrientAmountPer100g: Number.isFinite(Number(item.nutrientAmountPer100g))
      ? Number(item.nutrientAmountPer100g)
      : null,
    nutrientUnit: String(item.nutrientUnit || ''),
    displayDescription: item.displayDescription || (
      Number.isFinite(energyKcalPer100g)
        ? `每 100 g 约 ${Math.round(energyKcalPer100g)} kcal`
        : categoryLabel
    )
  }
}

function isIngredientPolicyOpen(item = {}) {
  return canSearchIngredient(item)
}

function normalizeCatalogIngredient(item = {}) {
  return normalizeIngredient({
    ...item,
    name: item.canonicalName
      || item.canonical_name_zh
      || item.name
      || item.display_name_zh,
    displayDescription: item.displayDescription || categoryLabels[item.category_code] || '其他'
  })
}

function catalogDataVersions(release) {
  return {
    runtimeReleaseId: String(release.release_id || ''),
    recipeVersion: release.recipe_version == null ? null : String(release.recipe_version),
    mappingVersion: release.mapping_version == null ? null : String(release.mapping_version),
    catalogVersion: String(release.catalog_version || ''),
    policyVersion: String(release.policy_version || ''),
    nutritionSourceReleaseId: String(release.profile_release_id || '')
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

function matchCatalogIngredient(ingredient, catalogIngredients) {
  return catalogIngredients.find((candidate) => (
    (ingredient.foodId && candidate.foodId === ingredient.foodId)
    || (ingredient.variantId && candidate.variantId === ingredient.variantId)
    || candidate.name === ingredient.name
  ))
}

function getRecentIngredients(currentIngredients = [], catalogIngredients = []) {
  const stored = storage.getSync(RECENT_KEY, [])
  const current = currentIngredients
    .slice()
    .reverse()
    .map(normalizeIngredient)
    .filter((item) => item.name)
  const recent = current.concat(Array.isArray(stored) ? stored.map(normalizeIngredient) : [])
  const hasCatalog = Array.isArray(catalogIngredients) && catalogIngredients.length > 0
  const catalog = hasCatalog ? catalogIngredients.map(normalizeIngredient) : []
  const candidates = hasCatalog
    ? recent
      .map((item) => matchCatalogIngredient(item, catalog))
      .filter(Boolean)
      .concat(catalog)
    : recent.concat(COMMON_INGREDIENTS.map(normalizeIngredient), buildMockIngredients())
  const seen = new Set()
  return candidates.filter((item) => {
    const key = item.foodId || item.variantId || item.name
    if (!key || seen.has(key)) return false
    seen.add(key)
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

function canUseCloudDatabase() {
  return env.useCloudBase
    && typeof wx !== 'undefined'
    && wx.cloud
    && typeof wx.cloud.database === 'function'
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

function sortIngredients(items) {
  return items.slice().sort((left, right) => (
    left.category.localeCompare(right.category)
    || left.name.localeCompare(right.name, 'zh-CN')
  ))
}

async function loadCloudIngredientCatalog() {
  const database = wx.cloud.database()
  const release = await runtimeDataReleaseService.loadRuntimeRelease(database)
  const records = await readAll(database.collection('ingredient_catalog').where({
    catalog_version: release.catalog_version,
    policy_version: release.policy_version,
    policy_status: database.command.neq('blocked')
  }))
  const ingredientsByConcept = records
    .filter(isIngredientPolicyOpen)
    .map((item) => normalizeCatalogIngredient({
      ...item,
      dataVersions: catalogDataVersions(release)
    }))
    .reduce((result, item) => {
      const key = item.conceptId || item.name
      if (!item.name || !item.foodId || !key) return result
      const existing = result[key]
      if (!existing || (item.isDefault && !existing.isDefault)) result[key] = item
      return result
    }, {})
  return sortIngredients(Object.values(ingredientsByConcept))
}

async function loadIngredientCatalog() {
  if (ingredientCatalogCache) return ingredientCatalogCache
  ingredientCatalogCache = canUseCloudDatabase()
    ? await loadCloudIngredientCatalog()
    : sortIngredients(buildMockIngredients())
  return ingredientCatalogCache
}

function catalogItemMatches(item, keyword) {
  const normalizedKeyword = String(keyword || '').trim().toLocaleLowerCase()
  if (!normalizedKeyword) return true
  return [
    item.name,
    item.canonicalName,
    item.variantName,
    ...(Array.isArray(item.aliases) ? item.aliases : [])
  ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedKeyword))
}

async function searchIngredients(keyword) {
  const query = String(keyword || '').trim()
  if (!query) return getRecentIngredients()
  if (canUseCloudDatabase()) {
    const catalog = await loadIngredientCatalog()
    return catalog.filter((item) => catalogItemMatches(item, query)).slice(0, MAX_SEARCH_RESULTS)
  }
  const lowerQuery = query.toLocaleLowerCase()
  return buildMockIngredients()
    .filter((item) => item.name.toLocaleLowerCase().includes(lowerQuery))
    .slice(0, MAX_SEARCH_RESULTS)
}

function clearCache() {
  ingredientCatalogCache = null
  runtimeDataReleaseService.clearCache()
}

module.exports = {
  getRecentIngredients,
  loadIngredientCatalog,
  searchIngredients,
  recordRecentIngredient,
  normalizeIngredient,
  normalizeCatalogIngredient,
  isIngredientPolicyOpen,
  catalogItemMatches,
  clearCache,
  buildMockIngredients
}
