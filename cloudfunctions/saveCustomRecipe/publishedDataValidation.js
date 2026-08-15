const KNOWN_STATUSES = new Set(['allowed', 'conditional', 'unknown', 'blocked'])

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function normalizeStatus(value) {
  const status = String(value || 'unknown').trim().toLowerCase()
  return KNOWN_STATUSES.has(status) ? status : 'unknown'
}

async function loadActiveRelease(database) {
  const result = await database.collection('data_releases').where({ status: 'active' })
    .orderBy('generated_at', 'desc').orderBy('_id', 'desc').limit(1).get()
  const release = result.data && result.data[0]
  if (!release) fail('ACTIVE_RELEASE_MISSING', '当前活动数据版本不可用')
  return release
}

function assertVersion(value, expected, message) {
  if (!value || expected == null || String(value) !== String(expected)) {
    fail('VERSION_CONFLICT', message)
  }
}

async function validatePublishedIngredients(database, ingredients, release) {
  if (!Array.isArray(ingredients) || !ingredients.length) fail('INVALID_INGREDIENT', '食谱食材不能为空')
  const seen = new Set()
  for (const ingredient of ingredients) {
    const foodId = String(ingredient.foodId || ingredient.food_id || ingredient.ingredientId || '')
    const conceptId = String(ingredient.conceptId || ingredient.concept_id || '')
    const variantId = String(ingredient.variantId || ingredient.variant_id || '')
    if (!foodId || !conceptId || !variantId) {
      fail('INVALID_INGREDIENT', '食材缺少已发布目录身份，请重新从食材库选择')
    }
    const versions = ingredient.dataVersions || ingredient.data_versions || {}
    assertVersion(versions.runtimeReleaseId || ingredient.runtimeReleaseId, release.release_id, '食材运行时版本已失效，请重新选择')
    assertVersion(versions.catalogVersion || ingredient.catalogVersion, release.catalog_version, '食材目录版本已失效，请重新选择')
    assertVersion(versions.policyVersion || ingredient.policyVersion, release.policy_version, '食材安全策略版本已失效，请重新选择')
    const key = `${conceptId}:${variantId}`
    if (seen.has(key)) continue
    seen.add(key)
    const result = await database.collection('ingredient_catalog').where({
      concept_id: conceptId, variant_id: variantId,
      catalog_version: release.catalog_version, policy_version: release.policy_version
    }).limit(1).get()
    const current = result.data && result.data[0]
    if (!current || String(current.food_id || '') !== foodId) {
      fail('INGREDIENT_NOT_FOUND', '食材目录身份已失效，请重新选择')
    }
    if (normalizeStatus(current.policy_status) === 'blocked') {
      fail('BLOCKED_INGREDIENT', '明确阻止食材不可保存')
    }
  }
}

module.exports = { loadActiveRelease, validatePublishedIngredients }
