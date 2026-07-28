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

function createGetHumanRecipe(database) {
  return async function getHumanRecipe(event = {}) {
    const recipeId = String(event.recipeId || '').trim()
    if (!recipeId || recipeId.length > 160) throw new Error('recipeId 无效')
    const recipeVersion = await loadActiveRecipeVersion(database)
    const result = await database.collection('human_recipes').where({
      _id: recipeId,
      recipe_version: recipeVersion,
      status: 'ready'
    }).limit(1).get()
    const document = Array.isArray(result.data) ? result.data[0] : null
    if (!document) throw new Error('未找到已发布菜谱')
    return {
      contract: 'getHumanRecipe/v1',
      recipeVersion,
      recipe: {
        ...document,
        id: document._id,
        ingredients: Array.isArray(document.ingredients) ? document.ingredients : []
      }
    }
  }
}

async function main(event) {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return createGetHumanRecipe(cloud.database())(event)
}

module.exports = {
  main,
  createGetHumanRecipe
}
