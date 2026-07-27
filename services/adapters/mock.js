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

const MOCK_HUMAN_RECIPES = [
  {
    _id: 'mock_human_tomato_egg',
    title: '番茄炒蛋',
    sortKey: '番茄炒蛋',
    ingredients: [
      {
        position: 0,
        raw_name: '番茄',
        amount_raw: '2 个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_tomato',
          variant_id: 'variant_tomato_raw',
          food_id: 'food_tomato',
          display_name_zh: '番茄',
          policy_status: 'allowed',
          blockedReason: null
        }]
      },
      {
        position: 1,
        raw_name: '鸡蛋',
        amount_raw: '3 个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_egg',
          variant_id: 'variant_egg_cooked',
          food_id: 'food_egg',
          display_name_zh: '鸡蛋',
          policy_status: 'conditional',
          blockedReason: null
        }]
      }
    ]
  },
  {
    _id: 'mock_human_onion_beef',
    title: '洋葱牛肉',
    sortKey: '洋葱牛肉',
    ingredients: [
      {
        position: 0,
        raw_name: '洋葱',
        amount_raw: '半个',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_onion',
          variant_id: 'variant_onion_raw',
          food_id: 'food_onion',
          display_name_zh: '洋葱',
          policy_status: 'blocked',
          blockedReason: '洋葱不适合犬只食用。'
        }]
      },
      {
        position: 1,
        raw_name: '牛肉',
        amount_raw: '300 克',
        mapping_status: 'matched',
        components: [{
          concept_id: 'ingredient_beef',
          variant_id: 'variant_beef_cooked',
          food_id: 'food_beef',
          display_name_zh: '牛肉',
          policy_status: 'unknown',
          blockedReason: null
        }]
      },
      {
        position: 2,
        raw_name: '少许调味料',
        amount_raw: '',
        mapping_status: 'unmatched'
      }
    ]
  }
]

async function searchHumanRecipes(options = {}) {
  const query = String(options.query || '').trim().toLocaleLowerCase()
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 20)
  const items = MOCK_HUMAN_RECIPES
    .filter((recipe) => !query || recipe.title.toLocaleLowerCase().includes(query))
    .slice(0, limit)
    .map((recipe) => ({
      id: recipe._id,
      title: recipe.title,
      ingredients: recipe.ingredients
    }))
  return {
    contract: 'searchHumanRecipes/v1',
    recipeVersion: 'mock-recipe-v2',
    items,
    nextCursor: null
  }
}

async function getHumanRecipe(recipeId) {
  const recipe = MOCK_HUMAN_RECIPES.find((item) => item._id === recipeId)
  if (!recipe) throw new Error('未找到已发布菜谱')
  return {
    contract: 'getHumanRecipe/v1',
    recipeVersion: 'mock-recipe-v2',
    recipe: {
      ...recipe,
      id: recipe._id
    }
  }
}

module.exports = {
  login,
  listDogs,
  createDog,
  updateDog,
  deleteDog,
  saveCustomRecipe,
  saveMealPlan,
  listMealPlans,
  searchHumanRecipes,
  getHumanRecipe
}
