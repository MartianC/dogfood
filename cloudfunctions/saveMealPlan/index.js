const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const { loadActiveRelease, validatePublishedIngredients } = require('./publishedDataValidation')

function normalize(doc) {
  return {
    id: doc._id,
    userId: doc._openid,
    targetDogIds: doc.targetDogIds || [],
    targetMode: doc.targetMode,
    targetDogSnapshots: doc.targetDogSnapshots || [],
    sourceType: doc.sourceType,
    recipeId: doc.recipeId || '',
    customRecipeId: doc.customRecipeId || '',
    recipeName: doc.recipeName,
    recipeSnapshot: doc.recipeSnapshot || {},
    periodDays: doc.periodDays,
    calculationParams: doc.calculationParams || {},
    algorithmVersion: doc.algorithmVersion,
    algorithmSource: doc.algorithmSource,
    totalPortions: doc.totalPortions,
    dogMealSummaries: doc.dogMealSummaries || [],
    totalItems: doc.totalItems || [],
    cookingSteps: doc.cookingSteps || [],
    warnings: doc.warnings || [],
    shareImageFileId: doc.shareImageFileId || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const collection = db.collection('mealPlans')

  if (event.action === 'list') {
    const result = await collection.where({ _openid: wxContext.OPENID }).orderBy('createdAt', 'desc').limit(50).get()
    return result.data.map(normalize)
  }

  const payload = event.payload || {}
  if (!payload.recipeName) throw new Error('缺少清单食谱名称')
  if (!payload.algorithmVersion || !payload.algorithmSource) throw new Error('缺少算法版本信息')
  if (!Array.isArray(payload.targetDogSnapshots) || !payload.targetDogSnapshots.length) throw new Error('缺少制作对象快照')
  const release = await loadActiveRelease(db)
  const ingredients = Array.isArray(payload.totalItems) ? payload.totalItems : []
  await validatePublishedIngredients(db, ingredients, release)

  const now = new Date()
  const result = await collection.add({
    data: {
      _openid: wxContext.OPENID,
      targetDogIds: Array.isArray(payload.targetDogIds) ? payload.targetDogIds : [],
      targetMode: payload.targetMode || null,
      targetDogSnapshots: payload.targetDogSnapshots,
      sourceType: payload.sourceType || null,
      recipeId: payload.recipeId || '',
      customRecipeId: payload.customRecipeId || '',
      recipeName: String(payload.recipeName).trim(),
      recipeSnapshot: payload.recipeSnapshot || {},
      periodDays: Number(payload.periodDays),
      calculationParams: payload.calculationParams || {},
      algorithmVersion: payload.algorithmVersion,
      algorithmSource: payload.algorithmSource,
      totalPortions: Number(payload.totalPortions || 0),
      dogMealSummaries: Array.isArray(payload.dogMealSummaries) ? payload.dogMealSummaries : [],
      totalItems: ingredients,
      cookingSteps: Array.isArray(payload.cookingSteps) ? payload.cookingSteps : [],
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      shareImageFileId: payload.shareImageFileId || '',
      dataVersions: { ...(payload.dataVersions || {}), runtimeReleaseId: release.release_id,
        catalogVersion: release.catalog_version, policyVersion: release.policy_version,
        nutritionSourceReleaseId: release.profile_release_id || null },
      createdAt: payload.createdAt || now,
      updatedAt: now
    }
  })
  const saved = await collection.doc(result._id).get()
  return normalize(saved.data)
}
