const env = require('../../../config/env')
const storage = require('../../../utils/storage')
const {
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  WEIGHT_CURRENT_WEIGHT_SOURCES,
  WEIGHT_DELETE_OUTCOMES,
  dateTextInShanghai,
  normalizeWeightMeasurementInput,
  normalizeWeightMeasurement,
  selectLatestValidWeightMeasurement,
  sortWeightMeasurements
} = require('../../../services/weightContract')

const STORAGE_KEY = 'mockWeightMeasurements'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
let clock = () => new Date()

function now() {
  return clock()
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function response(data = {}) {
  return {
    contract: 'weightRecord/v1',
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    ...data
  }
}

function getWeightRecordContract() {
  return response({
    measurementContract: 'weightMeasurement/v1',
    collection: 'weight_measurements',
    supportsHistory: true,
    supportsProfileSync: true,
    supportsDelete: true,
    maxPageSize: MAX_PAGE_SIZE
  })
}

function readDogs() {
  return storage.getSync('mockDogs', [])
}

function findOwnedDog(dogId) {
  const dog = readDogs().find((item) => (
    item.id === dogId
    && (item.userId === env.mockUser.id || item._openid === env.mockUser.id)
  ))
  if (!dog) throw new Error('无权使用该狗狗档案')
  return dog
}

function readStoredRecords(dogId) {
  const today = dateTextInShanghai(now())
  return storage.getSync(STORAGE_KEY, [])
    .filter((item) => item.userId === env.mockUser.id && item.dogId === dogId)
    .map((item) => normalizeWeightMeasurement({
      schemaVersion: item.schemaVersion,
      id: item.id,
      dogId: item.dogId,
      weightKg: item.weightKg,
      measuredOn: item.measuredOn,
      createdAt: item.createdAt
    }, { today }))
}

function currentWeightFromMeasurement(measurement) {
  if (!measurement) {
    return {
      source: WEIGHT_CURRENT_WEIGHT_SOURCES.NONE,
      weightKg: null,
      measuredOn: null,
      measurementId: null
    }
  }
  return {
    source: WEIGHT_CURRENT_WEIGHT_SOURCES.MEASUREMENT,
    weightKg: measurement.weightKg,
    measuredOn: measurement.measuredOn,
    measurementId: measurement.id
  }
}

function syncDogCurrentWeight(dogId, latestMeasurement) {
  const dogs = readDogs()
  const next = dogs.map((dog) => dog.id === dogId
    ? {
        ...dog,
        weightKg: latestMeasurement ? latestMeasurement.weightKg : null,
        updatedAt: now().toISOString()
      }
    : dog)
  storage.setSync('mockDogs', next)
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
    if (!cursor.measuredOn || !cursor.createdAt || !cursor.id) throw new Error('invalid')
    return cursor
  } catch (error) {
    throw new Error('体重测量分页游标无效')
  }
}

function isAfterCursor(record, cursor) {
  if (record.measuredOn !== cursor.measuredOn) return record.measuredOn < cursor.measuredOn
  if (record.createdAt !== cursor.createdAt) return record.createdAt < cursor.createdAt
  return record.id < cursor.id
}

function normalizePageSize(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(numeric, MAX_PAGE_SIZE)
}

async function listWeightMeasurements(options = {}) {
  const dogId = String(options.dogId || '').trim()
  if (!dogId) throw new Error('目标狗狗无效')
  findOwnedDog(dogId)
  const cursor = decodeCursor(options.cursor)
  const limit = normalizePageSize(options.limit)
  const records = sortWeightMeasurements(readStoredRecords(dogId))
  const filtered = cursor ? records.filter((record) => isAfterCursor(record, cursor)) : records
  const page = filtered.slice(0, limit)
  return response({
    dogId,
    items: clone(page),
    nextCursor: filtered.length > limit ? encodeCursor(page[page.length - 1]) : null
  })
}

