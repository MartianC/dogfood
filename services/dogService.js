const env = require('../config/env')
const storage = require('../utils/storage')
const authService = require('./authService')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')

function normalizeDog(payload) {
  return {
    name: String(payload.name || '').trim(),
    ageStage: payload.ageStage || 'adult',
    weightKg: Number(payload.weightKg || 0),
    dailyMeals: Number(payload.dailyMeals || 2),
    avatarUrl: payload.avatarUrl || '',
    breed: payload.breed || '',
    neutered: Boolean(payload.neutered),
    activityLevel: payload.activityLevel || 'normal',
    dietGoal: payload.dietGoal || 'daily',
    allergens: Array.isArray(payload.allergens) ? payload.allergens : [],
    avoidIngredients: Array.isArray(payload.avoidIngredients) ? payload.avoidIngredients : [],
    healthNotes: payload.healthNotes || ''
  }
}

function validateDog(dog) {
  if (!dog.name) throw new Error('请填写狗狗名字')
  if (!dog.weightKg || dog.weightKg <= 0) throw new Error('请填写狗狗体重')
  if (!dog.dailyMeals || dog.dailyMeals <= 0) throw new Error('请填写每日餐数')
}

async function listDogs() {
  const cached = storage.getCache('dogsCache')
  try {
    const dogs = await adapter.listDogs()
    storage.setCache('dogsCache', dogs)
    authService.refreshState(dogs)
    return dogs
  } catch (error) {
    const fallback = cached ? cached.items : []
    authService.refreshState(fallback)
    return fallback
  }
}

async function createDog(payload) {
  const dog = normalizeDog(payload)
  validateDog(dog)
  const saved = await adapter.createDog(dog)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return saved
}

async function updateDog(id, payload) {
  const dog = normalizeDog(payload)
  validateDog(dog)
  const saved = await adapter.updateDog(id, dog)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return saved
}

async function deleteDog(id) {
  const result = await adapter.deleteDog(id)
  const dogs = await listDogs()
  authService.refreshState(dogs)
  return result
}

module.exports = {
  listDogs,
  createDog,
  updateDog,
  deleteDog,
  normalizeDog,
  validateDog
}
