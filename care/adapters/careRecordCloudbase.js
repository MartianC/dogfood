const mock = require('./careRecordMock')

class CloudFunctionCallError extends Error {
  constructor(functionName, cause) {
    super('云函数调用失败')
    this.name = 'CloudFunctionCallError'
    this.functionName = functionName
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
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'
}

async function callCareRecordFunction(data) {
  if (!canUseCloud()) return null
  try {
    const result = await wx.cloud.callFunction({ name: 'careRecord', data })
    return result.result
  } catch (error) {
    throw new CloudFunctionCallError('careRecord', error)
  }
}

async function createCareRecord(payload) {
  if (!canUseCloud()) return mock.createCareRecord(payload)
  return callCareRecordFunction({ action: 'create', payload })
}

async function updateCareRecord(recordId, payload) {
  if (!canUseCloud()) return mock.updateCareRecord(recordId, payload)
  return callCareRecordFunction({ action: 'update', recordId, payload })
}

async function deleteCareRecord(recordId) {
  if (!canUseCloud()) return mock.deleteCareRecord(recordId)
  return callCareRecordFunction({ action: 'delete', recordId })
}

async function listCareRecords(options = {}) {
  if (!canUseCloud()) return mock.listCareRecords(options)
  return callCareRecordFunction({ action: 'list', ...options })
}

async function getCareRecord(recordId) {
  if (!canUseCloud()) return mock.getCareRecord(recordId)
  return callCareRecordFunction({ action: 'get', recordId })
}

module.exports = {
  createCareRecord,
  updateCareRecord,
  deleteCareRecord,
  listCareRecords,
  getCareRecord,
  CloudFunctionCallError,
  collectCloudErrorText
}
