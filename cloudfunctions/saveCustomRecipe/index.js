const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

  const collection = db.collection('customRecipes')
  const now = new Date()
  const data = {
    _openid: wxContext.OPENID,
    ...payload,
    createdAt: payload.createdAt || now,
    updatedAt: now
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
