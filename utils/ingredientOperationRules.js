const KNOWN_POLICY_STATUSES = Object.freeze(['allowed', 'conditional', 'unknown', 'blocked'])
const BLOCKED_POLICY_STATUS = 'blocked'
const knownStatuses = new Set(KNOWN_POLICY_STATUSES)

function normalizePolicyStatus(value) {
  const raw = typeof value === 'string'
    ? value
    : value && (value.policy_status || value.policyStatus)
  const normalized = String(raw || 'unknown').trim().toLowerCase()
  return knownStatuses.has(normalized) ? normalized : 'unknown'
}

function canOperateIngredient(value) {
  return normalizePolicyStatus(value) !== BLOCKED_POLICY_STATUS
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
  normalizePolicyStatus,
  KNOWN_POLICY_STATUSES,
  BLOCKED_POLICY_STATUS
}
