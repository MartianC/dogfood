const env = require('../config/env')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')

const ERROR_DEFINITIONS = [
  {
    code: 'FUNCTION_NOT_DEPLOYED',
    message: '记录服务尚未部署',
    retryable: false,
    matches: (text, cloudCode) => cloudCode === '-501000'
      || /FUNCTION_NOT_FOUND|云函数不存在|FunctionName parameter could not be found/i.test(text)
  },
  {
    code: 'STORAGE_NOT_READY',
    message: '记录存储尚未就绪',
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
    message: '无权执行该记录操作',
    retryable: false,
    matches: (text) => /FORBIDDEN|PERMISSION_DENIED|permission denied|not authorized|无权|没有权限/i.test(text)
  },
  {
    code: 'RECORD_NOT_FOUND',
    message: '未找到本餐记录',
    retryable: false,
    matches: (text) => /\bNOT_FOUND\b|未找到本餐记录|record[^\n]*not found/i.test(text)
  },
  {
    code: 'NETWORK_ERROR',
    message: '网络连接失败，请稍后重试',
    retryable: true,
    matches: (text) => /network|request:fail|timeout|timed out|ECONN|socket|offline|网络/i.test(text)
  }
]

class SharedMealRecordError extends Error {
  constructor({ code, message, retryable, operation, cause, cloudCode = '' }) {
    super(message)
    this.name = 'SharedMealRecordError'
    this.code = code
    this.retryable = retryable
    this.operation = operation
    this.cause = cause
    this.cloudCode = cloudCode
  }
}

function mapRecordError(error, operation) {
  if (
    !error
    || error.name !== 'CloudFunctionCallError'
    || error.functionName !== 'sharedMealRecord'
  ) return error

  const text = String(error.cloudText || '')
  const cloudCode = String(error.cloudCode || '')
  const definition = ERROR_DEFINITIONS.find((item) => item.matches(text, cloudCode)) || {
    code: 'UNKNOWN',
    message: '记录服务暂时不可用',
    retryable: false
  }
  return new SharedMealRecordError({
    ...definition,
    operation,
    cause: error.cause,
    cloudCode
  })
}

async function executeRecordOperation(operation, invoke) {
  try {
    return await invoke()
  } catch (error) {
    throw mapRecordError(error, operation)
  }
}

async function save(saveIntent) {
  if (!saveIntent || !saveIntent.idempotencyKey || !saveIntent.requestFingerprint) {
    throw new Error('本餐保存意图无效')
  }
  return executeRecordOperation('save', () => adapter.saveSharedMealRecord(saveIntent))
}

function list(options = {}) {
  return executeRecordOperation('list', () => adapter.listSharedMealRecords(options))
}

function get(recordId) {
  if (!recordId) throw new Error('本餐记录 ID 无效')
  return executeRecordOperation('get', () => adapter.getSharedMealRecord(recordId))
}

module.exports = {
  save,
  list,
  get,
  SharedMealRecordError,
  mapRecordError
}
