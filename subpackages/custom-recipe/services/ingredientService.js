const env = require('../../../config/env')
const storage = require('../../../utils/storage')
const recipes = require('../../../data/recipes')
const { canSearchIngredient } = require('./ingredientOperationRules')
const runtimeDataReleaseService = require('./runtimeDataReleaseService')

const RECENT_KEY = 'recentIngredients'
const MAX_RECENT = 8
const PAGE_SIZE = 20
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
const COMMON_INGREDIENTS = [
  { id: 'common_beef', name: '牛肉', category: 'meat' },
  { id: 'common_egg', name: '鸡蛋', category: 'other' },
  { id: 'common_pumpkin', name: '南瓜', category: 'vegetable' },
  { id: 'common_broccoli', name: '西兰花', category: 'vegetable' }
]

// 目录底层保留完整营养身份；选择入口只展示少量代表项，避免 USDA 细分名称淹没常用食材。
const INGREDIENT_SELECTION_GROUPS = [
  {
    id: 'flour',
    category: 'carb',
    representativeConceptIds: new Set([
      'ingredient_auto_model_21eaff4331362c33',
      'ingredient_auto_model_f90d535503573e75'
    ]),
    namePattern: /(?:面粉|小麦粉|全麦粉|麦粉|粗面粉|粗麦粉|杜兰|斯佩尔特)/,
    keywordPattern: /(?:面粉|小麦粉|全麦粉|麦粉|粗面粉|粗麦粉|杜兰|斯佩尔特|高筋|低筋)/
  },
  {
    id: 'cheese',
    category: 'dairy',
    representativeConceptIds: new Set([
      'ingredient_auto_667e81096d909865',
      'ingredient_auto_model_c53f731e04c2ac9e'
    ]),
    namePattern: /(?:奶酪|芝士|乳酪|干酪)/,
    keywordPattern: /(?:奶酪|芝士|乳酪|干酪|切达|车打|马苏里拉|帕尔马)/
  }
]

function ingredientSearchText(item = {}) {
  return [
    item.name,
    item.canonicalName,
    item.canonical_name_zh,
    item.display_name_zh,
    ...(Array.isArray(item.aliases) ? item.aliases : [])
  ].filter(Boolean).join('|')
}

function selectionGroupForIngredient(item = {}) {
  const category = String(item.category || item.category_code || '')
  const text = ingredientSearchText(item)
  return INGREDIENT_SELECTION_GROUPS.find((group) => (
    group.category === category && group.namePattern.test(text)
  )) || null
}

function selectionGroupForKeyword(keyword) {
  const text = String(keyword || '').trim()
  return INGREDIENT_SELECTION_GROUPS.find((group) => group.keywordPattern.test(text)) || null
}

function isIngredientSelectionRepresentative(item = {}) {
  const group = selectionGroupForIngredient(item)
  if (!group) return true
  const conceptId = String(item.conceptId || item.concept_id || '')
  return group.representativeConceptIds.has(conceptId)
}

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
    nutritionSourceReleaseId: runtimeDataReleaseService.nutritionProfileReleaseId(release)
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

function sortIngredients(items) {
  return items.slice().sort((left, right) => (
    left.category.localeCompare(right.category)
    || left.name.localeCompare(right.name, 'zh-CN')
  ))
}

function normalizePageOptions(options = {}) {
  const offset = Number(options.offset)
  const limit = Number(options.limit)
  return {
    keyword: String(options.keyword || '').trim(),
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, PAGE_SIZE) : PAGE_SIZE
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function catalogWhere(database, release, keyword) {
  const base = {
    catalog_version: release.catalog_version,
    policy_version: release.policy_version,
    policy_status: database.command.neq('blocked'),
    is_default: true
  }
  if (!keyword) return base
  const selectionGroup = selectionGroupForKeyword(keyword)
  if (selectionGroup) {
    return database.command.and([
      base,
      {
        concept_id: database.command.in([...selectionGroup.representativeConceptIds])
      }
    ])
  }
  const pattern = database.RegExp({
    regexp: escapeRegularExpression(keyword),
    options: 'i'
  })
  return database.command.and([
    base,
    database.command.or([
      { canonical_name_zh: pattern },
      { display_name_zh: pattern },
      { aliases: pattern }
    ])
  ])
}

function normalizeCatalogPage(records, release, keyword) {
  const seen = new Set()
  return records
    .filter(isIngredientPolicyOpen)
    .filter(isIngredientSelectionRepresentative)
    .map((item) => normalizeCatalogIngredient({
      ...item,
      dataVersions: catalogDataVersions(release)
    }))
    .filter((item) => {
      const key = item.conceptId || item.name
      if (!item.name || !item.foodId || !key || seen.has(key)) return false
      if (keyword && !catalogItemMatches(item, keyword)) return false
      seen.add(key)
      return true
    })
}

async function loadCloudIngredientPage(options) {
  const database = wx.cloud.database()
  const release = await runtimeDataReleaseService.loadRuntimeRelease(database)
  const result = await database.collection('ingredient_catalog')
    .where(catalogWhere(database, release, options.keyword))
    .skip(options.offset)
    .limit(options.limit)
    .get()
  const records = Array.isArray(result.data) ? result.data : []
  return {
    items: normalizeCatalogPage(records, release, options.keyword),
    hasMore: records.length === options.limit
  }
}

async function loadIngredientPage(rawOptions = {}) {
  const options = normalizePageOptions(rawOptions)
  if (canUseCloudDatabase()) return loadCloudIngredientPage(options)
  const matches = sortIngredients(buildMockIngredients()).filter((item) => (
    !options.keyword || catalogItemMatches(item, options.keyword)
  ))
  const items = matches.slice(options.offset, options.offset + options.limit)
  return {
    items,
    hasMore: options.offset + items.length < matches.length
  }
}

function catalogItemMatches(item, keyword) {
  const normalizedKeyword = String(keyword || '').trim().toLocaleLowerCase()
  if (!normalizedKeyword) return true
  const directMatch = [
    item.name,
    item.canonicalName,
    item.variantName,
    ...(Array.isArray(item.aliases) ? item.aliases : [])
  ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedKeyword))
  if (directMatch) return true
  const selectionGroup = selectionGroupForKeyword(normalizedKeyword)
  return Boolean(selectionGroup && selectionGroupForIngredient(item)?.id === selectionGroup.id)
}

function clearCache() {
  runtimeDataReleaseService.clearCache()
}

module.exports = {
  getRecentIngredients,
  loadIngredientPage,
  recordRecentIngredient,
  normalizeIngredient,
  normalizeCatalogIngredient,
  normalizeCatalogPage,
  isIngredientPolicyOpen,
  isIngredientSelectionRepresentative,
  catalogItemMatches,
  clearCache,
  buildMockIngredients
}
