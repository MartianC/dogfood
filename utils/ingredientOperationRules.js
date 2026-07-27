const contract = require('../contracts/shared-meal/ingredient-operation-rules-v1.json')

const knownStatuses = new Set(contract.knownStatuses)

function normalizePolicyStatus(value) {
  const raw = typeof value === 'string'
    ? value
    : value && (value.policy_status || value.policyStatus)
  const normalized = String(raw || 'unknown').trim().toLowerCase()
  return knownStatuses.has(normalized) ? normalized : 'unknown'
}

function canOperateIngredient(value) {
  return normalizePolicyStatus(value) !== contract.blockedStatus
}

function canSearchIngredient(value) {
  return canOperateIngredient(value)
}

function canAddIngredient(value) {
  return canOperateIngredient(value)
}

function canAutoIncludeIngredient(value) {
  return canOperateIngredient(value)
}

module.exports = {
  canSearchIngredient,
  canAddIngredient,
  canAutoIncludeIngredient,
  normalizePolicyStatus
}
