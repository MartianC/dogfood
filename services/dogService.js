const env = require('../config/env')
const storage = require('../utils/storage')
const authService = require('./authService')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
const { breedAdultWeightCatalog } = require('../data/breedAdultWeightCatalog')
const { deriveActivityLevel, estimateExpectedAdultWeight } = require('./dogProfileDerivations')
const { estimateLifeStage, decorateDog } = require('./lifeStageEstimator')

const BREEDS = new Set(breedAdultWeightCatalog.map((item) => item.value))
const BODY_CONDITIONS = new Set(['thin', 'ideal', 'overweight'])
const DOGS_CACHE_SCHEMA_VERSION = 2

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function optionalHalfHour(value) {
  if (value === '' || value === null || value === undefined) return null
  const hours = Number(value)
  return Number.isFinite(hours) ? hours : null
}

function normalizeActivityLevel(value) {
  if (value === 'normal') return 'moderateLowImpact'
  return String(value || '').trim()
}

function normalizeDog(payload = {}) {
  return {
    name: String(payload.name || '').trim(),
    birthDate: String(payload.birthDate || '').trim(),
    breed: String(payload.breed || '').trim(),
    weightKg: Number(payload.weightKg || 0),
    dailyMeals: Number(payload.dailyMeals || 0),
    dailyActivityHours: optionalHalfHour(payload.dailyActivityHours),
    activityLevel: deriveActivityLevel(payload.dailyActivityHours),
    bodyCondition: String(payload.bodyCondition || '').trim(),
    avatarUrl: payload.avatarUrl || '',
    neutered: Boolean(payload.neutered),
    dietGoal: payload.dietGoal || 'daily',
    ...(hasOwn(payload, 'allergens') ? { allergens: payload.allergens } : {}),
    ...(hasOwn(payload, 'avoidIngredients') ? { avoidIngredients: payload.avoidIngredients } : {}),
    healthNotes: payload.healthNotes || ''
  }
}

function validateDog(dog, today) {
  if (!dog.name) throw new Error('请填写狗狗名字')
  const stage = estimateLifeStage({ birthDate: dog.birthDate, today })
  if (stage.reason === 'invalid_birth_date') throw new Error('请填写正确的出生日期')
  if (stage.reason === 'future_birth_date') throw new Error('出生日期不能晚于今天')
  if (!BREEDS.has(dog.breed)) throw new Error('请选择狗狗品种')
  if (!(dog.weightKg > 0)) throw new Error('请填写狗狗体重')
  if (!(dog.dailyMeals > 0)) throw new Error('请填写每日餐数')
  if (
    !Number.isFinite(dog.dailyActivityHours)
    || dog.dailyActivityHours < 0
    || dog.dailyActivityHours > 6
    || !Number.isInteger(dog.dailyActivityHours * 2)
  ) throw new Error('请选择 0–6 小时的日均活动时长')
  if (!BODY_CONDITIONS.has(dog.bodyCondition)) throw new Error('请选择体况')
  if (hasOwn(dog, 'allergens') && !Array.isArray(dog.allergens)) {
    throw new Error('过敏源数据格式不正确')
  }
  if (hasOwn(dog, 'avoidIngredients') && !Array.isArray(dog.avoidIngredients)) {
    throw new Error('忌口数据格式不正确')
  }
}

function decorateSavedDog(dog, today) {
  const estimate = estimateExpectedAdultWeight(dog && dog.breed)
  const derivedLevel = deriveActivityLevel(dog && dog.dailyActivityHours)
  return decorateDog({
    ...(dog || {}),
    activityLevel: derivedLevel || normalizeActivityLevel(dog && dog.activityLevel),
    ...estimate
  }, today)
}

function readDogsCache() {
  const cached = storage.getCache('dogsCache')
  return cached && cached.profileSchemaVersion === DOGS_CACHE_SCHEMA_VERSION
    ? cached
    : null
}

function writeDogsCache(dogs) {
  storage.setSync('dogsCache', {
    items: dogs,
    updatedAt: new Date().toISOString(),
    profileSchemaVersion: DOGS_CACHE_SCHEMA_VERSION
  })
}

async function listDogs() {
  const cached = readDogsCache()
  try {
    const dogs = (await adapter.listDogs()).map((dog) => decorateSavedDog(dog))
    writeDogsCache(dogs)
    authService.refreshState(dogs)
    return dogs
  } catch (error) {
    const fallback = cached ? cached.items.map((dog) => decorateSavedDog(dog)) : []
    authService.refreshState(fallback)
    return fallback
  }
}

async function createDog(payload) {
  const dog = normalizeDog(payload)
  validateDog(dog)
  const saved = await adapter.createDog(dog)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return decorateSavedDog(saved)
}

async function updateDog(id, payload) {
  const dog = normalizeDog(payload)
  validateDog(dog)
  const saved = await adapter.updateDog(id, dog)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return decorateSavedDog(saved)
}

async function deleteDog(id) {
  const result = await adapter.deleteDog(id)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return result
}

module.exports = {
  listDogs,
  createDog,
  updateDog,
  deleteDog,
  normalizeDog,
  validateDog,
  decorateSavedDog
}
