const {
  WEIGHT_MEASUREMENT_CONTRACT,
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  WEIGHT_DELETE_OUTCOMES,
  dateTextInShanghai,
  parseDateText,
  isValidTimestamp,
  normalizeWeightMeasurementInput,
  normalizeWeightMeasurement,
  selectLatestValidWeightMeasurement
} = require('./weightContract')

const COLLECTION_NAME = 'weight_measurements'
const DOG_COLLECTION_NAME = 'dogs'
const SERVICE_CONTRACT = 'weightRecord/v1'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function requireOpenId(openId) {
  if (!String(openId || '').trim()) fail('UNAUTHENTICATED', '请先登录')
  return String(openId).trim()
}

function requireDogId(value) {
  const dogId = String(value || '').trim()
  if (!dogId || dogId.length > 160) fail('INVALID_DOG', '目标狗狗无效')
  return dogId
}

function requireRecordId(value) {
  const recordId = String(value || '').trim()
  if (!recordId || recordId.length > 160) fail('INVALID_RECORD', '体重测量记录 ID 无效')
  return recordId
}

function timestampText(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString()
}

function normalizeStoredMeasurement(document, options = {}) {
  const record = {
    schemaVersion: Number(document.schemaVersion),
    id: String(document._id || document.id || '').trim(),
    dogId: String(document.dogId || '').trim(),
    weightKg: Number(document.weightKg),
    measuredOn: String(document.measuredOn || '').trim(),
    createdAt: timestampText(document.createdAt)
  }
  return normalizeWeightMeasurement(record, options)
}

function currentWeightFromMeasurement(measurement) {
  if (!measurement) {
    return {
      source: 'none',
      weightKg: null,
      measuredOn: null,
      measurementId: null
    }
  }
  return {
    source: 'measurement',
    weightKg: measurement.weightKg,
    measuredOn: measurement.measuredOn,
    measurementId: measurement.id
  }
}

function normalizePageSize(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(numeric, MAX_PAGE_SIZE)
}

function encodeCursor(record) {
  return encodeURIComponent(JSON.stringify({
    measuredOn: record.measuredOn,
    createdAt: record.createdAt,
    id: record.id
  }))
}

function decodeCursor(value) {
  if (!value) return null
  try {
    const cursor = JSON.parse(decodeURIComponent(String(value)))
    if (
      !cursor
      || typeof cursor.measuredOn !== 'string'
      || !parseDateText(cursor.measuredOn)
      || typeof cursor.createdAt !== 'string'
      || !isValidTimestamp(cursor.createdAt)
      || typeof cursor.id !== 'string'
      || !cursor.id
    ) throw new Error('invalid')
    return cursor
  } catch (error) {
    fail('INVALID_CURSOR', '体重测量分页游标无效')
  }
}

function buildCursorCondition(database, cursor) {
  if (!cursor) return null
  const command = database.command
  return command.or([
    { measuredOn: command.lt(cursor.measuredOn) },
    command.and([
      { measuredOn: cursor.measuredOn },
      { createdAt: command.lt(new Date(cursor.createdAt)) }
    ]),
    command.and([
      { measuredOn: cursor.measuredOn },
      { createdAt: new Date(cursor.createdAt) },
      { _id: command.lt(cursor.id) }
    ])
  ])
}

function appendDateRangeConditions(database, event, conditions) {
  const startDate = String(event.startDate || '').trim()
  const endDate = String(event.endDate || '').trim()
  if (startDate && !parseDateText(startDate)) fail('INVALID_DATE_RANGE', '体重查询开始日期无效')
  if (endDate && !parseDateText(endDate)) fail('INVALID_DATE_RANGE', '体重查询结束日期无效')
  if (startDate && endDate && startDate >= endDate) {
    fail('INVALID_DATE_RANGE', '体重查询日期范围无效')
  }
  if (startDate) conditions.push({ measuredOn: database.command.gte(startDate) })
  if (endDate) conditions.push({ measuredOn: database.command.lt(endDate) })
}

