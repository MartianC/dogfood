const env = require('../config/env')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
const monthState = require('./sharedMealRecordMonthState')
const calendarModel = require('./sharedMealRecordCalendarModel')
const dataInvalidationService = require('./dataInvalidationService')

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
    code: 'EDIT_WINDOW_EXPIRED',
    message: '这顿饭已进入历史，只能查看',
    retryable: false,
    matches: (text) => /EDIT_WINDOW_EXPIRED|已进入历史|只能查看/i.test(text)
  },
  {
    code: 'REVISION_CONFLICT',
    message: '这顿饭已被更新，请重新读取后再修改',
    retryable: false,
    matches: (text) => /REVISION_CONFLICT|版本冲突|已被更新/i.test(text)
  },
  {
    code: 'IDEMPOTENCY_CONFLICT',
    message: '相同更新请求包含不同内容',
    retryable: false,
    matches: (text) => /IDEMPOTENCY_CONFLICT|相同更新请求包含不同内容/i.test(text)
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
  const result = await executeRecordOperation('save', () => adapter.saveSharedMealRecord(saveIntent))
  dataInvalidationService.markDirty(dataInvalidationService.DATA_SCOPE.MEALS)
  return result
}

async function update(updateIntent) {
  if (!updateIntent || updateIntent.operation !== 'update' || !updateIntent.updateKey) {
    throw new Error('本餐更新意图无效')
  }
  const result = await executeRecordOperation('update', () => (
    adapter.updateSharedMealRecord(updateIntent)
  ))
  dataInvalidationService.markDirty(dataInvalidationService.DATA_SCOPE.MEALS)
  return result
}

function list(options = {}) {
  return executeRecordOperation('list', () => adapter.listSharedMealRecords(options))
}

function get(recordId) {
  if (!recordId) throw new Error('本餐记录 ID 无效')
  return executeRecordOperation('get', () => adapter.getSharedMealRecord(recordId))
}

function createMonthState(options = {}) {
  return monthState.createSharedMealRecordMonthState({
    ...options,
    listRecords: options.listRecords || list
  })
}

function createCalendarModel(records, options) {
  return calendarModel.createRecordCalendarModel(records, options)
}

function queryUnifiedRecordTimeline(options) {
  return require('./unifiedRecordTimelineService').query(options)
}

function createUnifiedRecordTimelineState(options) {
  return require('./unifiedRecordTimelineService').createUnifiedRecordTimelineState(options)
}

module.exports = {
  save,
  update,
  list,
  get,
  createMonthState,
  createCalendarModel,
  queryUnifiedRecordTimeline,
  createUnifiedRecordTimelineState,
  SharedMealRecordError,
  mapRecordError
}