async function createWeightMeasurement(payload) {
  const input = normalizeWeightMeasurementInput(payload, { today: dateTextInShanghai(now()) })
  findOwnedDog(input.dogId)
  const createdAt = now().toISOString()
  const measurement = normalizeWeightMeasurement({
    ...input,
    id: uid('weight'),
    createdAt
  }, { today: dateTextInShanghai(createdAt) })
  const stored = storage.getSync(STORAGE_KEY, [])
  storage.setSync(STORAGE_KEY, stored.concat({
    userId: env.mockUser.id,
    ...measurement
  }))
  const latest = selectLatestValidWeightMeasurement(
    readStoredRecords(input.dogId),
    { today: dateTextInShanghai(createdAt) }
  )
  syncDogCurrentWeight(input.dogId, latest)
  return response({
    measurement,
    currentWeight: currentWeightFromMeasurement(latest)
  })
}

async function updateWeightMeasurement(recordId, payload) {
  const input = normalizeWeightMeasurementInput(payload, { today: dateTextInShanghai(now()) })
  const records = storage.getSync(STORAGE_KEY, [])
  const target = records.find((item) => item.id === recordId && item.userId === env.mockUser.id)
  if (!target) throw new Error('未找到体重测量记录')
  if (target.dogId !== input.dogId) throw new Error('不能把体重记录转移到另一只狗狗')
  findOwnedDog(target.dogId)

  const createdAt = now().toISOString()
  const replacement = normalizeWeightMeasurement({
    ...input,
    id: uid('weight'),
    createdAt
  }, { today: dateTextInShanghai(createdAt) })
  storage.setSync(STORAGE_KEY, records
    .filter((item) => item.id !== recordId)
    .concat({ userId: env.mockUser.id, ...replacement }))
  const latest = selectLatestValidWeightMeasurement(
    readStoredRecords(target.dogId),
    { today: dateTextInShanghai(createdAt) }
  )
  syncDogCurrentWeight(target.dogId, latest)
  return response({
    dogId: target.dogId,
    replacedMeasurementId: recordId,
    replacement,
    currentWeight: currentWeightFromMeasurement(latest)
  })
}

async function getWeightMeasurement(recordId) {
  const record = storage.getSync(STORAGE_KEY, []).find((item) => (
    item.id === recordId && item.userId === env.mockUser.id
  ))
  if (!record) throw new Error('未找到体重测量记录')
  findOwnedDog(record.dogId)
  return response({
    measurement: normalizeWeightMeasurement(record, { today: dateTextInShanghai(now()) })
  })
}

async function deleteWeightMeasurement(recordId) {
  const records = storage.getSync(STORAGE_KEY, [])
  const target = records.find((item) => item.id === recordId && item.userId === env.mockUser.id)
  if (!target) throw new Error('未找到体重测量记录')
  findOwnedDog(target.dogId)
  const today = dateTextInShanghai(now())
  const before = readStoredRecords(target.dogId)
  const latestBefore = selectLatestValidWeightMeasurement(before, { today })
  storage.setSync(STORAGE_KEY, records.filter((item) => item.id !== recordId))
  const after = readStoredRecords(target.dogId)
  const latestAfter = selectLatestValidWeightMeasurement(after, { today })
  syncDogCurrentWeight(target.dogId, latestAfter)
  const deletedLatest = latestBefore && latestBefore.id === recordId
  return response({
    dogId: target.dogId,
    deletedMeasurementId: recordId,
    currentWeight: currentWeightFromMeasurement(latestAfter),
    outcome: deletedLatest
      ? latestAfter
        ? WEIGHT_DELETE_OUTCOMES.FALLBACK_TO_PREVIOUS
        : WEIGHT_DELETE_OUTCOMES.UNRECORDED
      : WEIGHT_DELETE_OUTCOMES.CURRENT_UNCHANGED
  })
}

function __setClockForTest(nextClock) {
  clock = nextClock
}

function __resetClockForTest() {
  clock = () => new Date()
}

module.exports = {
  STORAGE_KEY,
  getWeightRecordContract,
  listWeightMeasurements,
  createWeightMeasurement,
  updateWeightMeasurement,
  getWeightMeasurement,
  deleteWeightMeasurement,
  encodeCursor,
  decodeCursor,
  __setClockForTest,
  __resetClockForTest
}
