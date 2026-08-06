const mock = require('./mock')

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
  const nestedKeys = ['cause', 'error', 'result', 'response']
  nestedKeys.forEach((key) => {
    if (error[key] != null) {
      parts.push(collectCloudErrorText(error[key], depth + 1, visited))
    }
  })
  return parts.filter((value) => value !== undefined && value !== null && value !== '').join('\n')
}

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'
}

async function callFunction(name, data) {
  if (!canUseCloud()) {
    throw new Error('当前未配置云开发环境')
  }
  const result = await wx.cloud.callFunction({ name, data })
  return result.result
}

async function callRecordFunction(data) {
  try {
    return await callFunction('sharedMealRecord', data)
  } catch (error) {
    throw new CloudFunctionCallError('sharedMealRecord', error)
  }
}

async function login() {
  if (!canUseCloud()) return mock.login()
  return callFunction('login', {})
}

async function listDogs() {
  if (!canUseCloud()) return mock.listDogs()
  return callFunction('dogProfile', { action: 'list' })
}

async function getDogProfileContract() {
  if (!canUseCloud()) return mock.getDogProfileContract()
  return callFunction('dogProfile', { action: 'contract' })
}

async function createDog(payload) {
  if (!canUseCloud()) return mock.createDog(payload)
  return callFunction('dogProfile', { action: 'create', payload })
}

async function updateDog(id, payload) {
  if (!canUseCloud()) return mock.updateDog(id, payload)
  return callFunction('dogProfile', { action: 'update', id, payload })
}

async function deleteDog(id) {
  if (!canUseCloud()) return mock.deleteDog(id)
  return callFunction('dogProfile', { action: 'delete', id })
}

async function saveCustomRecipe(payload) {
  if (!canUseCloud()) return mock.saveCustomRecipe(payload)
  return callFunction('saveCustomRecipe', { payload })
}

async function saveMealPlan(payload) {
  if (!canUseCloud()) return mock.saveMealPlan(payload)
  return callFunction('saveMealPlan', { payload })
}

async function listMealPlans() {
  if (!canUseCloud()) return mock.listMealPlans()
  return callFunction('saveMealPlan', { action: 'list' })
}

async function searchHumanRecipes(options = {}) {
  if (!canUseCloud()) return mock.searchHumanRecipes(options)
  return callFunction('searchHumanRecipes', {
    query: String(options.query || ''),
    limit: options.limit,
    cursor: options.cursor || null
  })
}

async function getHumanRecipe(recipeId) {
  if (!canUseCloud()) return mock.getHumanRecipe(recipeId)
  return callFunction('getHumanRecipe', { recipeId })
}

async function saveSharedMealRecord(saveIntent) {
  if (!canUseCloud()) return mock.saveSharedMealRecord(saveIntent)
  return callRecordFunction({ action: 'save', payload: saveIntent })
}

async function listSharedMealRecords(options = {}) {
  if (!canUseCloud()) return mock.listSharedMealRecords(options)
  return callRecordFunction({ action: 'list', ...options })
}

async function getSharedMealRecord(recordId) {
  if (!canUseCloud()) return mock.getSharedMealRecord(recordId)
  return callRecordFunction({ action: 'get', recordId })
}

async function listWeightMeasurements(options = {}) {
  if (!canUseCloud()) return mock.listWeightMeasurements(options)
  return callFunction('weightRecord', { action: 'list', ...options })
}

async function listCareRecords(options = {}) {
  if (!canUseCloud()) return mock.listCareRecords(options)
  return callFunction('careRecord', { action: 'list', ...options })
}

module.exports = {
  login,
  getDogProfileContract,
  listDogs,
  createDog,
  updateDog,
  deleteDog,
  saveCustomRecipe,
  saveMealPlan,
  listMealPlans,
  searchHumanRecipes,
  getHumanRecipe,
  saveSharedMealRecord,
  listSharedMealRecords,
  getSharedMealRecord,
  listWeightMeasurements,
  listCareRecords,
  CloudFunctionCallError,
  collectCloudErrorText
}