async function getOwnedDog(database, openId, dogId) {
  let result
  try {
    result = await database.collection(DOG_COLLECTION_NAME).doc(dogId).get()
  } catch (error) {
    fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  }
  if (!result || !result.data || result.data._openid !== openId) {
    fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  }
  return result.data
}

async function getOwnedMeasurement(collection, openId, recordId) {
  let result
  try {
    result = await collection.doc(String(recordId)).get()
  } catch (error) {
    fail('NOT_FOUND', '未找到体重测量记录')
  }
  if (!result || !result.data || result.data._openid !== openId) {
    fail('NOT_FOUND', '未找到体重测量记录')
  }
  return result.data
}

async function findLatestMeasurement(database, openId, dogId, options = {}, extra = []) {
  const result = await database.collection(COLLECTION_NAME)
    .where({ _openid: openId, dogId })
    .orderBy('measuredOn', 'desc')
    .orderBy('createdAt', 'desc')
    .orderBy('_id', 'desc')
    .limit(1)
    .get()
  const records = (result.data || []).map((document) => {
    try {
      return normalizeStoredMeasurement(document, options)
    } catch (error) {
      return null
    }
  }).filter(Boolean)
  return selectLatestValidWeightMeasurement(records.concat(extra), options)
}

async function syncDogCurrentWeight(database, dogId, latestMeasurement) {
  await database.collection(DOG_COLLECTION_NAME).doc(dogId).update({
    data: {
      weightKg: latestMeasurement ? latestMeasurement.weightKg : null,
      updatedAt: new Date()
    }
  })
}

