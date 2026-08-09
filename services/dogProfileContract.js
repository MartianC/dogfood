const DOG_PROFILE_SCHEMA_VERSION = 3
const DOGS_CACHE_SCHEMA_VERSION = 3
// 狗狗缓存只用于启动阶段展示快照；超过一天必须重新以服务端结果为准。
const DOGS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

const REPRODUCTIVE_STATUSES = new Set(['none', 'pregnant', 'lactating', null])
const THERAPEUTIC_WEIGHT_MANAGEMENT_STATUSES = new Set(['none', 'loss', 'gain', null])

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isDogsCacheValid(cache, now = Date.now()) {
  if (!cache || cache.profileSchemaVersion !== DOGS_CACHE_SCHEMA_VERSION) return false
  if (!Array.isArray(cache.items) || typeof cache.updatedAt !== 'string') return false
  const updatedAt = Date.parse(cache.updatedAt)
  if (!Number.isFinite(updatedAt)) return false
  const age = now - updatedAt
  return age >= 0 && age <= DOGS_CACHE_MAX_AGE_MS
}

function normalizeSpecialNutritionNeeds(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    hasDisease: hasOwn(source, 'hasDisease') ? source.hasDisease : null,
    reproductiveStatus: hasOwn(source, 'reproductiveStatus')
      ? source.reproductiveStatus
      : null,
    therapeuticWeightManagement: hasOwn(source, 'therapeuticWeightManagement')
      ? source.therapeuticWeightManagement
      : null
  }
}

function validateSpecialNutritionNeeds(value) {
  const needs = normalizeSpecialNutritionNeeds(value)
  if (
    ![true, false, null].includes(needs.hasDisease)
    || !REPRODUCTIVE_STATUSES.has(needs.reproductiveStatus)
    || !THERAPEUTIC_WEIGHT_MANAGEMENT_STATUSES.has(needs.therapeuticWeightManagement)
  ) throw new Error('特殊营养需求数据格式不正确')
  return needs
}

module.exports = {
  DOG_PROFILE_SCHEMA_VERSION,
  DOGS_CACHE_SCHEMA_VERSION,
  DOGS_CACHE_MAX_AGE_MS,
  isDogsCacheValid,
  normalizeSpecialNutritionNeeds,
  validateSpecialNutritionNeeds
}
