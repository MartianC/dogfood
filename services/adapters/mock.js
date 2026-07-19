const storage = require('../../utils/storage')
const env = require('../../config/env')

function now() {
  return new Date().toISOString()
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function validateHiddenArrays(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'allergens') && !Array.isArray(payload.allergens)) {
    throw new Error('过敏源数据格式不正确')
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'avoidIngredients')
    && !Array.isArray(payload.avoidIngredients)
  ) throw new Error('忌口数据格式不正确')
}

async function login() {
  const user = storage.getSync('mockUser', env.mockUser)
  storage.setSync('mockUser', user)
  return {
    token: 'mock_access_token',
    user
  }
}

async function listDogs() {
  return storage.getSync('mockDogs', [])
}

async function createDog(payload) {
  validateHiddenArrays(payload)
  const dogs = await listDogs()
  const dog = {
    id: uid('dog'),
    userId: env.mockUser.id,
    allergens: [],
    avoidIngredients: [],
    avatarUrl: '',
    dietGoal: 'daily',
    createdAt: now(),
    updatedAt: now(),
    ...payload
  }
  storage.setSync('mockDogs', dogs.concat(dog))
  return dog
}

async function updateDog(id, payload) {
  validateHiddenArrays(payload)
  const dogs = await listDogs()
  const next = dogs.map((dog) => dog.id === id ? { ...dog, ...payload, updatedAt: now() } : dog)
  storage.setSync('mockDogs', next)
  return next.find((dog) => dog.id === id)
}

async function deleteDog(id) {
  const dogs = await listDogs()
  storage.setSync('mockDogs', dogs.filter((dog) => dog.id !== id))
  return { ok: true }
}

async function saveCustomRecipe(payload) {
  const list = storage.getSync('mockCustomRecipes', [])
  const item = {
    id: payload.id || uid('custom'),
    userId: env.mockUser.id,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
    ...payload
  }
  storage.setSync('mockCustomRecipes', list.filter((old) => old.id !== item.id).concat(item))
  return item
}

async function saveMealPlan(payload) {
  const list = storage.getSync('mockMealPlans', [])
  const item = {
    id: payload.id || uid('plan'),
    userId: env.mockUser.id,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
    ...payload
  }
  storage.setSync('mockMealPlans', list.filter((old) => old.id !== item.id).concat(item))
  return item
}

async function listMealPlans() {
  return storage.getSync('mockMealPlans', [])
}

module.exports = {
  login,
  listDogs,
  createDog,
  updateDog,
  deleteDog,
  saveCustomRecipe,
  saveMealPlan,
  listMealPlans
}
