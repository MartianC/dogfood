const env = require('../../../config/env')
const {
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  normalizeWeightMeasurementInput,
  normalizeWeightMeasurement
} = require('../../../services/weightContract')
const cloudAdapter = require('./weightCloudbaseAdapter')
const mockAdapter = require('./weightMockAdapter')

let adapter = env.useCloudBase ? cloudAdapter : mockAdapter

const ERROR_DEFINITIONS = [
  {
    code: 'FUNCTION_NOT_DEPLOYED',
    message: '体重服务尚未部署',
    retryable: false,
    matches: (text, cloudCode) => cloudCode === '-501000'
      || /FUNCTION_NOT_FOUND|云函数不存在|FunctionName parameter could not be found/i.test(text)
  },
  {
    code: 'STORAGE_NOT_READY',
    message: '体重存储尚未就绪',
    retryable: false,
    matches: (text) => /NamespaceNotFound|DATABASE_(?:COLLECTION|INDEX)_NOT_EXIST/i.test(text)
      || /(?:Db or Table|ns)[^\n]*not exist/i.test(text)
      || /collection[^\n]*(?:not (?:found|exist)|does not exist)/i.test(text)
      || /(?:no matching index|index[^\n]*not (?:found|exist)|requires? an index)/i.test(text)
      || /(?:索引[^\n]*不存在|需要[^\n]*索引)/i.test(text)
  },
  {
    code: 'UNAUTHENTICATED',
    message: '请先登录',
    retryable: false,
    matches: (text) => /UNAUTHENTICATED|请先登录|未登录|not logged in/i.test(text)
  },
  {
    code: 'FORBIDDEN',
    message: '无权执行该体重操作',
    retryable: false,
    matches: (text) => /FORBIDDEN|PERMISSION_DENIED|permission denied|not authorized|无权|没有权限/i.test(text)
  },
  {
    code: 'RECORD_NOT_FOUND',
    message: '未找到体重测量记录',
    retryable: false,
    matches: (text) => /\bNOT_FOUND\b|未找到体重测量记录|record[^\n]*not found/i.test(text)
  },
  {
    code: 'NETWORK_ERROR',
    message: '网络连接失败，请稍后重试',
    retryable: true,
    matches: (text) => /network|request:fail|timeout|timed out|ECONN|socket|offline|网络/i.test(text)
  }
]

class WeightRecordError extends Error {
  constructor({ code, message, retryable, operation, cause, cloudCode = '' }) {
    super(message)
    this.name = 'WeightRecordError'
    this.code = code
    this.retryable = retryable
    this.operation = operation
    this.cause = cause
    this.cloudCode = cloudCode
  }
}

function mapWeightError(error, operation) {
  if (!error || error.name !== 'WeightFunctionCallError') return error
  const text = String(error.cloudText || '')
  const cloudCode = String(error.cloudCode || '')
  const definition = ERROR_DEFINITIONS.find((item) => item.matches(text, cloudCode)) || {
    code: 'UNKNOWN',
    message: '体重服务暂时不可用',
    retryable: false
  }
  return new WeightRecordError({
    ...definition,
    operation,
    cause: error.cause,
    cloudCode
  })
}

async function execute(operation, invoke) {
  try {
    return await invoke()
  } catch (error) {
    throw mapWeightError(error, operation)
  }
}

function assertWeightRecordServiceContract(contract) {
  if (
    !contract
    || contract.contract !== 'weightRecord/v1'
    || contract.schemaVersion !== WEIGHT_MEASUREMENT_SCHEMA_VERSION
    || contract.measurementContract !== 'weightMeasurement/v1'
    || contract.supportsHistory !== true
    || contract.supportsProfileSync !== true
    || contract.supportsDelete !== true
  ) throw new Error('体重服务版本过旧，请更新 weightRecord 云函数后重试')
  return contract
}

async function ensureCapability() {
  return assertWeightRecordServiceContract(
    await execute('contract', () => adapter.getWeightRecordContract())
  )
}

function dogIdOf(options) {
  const dogId = String(options && options.dogId || '').trim()
  if (!dogId) throw new Error('目标狗狗无效')
  return dogId
}

async function list(options = {}) {
  const dogId = dogIdOf(options)
  const result = await execute('list', () => adapter.listWeightMeasurements({
    ...options,
    dogId
  }))
  return {
    dogId,
    items: (result.items || []).map((item) => normalizeWeightMeasurement(item)),
    nextCursor: result.nextCursor || null
  }
}

async function create(payload = {}) {
  const input = normalizeWeightMeasurementInput({
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    ...payload
  })
  await ensureCapability()
  const result = await execute('create', () => adapter.createWeightMeasurement(input))
  return {
    measurement: normalizeWeightMeasurement(result.measurement),
    currentWeight: result.currentWeight
  }
}

async function update(recordId, payload = {}) {
  const id = String(recordId || '').trim()
  if (!id) throw new Error('体重测量记录 ID 无效')
  const input = normalizeWeightMeasurementInput({
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    ...payload
  })
  await ensureCapability()
  const result = await execute('update', () => adapter.updateWeightMeasurement(id, input))
  return {
    replacedMeasurementId: result.replacedMeasurementId,
    replacement: normalizeWeightMeasurement(result.replacement),
    currentWeight: result.currentWeight
  }
}

async function get(recordId) {
  const id = String(recordId || '').trim()
  if (!id) throw new Error('体重测量记录 ID 无效')
  const result = await execute('get', () => adapter.getWeightMeasurement(id))
  return normalizeWeightMeasurement(result.measurement)
}

async function remove(recordId) {
  const id = String(recordId || '').trim()
  if (!id) throw new Error('体重测量记录 ID 无效')
  await ensureCapability()
  const result = await execute('delete', () => adapter.deleteWeightMeasurement(id))
  return {
    dogId: result.dogId,
    deletedMeasurementId: result.deletedMeasurementId,
    currentWeight: result.currentWeight,
    outcome: result.outcome
  }
}

function __setAdapterForTest(nextAdapter) {
  adapter = nextAdapter
}

function __resetAdapterForTest() {
  adapter = env.useCloudBase ? cloudAdapter : mockAdapter
}

module.exports = {
  list,
  create,
  update,
  get,
  remove,
  assertWeightRecordServiceContract,
  mapWeightError,
  WeightRecordError,
  __setAdapterForTest,
  __resetAdapterForTest
}
