const WEIGHT_RECORD_FUNCTION = 'weightRecord'

class WeightFunctionCallError extends Error {
  constructor(cause) {
    super('体重记录云函数调用失败')
    this.name = 'WeightFunctionCallError'
    this.functionName = WEIGHT_RECORD_FUNCTION
    this.cause = cause
    this.cloudCode = readCloudErrorCode(cause)
    this.cloudText = collectCloudErrorText(cause)
  }
}

function readCloudErrorCode(error) {
  if (!error || typeof error !== 'object') return ''
  const code = error.errCode != null
    ? error.errCode
    : error.code != null
      ? error.code
      : error.errno
  return code == null ? '' : String(code)
}

function collectCloudErrorText(error, depth = 0, visited = new Set()) {
  if (error == null || depth > 3) return ''
  if (typeof error !== 'object') return String(error)
  if (visited.has(error)) return ''
  visited.add(error)

  const parts = [
    error.errCode,
    error.code,
    error.errno,
    error.statusCode,
    error.message,
    error.errMsg,
    error.errorMessage,
    error.RetMsg,
    error.ErrMsg
  ]
  ;['cause', 'error', 'result', 'response'].forEach((key) => {
    if (error[key] != null) parts.push(collectCloudErrorText(error[key], depth + 1, visited))
  })
  return parts.filter((value) => value !== undefined && value !== null && value !== '').join('\n')
}

function canUseCloud() {
  return typeof wx !== 'undefined'
    && wx.cloud
    && typeof wx.cloud.callFunction === 'function'
}

async function callWeightFunction(data) {
  if (!canUseCloud()) throw new Error('当前未配置云开发环境')
  try {
    const result = await wx.cloud.callFunction({
      name: WEIGHT_RECORD_FUNCTION,
      data
    })
    return result.result
  } catch (error) {
    throw new WeightFunctionCallError(error)
  }
}

function getWeightRecordContract() {
  return callWeightFunction({ action: 'contract' })
}

function listWeightMeasurements(options = {}) {
  return callWeightFunction({ action: 'list', ...options })
}

function createWeightMeasurement(payload) {
  return callWeightFunction({ action: 'create', payload })
}

function updateWeightMeasurement(recordId, payload) {
  return callWeightFunction({ action: 'replace', recordId, payload })
}

function getWeightMeasurement(recordId) {
  return callWeightFunction({ action: 'get', recordId })
}

function deleteWeightMeasurement(recordId) {
  return callWeightFunction({ action: 'delete', recordId })
}

module.exports = {
  WEIGHT_RECORD_FUNCTION,
  WeightFunctionCallError,
  readCloudErrorCode,
  collectCloudErrorText,
  getWeightRecordContract,
  listWeightMeasurements,
  createWeightMeasurement,
  updateWeightMeasurement,
  getWeightMeasurement,
  deleteWeightMeasurement
}
