const storage = require('../../utils/storage')
const env = require('../../config/env')
const {
  DOG_PROFILE_SCHEMA_VERSION,
  normalizeSpecialNutritionNeeds,
  validateSpecialNutritionNeeds
} = require('../dogProfileContract')
const weightContract = require('../weightContract')
const careContract = require('../../contracts/care/careRecordContract')
const { isSharedMealRecordEditableToday } = require('../sharedMealRecordEditability')

function now() {
  return new Date().toISOString()
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function validateHiddenArrays(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'allergens') && !Array.isArray(payload.allergens)) {
    throw new Error('过敏源数据格式不正确')
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'avoidIngredients')
    && !Array.isArray(payload.avoidIngredients)
  ) throw new Error('忌口数据格式不正确')
  validateSpecialNutritionNeeds(payload.specialNutritionNeeds)
}

function validateAllergens(allergens) {
  if (!Array.isArray(allergens)) throw new Error('过敏源数据格式不正确')
  if (
    allergens.some((item) => typeof item !== 'string' || !item.trim() || item.length > 300)
  ) throw new Error('过敏食材数据格式不正确')
  return allergens.slice()
}

async function login() {
  const user = storage.getSync('mockUser', env.mockUser)
  storage.setSync('mockUser', user)
  return {
    token: 'mock_access_token',
    user
  }
}

async function updateUserProfile(profile = {}) {
  const currentUser = storage.getSync('mockUser', env.mockUser)
  const user = {
    ...currentUser,
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : currentUser.avatarUrl || '',
    nickname: typeof profile.nickname === 'string' && profile.nickname.trim()
      ? profile.nickname.trim().slice(0, 20)
      : currentUser.nickname || '爪饭用户'
  }
  storage.setSync('mockUser', user)
  return user
}

async function listDogs() {
  return storage.getSync('mockDogs', [])
}

async function getDogProfileContract() {
  return {
    contract: 'dogProfile/v3',
    schemaVersion: DOG_PROFILE_SCHEMA_VERSION,
    supportsSpecialNutritionNeeds: true,
    supportsAllergenPatch: true
  }
}

async function getWeightRecordContract() {
  return {
    contract: 'weightRecord/v1',
    schemaVersion: weightContract.WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    measurementContract: weightContract.WEIGHT_MEASUREMENT_CONTRACT,
    collection: 'weight_measurements',
    supportsHistory: true,
    supportsProfileSync: true,
    supportsDelete: true,
    maxPageSize: 50
  }
}

async function createDog(payload) {
  validateHiddenArrays(payload)
  const dogs = await listDogs()
  const dog = {
    id: uid('dog'),
    userId: env.mockUser.id,
    allergens: [],
    avoidIngredients: [],
    avatarUrl: '',
    dietGoal: 'daily',
    createdAt: now(),
    updatedAt: now(),
    ...payload,
    schemaVersion: DOG_PROFILE_SCHEMA_VERSION,
    specialNutritionNeeds: normalizeSpecialNutritionNeeds(payload.specialNutritionNeeds)
  }
  storage.setSync('mockDogs', dogs.concat(dog))
  return dog
}

async function createWeightMeasurement(payload) {
  const input = weightContract.normalizeWeightMeasurementInput(payload, {
    today: weightContract.dateTextInShanghai()
  })
  const dogs = await listDogs()
  const dog = dogs.find((item) => (
    item.id === input.dogId
    && (item.userId === env.mockUser.id || item._openid === env.mockUser.id)
  ))
  if (!dog) throw new Error('无权使用该狗狗档案')

  const createdAt = now()
  const measurement = weightContract.normalizeWeightMeasurement({
    ...input,
    id: uid('weight'),
    createdAt
  }, { today: weightContract.dateTextInShanghai(createdAt) })
  const measurements = storage.getSync('mockWeightMeasurements', [])
  storage.setSync('mockWeightMeasurements', measurements.concat({
    userId: env.mockUser.id,
    ...measurement
  }))
  storage.setSync('mockDogs', dogs.map((item) => item.id === dog.id
    ? { ...item, weightKg: measurement.weightKg, updatedAt: createdAt }
    : item))

  return {
    contract: 'weightRecord/v1',
    schemaVersion: weightContract.WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    measurement,
    currentWeight: weightContract.currentWeightFromMeasurement(measurement)
  }
}

