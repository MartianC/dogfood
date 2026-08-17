const ALLERGY_ENTRY_PREFIX = 'concept:'
const BLOCKED_POLICY_STATUS = 'blocked'

function text(value) {
  return String(value || '').trim()
}

function normalizeName(value) {
  return text(value).toLocaleLowerCase().replace(/[\s·・_\-—]+/g, '')
}

function createAllergyEntry(ingredient = {}) {
  const conceptId = text(ingredient.conceptId || ingredient.concept_id)
  const name = text(
    ingredient.name
    || ingredient.displayName
    || ingredient.canonical_name_zh
    || ingredient.display_name_zh
  )
  if (!conceptId || !name) throw new Error('过敏食材缺少目录身份')
  return `${ALLERGY_ENTRY_PREFIX}${encodeURIComponent(conceptId)}|${encodeURIComponent(name)}`
}

function parseAllergyEntry(value) {
  const raw = text(value)
  if (!raw.startsWith(ALLERGY_ENTRY_PREFIX)) {
    return { raw, conceptId: '', name: raw, legacy: true }
  }
  const separator = raw.indexOf('|')
  const encodedConceptId = raw.slice(ALLERGY_ENTRY_PREFIX.length, separator < 0 ? undefined : separator)
  const encodedName = separator < 0 ? '' : raw.slice(separator + 1)
  try {
    return {
      raw,
      conceptId: decodeURIComponent(encodedConceptId),
      name: decodeURIComponent(encodedName),
      legacy: false
    }
  } catch (error) {
    return { raw, conceptId: '', name: raw, legacy: true }
  }
}

function allergyDisplayItems(allergens = []) {
  const seen = new Set()
  return (Array.isArray(allergens) ? allergens : []).reduce((items, entry) => {
    const parsed = parseAllergyEntry(entry)
    const key = parsed.conceptId || normalizeName(parsed.name)
    if (!key || seen.has(key)) return items
    seen.add(key)
    items.push({ ...parsed, key, name: parsed.name || parsed.conceptId })
    return items
  }, [])
}

function ingredientIdentity(ingredient = {}) {
  return {
    conceptId: text(ingredient.conceptId || ingredient.concept_id),
    names: [
      ingredient.name,
      ingredient.displayName,
      ingredient.canonicalName,
      ingredient.variantName,
      ingredient.canonical_name_zh,
      ingredient.display_name_zh,
      ingredient.allergenKey
    ].map(normalizeName).filter(Boolean)
  }
}

function isIngredientAllergen(ingredient, dog = {}) {
  const identity = ingredientIdentity(ingredient)
  return allergyDisplayItems(dog && dog.allergens).some((allergy) => (
    (allergy.conceptId && identity.conceptId && allergy.conceptId === identity.conceptId)
    || (!allergy.conceptId && identity.names.includes(normalizeName(allergy.name)))
  ))
}

function applyDogAllergyPolicy(ingredient = {}, dog = {}) {
  if (!isIngredientAllergen(ingredient, dog)) return { ...ingredient }
  const dogName = text(dog && dog.name) || '这只狗狗'
  const ingredientName = ingredientIdentity(ingredient).names.length
    ? text(
      ingredient.name
      || ingredient.displayName
      || ingredient.canonicalName
      || ingredient.canonical_name_zh
      || ingredient.display_name_zh
    )
    : '该食材'
  return {
    ...ingredient,
    policyStatus: BLOCKED_POLICY_STATUS,
    policy_status: BLOCKED_POLICY_STATUS,
    blockedReason: `${dogName}的档案已将${ingredientName || '该食材'}标记为过敏食材。`,
    displayDescription: `${dogName}对此食材过敏，不能添加`,
    blockedByDogAllergy: true
  }
}

function applyDogAllergyPolicies(ingredients = [], dog = {}) {
  return (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => (
    applyDogAllergyPolicy(ingredient, dog)
  ))
}

module.exports = {
  ALLERGY_ENTRY_PREFIX,
  BLOCKED_POLICY_STATUS,
  createAllergyEntry,
  parseAllergyEntry,
  allergyDisplayItems,
  isIngredientAllergen,
  applyDogAllergyPolicy,
  applyDogAllergyPolicies
}
