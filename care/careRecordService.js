const env = require('../config/env')
const contract = require('../contracts/care/careRecordContract')
const adapter = env.useCloudBase
  ? require('./adapters/careRecordCloudbase')
  : require('./adapters/careRecordMock')

const ERROR_DEFINITIONS = [
  {
    code: 'FUNCTION_NOT_DEPLOYED',
    message: '护理服务尚未部署',
    retryable: false,
    matches: (text, cloudCode) => cloudCode === '-501000'
      || /FUNCTION_NOT_FOUND|云函数不存在|FunctionName parameter could not be found/i.test(text)
  },
  {
    code: 'STORAGE_NOT_READY',
    message: '护理存储尚未就绪',
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
    message: '无权执行该护理操作',
    retryable: false,
    matches: (text) => /FORBIDDEN|PERMISSION_DENIED|permission denied|not authorized|无权|没有权限/i.test(text)
  },
  {
    code: 'CARE_RECORD_NOT_FOUND',
    message: '未找到护理记录',
    retryable: false,
    matches: (text) => /\b(?:NOT_FOUND|CARE_RECORD_NOT_FOUND)\b|未找到护理记录|护理记录[^\n]*not found/i.test(text)
  },
  {
    code: 'VALIDATION_ERROR',
    message: '护理记录数据无效',
    retryable: false,
    matches: (text) => /INVALID_PAYLOAD|INVALID_TYPE|INVALID_DATE|护理类型无效|护理记录数据无效/i.test(text)
  },
  {
    code: 'DOG_IMMUTABLE',
    message: '护理记录不能更换狗狗',
    retryable: false,
    matches: (text, cloudCode) => cloudCode === 'DOG_IMMUTABLE' || /不能更换狗狗/i.test(text)
  },
  {
    code: 'NETWORK_ERROR',
    message: '网络连接失败，请稍后重试',
    retryable: true,
    matches: (text) => /network|request:fail|timeout|timed out|ECONN|socket|offline|网络/i.test(text)
  }
]

class CareRecordError extends Error {
  constructor({ code, message, retryable, operation, cause, cloudCode = '' }) {
    super(message)
    this.name = 'CareRecordError'
    this.code = code
    this.retryable = retryable
    this.operation = operation
    this.cause = cause
    this.cloudCode = cloudCode
  }
}

function mapCareRecordError(error, operation) {
  if (error && error.name === 'CareRecordError') return error

  const isCloudError = error
    && error.name === 'CloudFunctionCallError'
    && error.functionName === 'careRecord'
  const text = isCloudError
    ? String(error.cloudText || '')
    : String(error && (error.message || error.code) || '')
  const cloudCode = isCloudError ? String(error.cloudCode || '') : String(error && error.code || '')
  const definition = ERROR_DEFINITIONS.find((item) => item.matches(text, cloudCode)) || {
    code: 'UNKNOWN',
    message: '护理服务暂时不可用',
    retryable: false
  }

  return new CareRecordError({
    ...definition,
    operation,
    cause: isCloudError ? error.cause : error,
    cloudCode
  })
}

function invalidInput(error, operation) {
  return new CareRecordError({
    code: 'VALIDATION_ERROR',
    message: error.message || '护理记录数据无效',
    retryable: false,
    operation,
    cause: error
  })
}

function normalizeWritePayload(payload, operation) {
  try {
    return contract.validateCareRecordInput(payload)
  } catch (error) {
    throw invalidInput(error, operation)
  }
}

function normalizeListOptions(options = {}) {
  const dogId = String(options.dogId || '').trim()
  if (!dogId) throw invalidInput(new Error('护理列表缺少目标狗狗'), 'list')

  const type = String(options.type || '').trim()
  if (type && !contract.CARE_RECORD_TYPES.includes(type)) {
    throw invalidInput(new Error('护理类型无效'), 'list')
  }

  const requestedLimit = Number(options.limit)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 20)
    : 20
  return {
    dogId,
    type: type || null,
    limit,
    cursor: options.cursor ? String(options.cursor) : null
  }
}

async function execute(operation, invoke) {
  try {
    return await invoke()
  } catch (error) {
    throw mapCareRecordError(error, operation)
  }
}

async function create(payload) {
  const input = normalizeWritePayload(payload, 'create')
  return execute('create', () => adapter.createCareRecord(input))
}

async function update(recordId, payload) {
  if (!String(recordId || '').trim()) {
    throw invalidInput(new Error('护理记录 ID 无效'), 'update')
  }
  const input = normalizeWritePayload(payload, 'update')
  return execute('update', () => adapter.updateCareRecord(String(recordId), input))
}

async function remove(recordId) {
  if (!String(recordId || '').trim()) {
    throw invalidInput(new Error('护理记录 ID 无效'), 'delete')
  }
  return execute('delete', () => adapter.deleteCareRecord(String(recordId)))
}

function list(options = {}) {
  const normalized = normalizeListOptions(options)
  return execute('list', () => adapter.listCareRecords(normalized))
}

function get(recordId) {
  if (!String(recordId || '').trim()) {
    throw invalidInput(new Error('护理记录 ID 无效'), 'get')
  }
  return execute('get', () => adapter.getCareRecord(String(recordId)))
}

module.exports = {
  create,
  update,
  delete: remove,
  list,
  get,
  CareRecordError,
  mapCareRecordError,
  normalizeListOptions
}