async function updateDog(id, payload) {
  validateHiddenArrays(payload)
  const dogs = await listDogs()
  const next = dogs.map((dog) => dog.id === id ? {
    ...dog,
    ...payload,
    schemaVersion: DOG_PROFILE_SCHEMA_VERSION,
    specialNutritionNeeds: normalizeSpecialNutritionNeeds(payload.specialNutritionNeeds),
    updatedAt: now()
  } : dog)
  storage.setSync('mockDogs', next)
  return next.find((dog) => dog.id === id)
}

async function updateDogAllergens(id, allergens) {
  const nextAllergens = validateAllergens(allergens)
  const dogs = await listDogs()
  const index = dogs.findIndex((dog) => dog.id === id)
  if (index < 0) throw new Error('未找到狗狗档案')
  const saved = {
    ...dogs[index],
    allergens: nextAllergens,
    updatedAt: now()
  }
  const next = dogs.slice()
  next[index] = saved
  storage.setSync('mockDogs', next)
  return saved
}

async function deleteDog(id) {
  const dogs = await listDogs()
  storage.setSync('mockDogs', dogs.filter((dog) => dog.id !== id))
  return { ok: true }
}

async function saveCustomRecipe(payload) {
  const list = storage.getSync('mockCustomRecipes', [])
  const item = {
    id: payload.id || uid('custom'),
    userId: env.mockUser.id,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
    ...payload
  }
  storage.setSync('mockCustomRecipes', list.filter((old) => old.id !== item.id).concat(item))
  return item
}

async function saveMealPlan(payload) {
  const list = storage.getSync('mockMealPlans', [])
  const item = {
    id: payload.id || uid('plan'),
    userId: env.mockUser.id,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
    ...payload
  }
  storage.setSync('mockMealPlans', list.filter((old) => old.id !== item.id).concat(item))
  return item
}

async function listMealPlans() {
  return storage.getSync('mockMealPlans', [])
}

const MOCK_HUMAN_RECIPES = [
  {
    _id: 'mock_human_tomato_egg',
    release_id: 'mock-runtime-release-v2',
    base_release_id: 'mock-nutrition-release-v1',
    recipe_version: 'mock-recipe-v2',
    mapping_version: 'mock-mapping-v2',
    compatible_catalog_version: 'mock-catalog-v1',
    compatible_policy_version: 'mock-policy-v1',
    title: '番茄炒蛋',
    sortKey: '番茄炒蛋',
    ingredients: [
      {
        position: 0,
        raw_name: '番茄',
        amount_raw: '2 个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_tomato',
          variant_id: 'variant_tomato_raw',
          food_id: 'food_tomato',
          display_name_zh: '番茄',
          category_code: 'vegetable',
          policy_status: 'allowed',
          blockedReason: null
        }]
      },
      {
        position: 1,
        raw_name: '鸡蛋',
        amount_raw: '3 个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_egg',
          variant_id: 'variant_egg_cooked',
          food_id: 'food_egg',
          display_name_zh: '鸡蛋',
          category_code: 'egg',
          policy_status: 'conditional',
          blockedReason: null
        }]
      }
    ]
  },
  {
    _id: 'mock_human_onion_beef',
    release_id: 'mock-runtime-release-v2',
    base_release_id: 'mock-nutrition-release-v1',
    recipe_version: 'mock-recipe-v2',
    mapping_version: 'mock-mapping-v2',
    compatible_catalog_version: 'mock-catalog-v1',
    compatible_policy_version: 'mock-policy-v1',
    title: '洋葱牛肉',
    sortKey: '洋葱牛肉',
    ingredients: [
      {
        position: 0,
        raw_name: '洋葱',
        amount_raw: '半个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_onion',
          variant_id: 'variant_onion_raw',
          food_id: 'food_onion',
          display_name_zh: '洋葱',
          category_code: 'vegetable',
          policy_status: 'blocked',
          blockedReason: '洋葱不适合犬只食用。'
        }]
      },
      {
        position: 1,
        raw_name: '牛肉',
        amount_raw: '300 克',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_beef',
          variant_id: 'variant_beef_cooked',
          food_id: 'food_beef',
          display_name_zh: '牛肉',
          category_code: 'meat',
          policy_status: 'unknown',
          blockedReason: null
        }]
      },
      {
        position: 2,
        raw_name: '少许调味料',
        amount_raw: '',
        mapping_status: 'unmatched'
      }
    ]
  }
]

