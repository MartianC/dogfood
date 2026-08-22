const {
  CARE_RECORD_TYPES,
  validateCareRecordInput,
  normalizeCareRecord,
  validateCareRecord
} = require('./careRecordContract')

const COLLECTION_NAME = 'care_records'
const MAX_PAGE_SIZE = 20
const DEFAULT_UPCOMING_LIMIT = 3

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function toIsoTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) fail('INVALID_RECORD', '护理记录审计时间无效')
  return date.toISOString()
}

function normalizeStoredRecord(document) {
  const normalized = normalizeCareRecord({
    ...document,
    id: document.id || document._id,
    createdAt: toIsoTimestamp(document.createdAt),
    updatedAt: toIsoTimestamp(document.updatedAt)
  })
  try {
    return validateCareRecord(normalized)
  } catch (error) {
    fail('INVALID_RECORD', error.message)
  }
}

function validateWritePayload(payload) {
  try {
    return validateCareRecordInput(payload)
  } catch (error) {
    fail('INVALID_PAYLOAD', error.message)
  }
}

function validateType(type) {
  const normalized = String(type || '').trim()
  if (normalized && !CARE_RECORD_TYPES.includes(normalized)) {
    fail('INVALID_TYPE', '护理类型无效')
  }
  return normalized
}

async function assertDogOwnership(database, openId, dogId) {
  let result
  try {
    result = await database.collection('dogs').doc(String(dogId)).get()
  } catch (error) {
    fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  }
  if (!result.data || result.data._openid !== openId) {
    fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  }
}

async function getOwnedDocument(collection, openId, recordId) {
  let result
  try {
    result = await collection.doc(String(recordId || '')).get()
  } catch (error) {
    fail('NOT_FOUND', '未找到护理记录')
  }
  if (!result.data || result.data._openid !== openId) {
    fail('NOT_FOUND', '未找到护理记录')
  }
  return result.data
}

function decodeCursor(value) {
  if (!value) return null
  try {
    const cursor = JSON.parse(decodeURIComponent(String(value)))
    if (!cursor.occurredOn || !cursor.id) throw new Error('invalid')
    return cursor
  } catch (error) {
    fail('INVALID_CURSOR', '护理记录分页游标无效')
  }
}

function encodeCursor(record) {
  return encodeURIComponent(JSON.stringify({
    occurredOn: record.occurredOn,
    id: record._id || record.id
  }))
}

function pageLimit(value) {
  const requested = Number(value)
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.floor(requested), 1), MAX_PAGE_SIZE)
    : MAX_PAGE_SIZE
}

function normalizeDogIds(value) {
  if (!Array.isArray(value)) fail('INVALID_PAYLOAD', '首页护理事项缺少目标狗狗')
  const dogIds = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  if (!dogIds.length || dogIds.length > MAX_PAGE_SIZE) {
    fail('INVALID_PAYLOAD', '首页护理事项目标狗狗无效')
  }
  return dogIds
}

function validDateText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
}

function appendDateRangeConditions(database, event, conditions) {
  const startDate = String(event.startDate || '').trim()
  const endDate = String(event.endDate || '').trim()
  if (startDate && !validDateText(startDate)) fail('INVALID_DATE_RANGE', '护理查询开始日期无效')
  if (endDate && !validDateText(endDate)) fail('INVALID_DATE_RANGE', '护理查询结束日期无效')
  if (startDate && endDate && startDate >= endDate) {
    fail('INVALID_DATE_RANGE', '护理查询日期范围无效')
  }
  if (startDate) conditions.push({ occurredOn: database.command.gte(startDate) })
  if (endDate) conditions.push({ occurredOn: database.command.lt(endDate) })
}

function createCareRecordGateway({ database, openId }) {
  const collection = database.collection(COLLECTION_NAME)
  return async function gateway(event = {}) {
    if (!openId) fail('UNAUTHENTICATED', '请先登录')

    if (event.action === 'create') {
      const payload = validateWritePayload(event.payload)
      await assertDogOwnership(database, openId, payload.dogId)
      const timestamp = new Date()
      const document = {
        ...payload,
        _openid: openId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      const result = await collection.add({ data: document })
      return normalizeStoredRecord({ ...document, _id: result._id })
    }

    if (event.action === 'update') {
      const current = await getOwnedDocument(collection, openId, event.recordId)
      const payload = validateWritePayload(event.payload)
      if (payload.dogId !== current.dogId) fail('DOG_IMMUTABLE', '护理记录不能更换狗狗')
      const updatedAt = new Date()
      await collection.doc(String(event.recordId)).update({
        data: {
          type: payload.type,
          name: payload.name,
          occurredOn: payload.occurredOn,
          nextDate: payload.nextDate,
          notes: payload.notes,
          updatedAt
        }
      })
      const updated = await getOwnedDocument(collection, openId, event.recordId)
      return normalizeStoredRecord(updated)
    }

    if (event.action === 'delete') {
      await getOwnedDocument(collection, openId, event.recordId)
      await collection.doc(String(event.recordId)).remove()
      return { deleted: true, id: String(event.recordId) }
    }

    if (event.action === 'list') {
      const dogId = String(event.dogId || '').trim()
      if (!dogId) fail('INVALID_PAYLOAD', '护理列表缺少目标狗狗')
      await assertDogOwnership(database, openId, dogId)
      const type = validateType(event.type)
      const cursor = decodeCursor(event.cursor)
      const conditions = [{ _openid: openId }, { dogId }]
      if (type) conditions.push({ type })
      appendDateRangeConditions(database, event, conditions)
      if (cursor) {
        conditions.push(database.command.or([
          { occurredOn: database.command.lt(cursor.occurredOn) },
          { occurredOn: cursor.occurredOn, _id: database.command.lt(cursor.id) }
        ]))
      }
      const where = conditions.length === 1 ? conditions[0] : database.command.and(conditions)
      const result = await collection.where(where)
        .orderBy('occurredOn', 'desc')
        .orderBy('_id', 'desc')
        .limit(pageLimit(event.limit) + 1)
        .get()
      const rows = result.data || []
      const page = rows.slice(0, pageLimit(event.limit))
      return {
        items: page.map(normalizeStoredRecord),
        nextCursor: rows.length > page.length ? encodeCursor(page[page.length - 1]) : null
      }
    }

    if (event.action === 'listUpcoming') {
      const dogIds = normalizeDogIds(event.dogIds)
      const limit = event.limit == null ? DEFAULT_UPCOMING_LIMIT : pageLimit(event.limit)
      const result = await collection.where(database.command.and([
        { _openid: openId },
        { dogId: database.command.in(dogIds) },
        { nextDate: database.command.gte('0000-01-01') }
      ]))
        .orderBy('nextDate', 'asc')
        .orderBy('_id', 'asc')
        .limit(limit)
        .get()
      return {
        items: (result.data || []).map(normalizeStoredRecord)
      }
    }

    if (event.action === 'get') {
      const document = await getOwnedDocument(collection, openId, event.recordId)
      return normalizeStoredRecord(document)
    }

    fail('UNSUPPORTED_ACTION', '不支持的护理操作')
  }
}

async function main(event) {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return createCareRecordGateway({
    database: cloud.database(),
    openId: cloud.getWXContext().OPENID
  })(event)
}

module.exports = {
  main,
  createCareRecordGateway,
  validateWritePayload,
  encodeCursor,
  decodeCursor,
  normalizeDogIds
}
