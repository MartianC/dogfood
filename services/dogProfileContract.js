const DOG_PROFILE_SCHEMA_VERSION = 3
const DOGS_CACHE_SCHEMA_VERSION = 3

const REPRODUCTIVE_STATUSES = new Set(['none', 'pregnant', 'lactating', null])
const THERAPEUTIC_WEIGHT_MANAGEMENT_STATUSES = new Set(['none', 'loss', 'gain', null])

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
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
  normalizeSpecialNutritionNeeds,
  validateSpecialNutritionNeeds
}
