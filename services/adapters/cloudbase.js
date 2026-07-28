const mock = require('./mock')

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
  return callFunction('sharedMealRecord', { action: 'save', payload: saveIntent })
}

async function listSharedMealRecords(options = {}) {
  if (!canUseCloud()) return mock.listSharedMealRecords(options)
  return callFunction('sharedMealRecord', { action: 'list', ...options })
}

async function getSharedMealRecord(recordId) {
  if (!canUseCloud()) return mock.getSharedMealRecord(recordId)
  return callFunction('sharedMealRecord', { action: 'get', recordId })
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
  getSharedMealRecord
}
