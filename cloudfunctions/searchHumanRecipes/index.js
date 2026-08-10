function normalizeLimit(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) return 10
  return Math.min(numeric, 20)
}

function encodeCursor(document) {
  return encodeURIComponent(JSON.stringify({
    id: String(document._id || '')
  }))
}

function decodeCursor(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value)))
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('游标字段缺失')
    }
    return { id: parsed.id }
  } catch (error) {
    throw new Error('菜谱分页游标无效')
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function loadActiveRecipeVersion(database) {
  const result = await database.collection('data_releases')
    .where({ status: 'active' })
    .orderBy('generated_at', 'desc')
    .orderBy('_id', 'desc')
    .limit(1)
    .get()
  const release = Array.isArray(result.data) ? result.data[0] : null
  if (!release || !release.recipe_version) {
    throw new Error('未找到 active 人饭菜谱发布版本')
  }
  return String(release.recipe_version)
}

function normalizeRecipe(document) {
  return {
    id: String(document._id || ''),
    title: String(document.title || ''),
    ingredientPreviewVersion: 1,
    ingredients: Array.isArray(document.ingredients)
      ? document.ingredients.map((ingredient) => ({
        position: Number(ingredient.position || 0),
        raw_name: String(ingredient.raw_name || ''),
        amount_raw: ingredient.amount_raw == null
          ? null
          : String(ingredient.amount_raw),
        mapping_status: String(ingredient.mapping_status || 'unmatched'),
        components: Array.isArray(ingredient.components)
          ? ingredient.components.map((component) => ({
            display_name_zh: String(
              component.display_name_zh
              || component.canonical_name_zh
              || ''
            ),
            policy_status: String(component.policy_status || 'unknown')
          }))
          : []
      }))
      : []
  }
}

function createSearchHumanRecipes(database) {
  return async function searchHumanRecipes(event = {}) {
    const recipeVersion = await loadActiveRecipeVersion(database)
    const limit = normalizeLimit(event.limit)
    const keyword = String(event.query || '').trim()
    const cursor = decodeCursor(event.cursor)
    const conditions = [{
      recipe_version: recipeVersion,
      status: 'ready'
    }]
    if (keyword) {
      conditions.push({
        search_text: database.RegExp({
          regexp: escapeRegularExpression(keyword),
          options: 'i'
        })
      })
    }
    if (cursor) {
      conditions.push({ _id: database.command.gt(cursor.id) })
    }
    const condition = conditions.length === 1
      ? conditions[0]
      : database.command.and(conditions)
    const result = await database.collection('human_recipes')
      .where(condition)
      .orderBy('_id', 'asc')
      .limit(limit)
      .get()
    const rows = Array.isArray(result.data) ? result.data : []
    const page = rows.slice(0, limit)
    const response = {
      contract: 'searchHumanRecipes/v1',
      recipeVersion,
      items: page.map(normalizeRecipe),
      nextCursor: page.length === limit ? encodeCursor(page[page.length - 1]) : null
    }
    if (Buffer.byteLength(JSON.stringify(response), 'utf8') > 256 * 1024) {
      throw new Error('菜谱搜索响应超过 256 KB 合同预算')
    }
    return response
  }
}

async function main(event) {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return createSearchHumanRecipes(cloud.database())(event)
}

module.exports = {
  main,
  createSearchHumanRecipes,
  encodeCursor,
  decodeCursor
}
