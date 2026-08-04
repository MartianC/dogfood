const storage = require('../../../utils/storage')
const env = require('../../../config/env')
const contract = require('../../../contracts/care/careRecordContract')

const STORAGE_KEY = 'mockCareRecords'

function now() {
  return new Date().toISOString()
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ownedDog(dogId) {
  const dog = storage.getSync('mockDogs', []).find((item) => (
    String(item.id || item._id) === dogId
    && String(item.userId || item._openid || env.mockUser.id) === String(env.mockUser.id)
  ))
  if (!dog) fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  return dog
}

function readRecords() {
  return storage.getSync(STORAGE_KEY, [])
}

function encodeCursor(record) {
  return encodeURIComponent(JSON.stringify({
    occurredOn: record.occurredOn,
    id: record.id
  }))
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

function validatePayload(payload) {
  try {
    return contract.validateCareRecordInput(payload)
  } catch (error) {
    fail('INVALID_PAYLOAD', error.message)
  }
}

async function createCareRecord(payload) {
  const input = validatePayload(payload)
  ownedDog(input.dogId)
  const timestamp = now()
  const record = contract.validateCareRecord({
    ...input,
    id: uid('care'),
    createdAt: timestamp,
    updatedAt: timestamp
  })
  storage.setSync(STORAGE_KEY, readRecords().concat(record))
  return clone(record)
}

async function updateCareRecord(recordId, payload) {
  const id = String(recordId || '')
  const records = readRecords()
  const current = records.find((item) => item.id === id)
  if (!current) fail('NOT_FOUND', '未找到护理记录')
  ownedDog(current.dogId)

  const input = validatePayload(payload)
  if (input.dogId !== current.dogId) fail('DOG_IMMUTABLE', '护理记录不能更换狗狗')
  const updated = contract.validateCareRecord({
    ...current,
    ...input,
    id,
    updatedAt: now()
  })
  storage.setSync(STORAGE_KEY, records.map((item) => item.id === id ? updated : item))
  return clone(updated)
}

async function deleteCareRecord(recordId) {
  const id = String(recordId || '')
  const records = readRecords()
  const current = records.find((item) => item.id === id)
  if (!current) fail('NOT_FOUND', '未找到护理记录')
  ownedDog(current.dogId)
  storage.setSync(STORAGE_KEY, records.filter((item) => item.id !== id))
  return { deleted: true, id }
}

async function listCareRecords(options = {}) {
  const dogId = String(options.dogId || '')
  ownedDog(dogId)
  const type = String(options.type || '')
  if (type && !contract.CARE_RECORD_TYPES.includes(type)) fail('INVALID_TYPE', '护理类型无效')
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 20)
  const cursor = decodeCursor(options.cursor)
  const records = readRecords()
    .filter((item) => item.dogId === dogId && (!type || item.type === type))
    .sort((left, right) => (
      right.occurredOn.localeCompare(left.occurredOn)
      || right.id.localeCompare(left.id)
    ))
  const cursorIndex = cursor
    ? records.findIndex((item) => item.occurredOn === cursor.occurredOn && item.id === cursor.id)
    : -1
  if (cursor && cursorIndex < 0) fail('INVALID_CURSOR', '护理记录分页游标无效')
  const start = cursor ? cursorIndex + 1 : 0
  const page = records.slice(start, start + limit)
  return {
    items: clone(page),
    nextCursor: records.length > start + page.length && page.length
      ? encodeCursor(page[page.length - 1])
      : null
  }
}

async function getCareRecord(recordId) {
  const current = readRecords().find((item) => item.id === String(recordId || ''))
  if (!current) fail('NOT_FOUND', '未找到护理记录')
  ownedDog(current.dogId)
  return clone(current)
}

module.exports = {
  createCareRecord,
  updateCareRecord,
  deleteCareRecord,
  listCareRecords,
  getCareRecord,
  encodeCursor,
  decodeCursor
}