async function searchHumanRecipes(options = {}) {
  const query = String(options.query || '').trim().toLocaleLowerCase()
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 20)
  const items = MOCK_HUMAN_RECIPES
    .filter((recipe) => !query || recipe.title.toLocaleLowerCase().includes(query))
    .slice(0, limit)
    .map((recipe) => ({
      id: recipe._id,
      title: recipe.title,
      ingredientPreviewVersion: 1,
      ingredients: recipe.ingredients.map((ingredient) => ({
        position: Number(ingredient.position || 0),
        raw_name: String(ingredient.raw_name || ''),
        amount_raw: ingredient.amount_raw == null
          ? null
          : String(ingredient.amount_raw),
        mapping_status: String(ingredient.mapping_status || 'unmatched'),
        components: Array.isArray(ingredient.components)
          ? ingredient.components.map((component) => ({
            canonical_name_zh: String(
              component.canonical_name_zh
              || component.display_name_zh
              || ''
            ),
            policy_status: String(component.policy_status || 'unknown')
          }))
          : []
      }))
    }))
  return {
    contract: 'searchHumanRecipes/v1',
    recipeVersion: 'mock-recipe-v2',
    items,
    nextCursor: null
  }
}

async function getHumanRecipe(recipeId) {
  const recipe = MOCK_HUMAN_RECIPES.find((item) => item._id === recipeId)
  if (!recipe) throw new Error('未找到已发布菜谱')
  return {
    contract: 'getHumanRecipe/v1',
    recipeVersion: 'mock-recipe-v2',
    recipe: {
      ...recipe,
      id: recipe._id
    }
  }
}

async function saveSharedMealRecord(saveIntent) {
  const list = storage.getSync('mockSharedMealRecords', [])
  const existed = list.find((item) => item.idempotencyKey === saveIntent.idempotencyKey)
  if (existed) {
    if (existed.requestFingerprint !== saveIntent.requestFingerprint) {
      throw new Error('相同保存请求包含不同内容')
    }
    return existed
  }
  const candidate = JSON.parse(JSON.stringify(saveIntent.candidate || {}))
  const record = {
    id: `shared_${saveIntent.requestFingerprint.replace(/[^a-z0-9]/gi, '')}`,
    idempotencyKey: saveIntent.idempotencyKey,
    requestFingerprint: saveIntent.requestFingerprint,
    ...candidate,
    createdAt: now(),
    updatedAt: now(),
    revision: 1
  }
  storage.setSync('mockSharedMealRecords', list.concat(record))
  return record
}

async function updateSharedMealRecord(updateIntent) {
  const list = storage.getSync('mockSharedMealRecords', [])
  const index = list.findIndex((item) => item.id === updateIntent.recordId)
  if (index < 0) throw new Error('未找到本餐记录')
  const current = list[index]
  if (current.lastUpdateKey === updateIntent.updateKey) {
    if (current.lastUpdateFingerprint !== updateIntent.updateFingerprint) {
      throw new Error('相同更新请求包含不同内容')
    }
    return JSON.parse(JSON.stringify(current))
  }
  if (!isSharedMealRecordEditableToday(current, new Date())) {
    throw new Error('这顿饭已进入历史，只能查看')
  }
  if ((Number(current.revision) || 1) !== Number(updateIntent.expectedRevision)) {
    throw new Error('这顿饭已被更新，请重新读取后再修改')
  }
  if (updateIntent.candidate.targetDogId !== current.targetDogId) {
    throw new Error('本餐记录不能更换狗狗')
  }
  if (updateIntent.candidate.mealTime !== current.mealTime) {
    throw new Error('本餐记录不能更改用餐时间')
  }
  const updated = {
    ...current,
    ...JSON.parse(JSON.stringify(updateIntent.candidate)),
    id: current.id,
    targetDogId: current.targetDogId,
    mealTime: current.mealTime,
    createdAt: current.createdAt,
    updatedAt: now(),
    revision: (Number(current.revision) || 1) + 1,
    lastUpdateKey: updateIntent.updateKey,
    lastUpdateFingerprint: updateIntent.updateFingerprint
  }
  list[index] = updated
  storage.setSync('mockSharedMealRecords', list)
  return JSON.parse(JSON.stringify(updated))
}