async function runAtomic(database, operation) {
  if (typeof database.runTransaction === 'function') {
    return database.runTransaction(operation)
  }
  if (typeof database.startTransaction !== 'function') {
    throw new Error('体重记录服务缺少事务能力')
  }
  const transaction = await database.startTransaction()
  try {
    const result = await operation(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

function response(data = {}) {
  return {
    contract: SERVICE_CONTRACT,
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    ...data
  }
}

function assertServiceContract() {
  return response({
    measurementContract: WEIGHT_MEASUREMENT_CONTRACT,
    collection: COLLECTION_NAME,
    supportsHistory: true,
    supportsProfileSync: true,
    supportsDelete: true,
    maxPageSize: MAX_PAGE_SIZE
  })
}

function createWeightRecordGateway({ database, openId, now = () => new Date() }) {
  if (!database || typeof database.collection !== 'function') {
    throw new Error('体重记录服务缺少数据库连接')
  }

  return async function gateway(event = {}) {
    const action = String(event.action || 'list')
    if (action === 'contract') return assertServiceContract()

    const ownerId = requireOpenId(openId)
    if (action === 'create') {
      const input = normalizeWeightMeasurementInput(event.payload, {
        today: dateTextInShanghai(now())
      })
      return runAtomic(database, async (transaction) => {
        await getOwnedDog(transaction, ownerId, input.dogId)
        const createdAt = now()
        const data = {
          _openid: ownerId,
          ...input,
          createdAt
        }
        const result = await transaction.collection(COLLECTION_NAME).add({ data })
        const measurement = normalizeStoredMeasurement({
          ...data,
          _id: result._id
        }, { today: dateTextInShanghai(createdAt) })
        const latest = await findLatestMeasurement(
          transaction,
          ownerId,
          input.dogId,
          { today: dateTextInShanghai(createdAt) },
          [measurement]
        )
        await syncDogCurrentWeight(transaction, input.dogId, latest)
        return response({
          measurement,
          currentWeight: currentWeightFromMeasurement(latest)
        })
      })
    }

    if (action === 'replace') {
      const recordId = requireRecordId(event.recordId)
      const input = normalizeWeightMeasurementInput(event.payload, {
        today: dateTextInShanghai(now())
      })
      return runAtomic(database, async (transaction) => {
        const originalDocument = await getOwnedMeasurement(
          transaction.collection(COLLECTION_NAME),
          ownerId,
          recordId
        )
        const original = normalizeStoredMeasurement(originalDocument)
        if (input.dogId !== original.dogId) {
          fail('INVALID_DOG', '不能把体重记录转移到另一只狗狗')
        }
        await getOwnedDog(transaction, ownerId, original.dogId)
        const createdAt = now()
        const data = {
          _openid: ownerId,
          ...input,
          createdAt
        }
        const added = await transaction.collection(COLLECTION_NAME).add({ data })
        await transaction.collection(COLLECTION_NAME).doc(recordId).remove()
        const replacement = normalizeStoredMeasurement({
          ...data,
          _id: added._id
        }, { today: dateTextInShanghai(createdAt) })
        const latest = await findLatestMeasurement(
          transaction,
          ownerId,
          original.dogId,
          { today: dateTextInShanghai(createdAt) },
          [replacement]
        )
        await syncDogCurrentWeight(transaction, original.dogId, latest)
        return response({
          dogId: original.dogId,
          replacedMeasurementId: recordId,
          replacement,
          currentWeight: currentWeightFromMeasurement(latest)
        })
      })
    }

    if (action === 'list') {
      const dogId = requireDogId(event.dogId)
      await getOwnedDog(database, ownerId, dogId)
      const cursor = decodeCursor(event.cursor)
      const limit = normalizePageSize(event.limit)
      const conditions = [{ _openid: ownerId }, { dogId }]
      appendDateRangeConditions(database, event, conditions)
      const cursorCondition = buildCursorCondition(database, cursor)
      if (cursorCondition) conditions.push(cursorCondition)
      const where = conditions.length === 1
        ? conditions[0]
        : database.command.and(conditions)
      const result = await database.collection(COLLECTION_NAME)
        .where(where)
        .orderBy('measuredOn', 'desc')
        .orderBy('createdAt', 'desc')
        .orderBy('_id', 'desc')
        .limit(limit + 1)
        .get()
      const items = (result.data || []).slice(0, limit).map((document) => (
        normalizeStoredMeasurement(document)
      ))
      return response({
        dogId,
        items,
        nextCursor: (result.data || []).length > limit
          ? encodeCursor(items[items.length - 1])
          : null
      })
    }

    if (action === 'get') {
      const recordId = requireRecordId(event.recordId)
      const document = await getOwnedMeasurement(
        database.collection(COLLECTION_NAME),
        ownerId,
        recordId
      )
      return response({ measurement: normalizeStoredMeasurement(document) })
    }

    if (action === 'delete') {
      const recordId = requireRecordId(event.recordId)
      return runAtomic(database, async (transaction) => {
        const document = await getOwnedMeasurement(
          transaction.collection(COLLECTION_NAME),
          ownerId,
          recordId
        )
        const record = normalizeStoredMeasurement(document)
        await getOwnedDog(transaction, ownerId, record.dogId)
        const latestBefore = await findLatestMeasurement(transaction, ownerId, record.dogId)
        await transaction.collection(COLLECTION_NAME).doc(recordId).remove()
        const latestAfter = await findLatestMeasurement(transaction, ownerId, record.dogId)
        await syncDogCurrentWeight(transaction, record.dogId, latestAfter)
        const deletedLatest = latestBefore && latestBefore.id === recordId
        return response({
          dogId: record.dogId,
          deletedMeasurementId: recordId,
          currentWeight: currentWeightFromMeasurement(latestAfter),
          outcome: deletedLatest
            ? latestAfter
              ? WEIGHT_DELETE_OUTCOMES.FALLBACK_TO_PREVIOUS
              : WEIGHT_DELETE_OUTCOMES.UNRECORDED
            : WEIGHT_DELETE_OUTCOMES.CURRENT_UNCHANGED
        })
      })
    }

    fail('UNSUPPORTED_ACTION', '不支持的体重记录操作')
  }
}

async function main(event) {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return createWeightRecordGateway({
    database: cloud.database(),
    openId: cloud.getWXContext().OPENID
  })(event)
}

module.exports = {
  main,
  createWeightRecordGateway,
  assertServiceContract,
  encodeCursor,
  decodeCursor,
  normalizeStoredMeasurement,
  runAtomic,
  currentWeightFromMeasurement,
  findLatestMeasurement
}
