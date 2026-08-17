const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const { loadActiveRelease, validatePublishedIngredients } = require('./publishedDataValidation')
const { isIngredientAllergen } = require('./dogIngredientPolicy')

function normalize(doc) {
  return {
    id: doc._id,
    userId: doc._openid,
    targetDogIds: doc.targetDogIds || [],
    targetDogSnapshots: doc.targetDogSnapshots || [],
    title: doc.title,
    ingredients: doc.ingredients || [],
    adviceSummary: doc.adviceSummary || '',
    advices: doc.advices || [],
    adviceAlgorithmVersion: doc.adviceAlgorithmVersion,
    adviceAlgorithmSource: doc.adviceAlgorithmSource,
    status: doc.status || 'draft',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const payload = event.payload || {}
  if (!payload.title) throw new Error('请填写食谱名称')
  if (!Array.isArray(payload.ingredients) || !payload.ingredients.length) throw new Error('请添加食材')
  const release = await loadActiveRelease(db)
  await validatePublishedIngredients(db, payload.ingredients, release)
  const targetDogIds = Array.isArray(payload.targetDogIds) ? payload.targetDogIds : []
  for (const dogId of targetDogIds) {
    const dogResult = await db.collection('dogs').doc(String(dogId)).get()
    const dog = dogResult.data
    if (!dog || dog._openid !== wxContext.OPENID) throw new Error('无权使用该狗狗档案')
    if (payload.ingredients.some((ingredient) => isIngredientAllergen(ingredient, dog))) {
      throw new Error(`${dog.name || '狗狗'}的过敏食材不能保存到食谱`)
    }
  }

  const collection = db.collection('customRecipes')
  const now = new Date()
  const data = {
    _openid: wxContext.OPENID,
    title: String(payload.title).trim(),
    ingredients: payload.ingredients,
    targetDogIds,
    targetDogSnapshots: Array.isArray(payload.targetDogSnapshots) ? payload.targetDogSnapshots : [],
    adviceSummary: String(payload.adviceSummary || ''),
    advices: Array.isArray(payload.advices) ? payload.advices : [],
    adviceAlgorithmVersion: payload.adviceAlgorithmVersion || null,
    adviceAlgorithmSource: payload.adviceAlgorithmSource || null,
    status: payload.status || 'draft',
    createdAt: payload.createdAt || now,
    updatedAt: now,
    dataVersions: { ...((payload.dataVersions && typeof payload.dataVersions === 'object') ? payload.dataVersions : {}),
      runtimeReleaseId: release.release_id,
      catalogVersion: release.catalog_version,
      policyVersion: release.policy_version,
      nutritionSourceReleaseId: release.profile_release_id || null }
  }

  if (payload.id) {
    const existed = await collection.doc(payload.id).get()
    if (existed.data._openid !== wxContext.OPENID) throw new Error('无权修改该食谱')
    await collection.doc(payload.id).update({ data })
    const saved = await collection.doc(payload.id).get()
    return normalize(saved.data)
  }

  const result = await collection.add({ data })
  const saved = await collection.doc(result._id).get()
  return normalize(saved.data)
}