async function listSharedMealRecords(options = {}) {
  const targetDogId = String(options.targetDogId || '')
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 20)
  const cursor = String(options.cursor || '')
  const records = storage.getSync('mockSharedMealRecords', [])
    .filter((item) => !targetDogId || item.targetDogId === targetDogId)
    .sort((left, right) => (
      String(right.mealTime || '').localeCompare(String(left.mealTime || ''))
      || String(right.id || '').localeCompare(String(left.id || ''))
    ))
  const cursorIndex = cursor ? records.findIndex((item) => item.id === cursor) : -1
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
  const items = records.slice(start, start + limit)
  return {
    items,
    nextCursor: records.length > start + items.length ? items[items.length - 1].id : null
  }
}

async function getSharedMealRecord(recordId) {
  const record = storage.getSync('mockSharedMealRecords', []).find((item) => item.id === recordId)
  if (!record) throw new Error('未找到本餐记录')
  return JSON.parse(JSON.stringify(record))
}

async function listWeightMeasurements(options = {}) {
  const dogId = String(options.dogId || '').trim()
  const limit = Math.min(Math.max(Number(options.limit) || 1, 1), 50)
  const startDate = String(options.startDate || '').trim()
  const endDate = String(options.endDate || '').trim()
  const items = storage.getSync('mockWeightMeasurements', [])
    .filter((item) => item.userId === env.mockUser.id && item.dogId === dogId)
    .filter((item) => (!startDate || String(item.measuredOn || '') >= startDate)
      && (!endDate || String(item.measuredOn || '') < endDate))
    .map((item) => ({
      schemaVersion: item.schemaVersion,
      id: item.id,
      dogId: item.dogId,
      weightKg: item.weightKg,
      measuredOn: item.measuredOn,
      createdAt: item.createdAt
    }))
    .sort((left, right) => (
      String(right.measuredOn || '').localeCompare(String(left.measuredOn || ''))
      || String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
      || String(right.id || '').localeCompare(String(left.id || ''))
    ))

  return {
    dogId,
    items: JSON.parse(JSON.stringify(items.slice(0, limit))),
    nextCursor: null,
    contract: 'weightRecord/v1',
    schemaVersion: weightContract.WEIGHT_MEASUREMENT_SCHEMA_VERSION
  }
}

async function listCareRecords(options = {}) {
  const dogId = String(options.dogId || '').trim()
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 20)
  const type = String(options.type || '').trim()
  const startDate = String(options.startDate || '').trim()
  const endDate = String(options.endDate || '').trim()
  const items = storage.getSync('mockCareRecords', [])
    .filter((item) => item.dogId === dogId && (!type || item.type === type))
    .filter((item) => (!startDate || String(item.occurredOn || '') >= startDate)
      && (!endDate || String(item.occurredOn || '') < endDate))
    .map((item) => careContract.normalizeCareRecord(item))
    .sort((left, right) => (
      String(right.occurredOn || '').localeCompare(String(left.occurredOn || ''))
      || String(right.id || '').localeCompare(String(left.id || ''))
    ))

  return {
    dogId,
    items: JSON.parse(JSON.stringify(items.slice(0, limit))),
    nextCursor: null
  }
}

async function listUpcomingCareRecords(options = {}) {
  const dogIds = new Set((Array.isArray(options.dogIds) ? options.dogIds : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))
  const limit = Math.min(Math.max(Number(options.limit) || 3, 1), 20)
  const items = storage.getSync('mockCareRecords', [])
    .filter((item) => dogIds.has(String(item.dogId || '')) && String(item.nextDate || ''))
    .map((item) => careContract.normalizeCareRecord(item))
    .sort((left, right) => (
      String(left.nextDate || '').localeCompare(String(right.nextDate || ''))
      || String(left.id || '').localeCompare(String(right.id || ''))
    ))
    .slice(0, limit)
  return { items: JSON.parse(JSON.stringify(items)) }
}

module.exports = {
  login,
  updateUserProfile,
  getWeightRecordContract,
  getDogProfileContract,
  listDogs,
  createDog,
  createWeightMeasurement,
  updateDog,
  updateDogAllergens,
  deleteDog,
  saveCustomRecipe,
  saveMealPlan,
  listMealPlans,
  searchHumanRecipes,
  getHumanRecipe,
  saveSharedMealRecord,
  updateSharedMealRecord,
  listSharedMealRecords,
  getSharedMealRecord,
  listWeightMeasurements,
  listCareRecords,
  listUpcomingCareRecords
}
