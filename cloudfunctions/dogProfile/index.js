const cloud = require('wx-server-sdk')
const { fieldsForWrite, normalizeProfileDocument } = require('./profileValidation')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const collection = db.collection('dogs')
  const action = event.action || 'list'

  if (action === 'contract') {
    return {
      contract: 'dogProfile/v3',
      schemaVersion: 3,
      supportsSpecialNutritionNeeds: true
    }
  }

  if (action === 'list') {
    const result = await collection.where({ _openid: wxContext.OPENID }).orderBy('updatedAt', 'desc').get()
    return result.data.map(normalizeProfileDocument)
  }

  if (action === 'create') {
    const fields = fieldsForWrite(event.payload, { initializeHiddenFields: true })
    const now = new Date()
    const result = await collection.add({
      data: {
        _openid: wxContext.OPENID,
        ...fields,
        createdAt: now,
        updatedAt: now
      }
    })
    const saved = await collection.doc(result._id).get()
    return normalizeProfileDocument(saved.data)
  }

  if (action === 'update') {
    const fields = fieldsForWrite(event.payload)
    const existed = await collection.doc(event.id).get()
    if (existed.data._openid !== wxContext.OPENID) throw new Error('无权修改该档案')
    await collection.doc(event.id).update({
      data: {
        ...fields,
        updatedAt: new Date()
      }
    })
    const saved = await collection.doc(event.id).get()
    return normalizeProfileDocument(saved.data)
  }

  if (action === 'delete') {
    const existed = await collection.doc(event.id).get()
    if (existed.data._openid !== wxContext.OPENID) throw new Error('无权删除该档案')
    await collection.doc(event.id).remove()
    return { ok: true }
  }

  throw new Error('不支持的操作')
}
