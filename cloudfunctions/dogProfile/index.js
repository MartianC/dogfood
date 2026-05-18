const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalize(doc) {
  return {
    id: doc._id,
    userId: doc._openid,
    name: doc.name,
    ageStage: doc.ageStage,
    weightKg: doc.weightKg,
    dailyMeals: doc.dailyMeals,
    breed: doc.breed || '',
    neutered: Boolean(doc.neutered),
    activityLevel: doc.activityLevel || 'normal',
    dietGoal: doc.dietGoal || 'daily',
    allergens: doc.allergens || [],
    avoidIngredients: doc.avoidIngredients || [],
    healthNotes: doc.healthNotes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

function validate(payload) {
  if (!payload.name) throw new Error('请填写狗狗名字')
  if (!payload.weightKg || payload.weightKg <= 0) throw new Error('请填写狗狗体重')
  if (!payload.dailyMeals || payload.dailyMeals <= 0) throw new Error('请填写每日餐数')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const collection = db.collection('dogs')
  const action = event.action || 'list'

  if (action === 'list') {
    const result = await collection.where({ _openid: wxContext.OPENID }).orderBy('updatedAt', 'desc').get()
    return result.data.map(normalize)
  }

  if (action === 'create') {
    validate(event.payload)
    const now = new Date()
    const result = await collection.add({
      data: {
        _openid: wxContext.OPENID,
        ...event.payload,
        createdAt: now,
        updatedAt: now
      }
    })
    const saved = await collection.doc(result._id).get()
    return normalize(saved.data)
  }

  if (action === 'update') {
    validate(event.payload)
    const existed = await collection.doc(event.id).get()
    if (existed.data._openid !== wxContext.OPENID) throw new Error('无权修改该档案')
    await collection.doc(event.id).update({
      data: {
        ...event.payload,
        updatedAt: new Date()
      }
    })
    const saved = await collection.doc(event.id).get()
    return normalize(saved.data)
  }

  if (action === 'delete') {
    const existed = await collection.doc(event.id).get()
    if (existed.data._openid !== wxContext.OPENID) throw new Error('无权删除该档案')
    await collection.doc(event.id).remove()
    return { ok: true }
  }

  throw new Error('不支持的操作')
}
