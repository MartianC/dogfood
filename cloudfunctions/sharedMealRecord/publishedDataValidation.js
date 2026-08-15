const { canAddIngredient } = require('./ingredientOperationRules')

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

async function loadActiveRelease(database) {
  const result = await database.collection('data_releases')
    .where({ status: 'active' })
    .orderBy('generated_at', 'desc')
    .orderBy('_id', 'desc')
    .limit(1)
    .get()
  const release = result.data && result.data[0]
  if (!release) fail('ACTIVE_RELEASE_MISSING', '当前活动数据版本不可用')
  return release
}

function assertVersion(value, expected, code, message) {
  if (!value || expected == null || String(value) !== String(expected)) fail(code, message)
}

function assertActiveIngredientVersions(ingredient, release) {
  const versions = ingredient.dataVersions || ingredient.data_versions || {}
  assertVersion(versions.runtimeReleaseId || ingredient.runtimeReleaseId, release.release_id,
    'VERSION_CONFLICT', '食材运行时版本已失效，请重新选择')
  assertVersion(versions.catalogVersion || ingredient.catalogVersion, release.catalog_version,
    'VERSION_CONFLICT', '食材目录版本已失效，请重新选择')
  assertVersion(versions.policyVersion || ingredient.policyVersion, release.policy_version,
    'VERSION_CONFLICT', '食材安全策略版本已失效，请重新选择')
  if (release.profile_release_id) {
    assertVersion(versions.nutritionSourceReleaseId || ingredient.nutritionSourceReleaseId,
      release.profile_release_id, 'VERSION_CONFLICT', '食材营养来源版本已失效，请重新选择')
  }
  return versions
}

function ingredientIdentity(ingredient) {
  return {
    foodId: String(ingredient.foodId || ingredient.food_id || ingredient.ingredientId || ''),
    conceptId: String(ingredient.conceptId || ingredient.concept_id || ''),
    variantId: String(ingredient.variantId || ingredient.variant_id || '')
  }
}

async function validatePublishedIngredients(database, ingredients, release) {
  if (!Array.isArray(ingredients) || !ingredients.length) fail('INVALID_INGREDIENT', '食谱食材不能为空')
  const seen = new Set()
  for (const ingredient of ingredients) {
    const identity = ingredientIdentity(ingredient)
    if (!identity.foodId || !identity.conceptId || !identity.variantId) {
      fail('INVALID_INGREDIENT', '食材缺少已发布目录身份，请重新从食材库选择')
    }
    const versions = assertActiveIngredientVersions(ingredient, release)
    const key = `${identity.conceptId}:${identity.variantId}`
    if (seen.has(key)) continue
    seen.add(key)
    const result = await database.collection('ingredient_catalog').where({
      concept_id: identity.conceptId,
      variant_id: identity.variantId,
      catalog_version: versions.catalogVersion || release.catalog_version,
      policy_version: versions.policyVersion || release.policy_version
    }).limit(1).get()
    const current = result.data && result.data[0]
    if (!current || String(current.food_id || '') !== identity.foodId) {
      fail('INGREDIENT_NOT_FOUND', '食材目录身份已失效，请重新选择')
    }
    if (!canAddIngredient(current)) fail('BLOCKED_INGREDIENT', '明确阻止食材不可保存')
  }
}

module.exports = {
  loadActiveRelease,
  validatePublishedIngredients,
  ingredientIdentity
}
