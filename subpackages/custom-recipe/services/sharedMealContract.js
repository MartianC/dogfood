// 此文件由 scripts/sync-subpackage-services.js 自动生成，请修改 shared-src 后重新同步。
const INGREDIENT_CONTRACT_VERSION = 1

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortObject(value[key])
    return result
  }, {})
}

function canonicalizeIngredient(ingredient) {
  const sourceRefs = (ingredient.sourceRefs || [])
    .map((item) => ({
      humanMenuId: String(item.humanMenuId || ''),
      ingredientPosition: Number(item.ingredientPosition)
    }))
    .sort((left, right) => (
      left.humanMenuId.localeCompare(right.humanMenuId)
      || left.ingredientPosition - right.ingredientPosition
    ))
  return {
    schemaVersion: INGREDIENT_CONTRACT_VERSION,
    ingredientId: String(ingredient.ingredientId || ''),
    foodId: String(ingredient.foodId || ''),
    conceptId: String(ingredient.conceptId || ''),
    variantId: String(ingredient.variantId || ''),
    name: String(ingredient.name || ''),
    category: String(ingredient.category || ''),
    policyStatus: String(ingredient.policyStatus || ''),
    perMealAmountGram: ingredient.perMealAmountGram === null
      ? null
      : Number(ingredient.perMealAmountGram),
    sourceRefs,
    dataVersions: {
      runtimeReleaseId: String(ingredient.dataVersions && ingredient.dataVersions.runtimeReleaseId || ''),
      recipeVersion: ingredient.dataVersions && ingredient.dataVersions.recipeVersion === null
        ? null
        : String(ingredient.dataVersions && ingredient.dataVersions.recipeVersion || ''),
      mappingVersion: ingredient.dataVersions && ingredient.dataVersions.mappingVersion === null
        ? null
        : String(ingredient.dataVersions && ingredient.dataVersions.mappingVersion || ''),
      catalogVersion: String(ingredient.dataVersions && ingredient.dataVersions.catalogVersion || ''),
      policyVersion: String(ingredient.dataVersions && ingredient.dataVersions.policyVersion || ''),
      nutritionSourceReleaseId: String(
        ingredient.dataVersions && ingredient.dataVersions.nutritionSourceReleaseId || ''
      )
    }
  }
}

function canonicalizeIngredients(ingredients = []) {
  return ingredients.map(canonicalizeIngredient).sort((left, right) => (
    left.conceptId.localeCompare(right.conceptId)
    || left.variantId.localeCompare(right.variantId)
  ))
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value))
}

function fnv1a(value) {
  let hash = 0x811c9dc5
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function fingerprint(value) {
  return `fnv1a32:${fnv1a(stableStringify(value))}`
}

module.exports = {
  INGREDIENT_CONTRACT_VERSION,
  canonicalizeIngredient,
  canonicalizeIngredients,
  stableStringify,
  fingerprint
}
