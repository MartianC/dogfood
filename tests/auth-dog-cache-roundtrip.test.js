const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const authService = require('../services/authService')
const dogService = require('../services/dogService')
const cloudbaseAdapter = require('../services/adapters/cloudbase')
const { DOGS_CACHE_MAX_AGE_MS } = require('../services/dogProfileContract')
const storage = require('../utils/storage')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  createDraftFromMenus,
  saveDraft,
  restoreDraft,
  refreshDraftDog
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

const root = path.resolve(__dirname, '..')

function draftInput(dog) {
  const menu = {
    id: 'human_recipe_chicken',
    title: '鸡肉饭',
    ingredients: [{
      position: 0,
      sourceText: '鸡胸肉',
      components: [{
        conceptId: fixture.conceptId,
        variantId: fixture.variantId,
        foodId: fixture.foodId,
        displayName: fixture.name,
        category: fixture.category,
        policyStatus: fixture.policyStatus,
        dataVersions: fixture.dataVersions
      }]
    }]
  }
  return {
    id: 'draft-auth-roundtrip',
    dog,
    humanMenus: [menu],
    sourceIngredientSelections: [{
      humanMenuId: menu.id,
      ingredientPosition: 0,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions: fixture.dataVersions
  }
}

test('authService 接受 dogsCache/v3 并显式拒绝旧版本', async () => {
  storage.setSync('access_token', 'token')
  storage.setSync('currentUser', { id: 'user-1' })
  try {
    storage.setSync('dogsCache', {
      profileSchemaVersion: 3,
      items: [{ id: 'dog-v3' }],
      updatedAt: new Date().toISOString()
    })
    assert.deepEqual((await authService.initAuth()).dogs, [{ id: 'dog-v3' }])

    storage.setSync('dogsCache', {
      profileSchemaVersion: 2,
      items: [{ id: 'dog-v2' }],
      updatedAt: new Date().toISOString()
    })
    assert.deepEqual((await authService.initAuth()).dogs, [])
  } finally {
    storage.removeSync('access_token')
    storage.removeSync('currentUser')
    storage.removeSync('dogsCache')
  }
})

test('authService 不展示过期或结构不完整的 dogsCache 快照', async () => {
  storage.setSync('access_token', 'token')
  storage.setSync('currentUser', { id: 'user-1' })
  try {
    storage.setSync('dogsCache', {
      profileSchemaVersion: 3,
      items: [{ id: 'expired-dog' }],
      updatedAt: new Date(Date.now() - DOGS_CACHE_MAX_AGE_MS - 1).toISOString()
    })
    assert.deepEqual((await authService.initAuth()).dogs, [])

    storage.setSync('dogsCache', {
      profileSchemaVersion: 3,
      items: { id: 'not-an-array' },
      updatedAt: new Date().toISOString()
    })
    assert.deepEqual((await authService.initAuth()).dogs, [])
  } finally {
    storage.removeSync('access_token')
    storage.removeSync('currentUser')
    storage.removeSync('dogsCache')
  }
})

test('远端刷新成功覆盖 dogsCache，失败时保留有效展示快照', async () => {
  const cachedDog = {
    id: 'cached-dog',
    name: '缓存布丁',
    breed: 'shiba-inu',
    birthDate: '2020-01-01',
    weightKg: 10,
    dailyMeals: 2,
    dailyActivityHours: 1,
    bodyCondition: 'ideal',
    specialNutritionNeeds: {}
  }
  storage.setSync('dogsCache', {
    profileSchemaVersion: 3,
    items: [cachedDog],
    updatedAt: new Date().toISOString()
  })
  const originalListDogs = cloudbaseAdapter.listDogs
  try {
    cloudbaseAdapter.listDogs = async () => [{ ...cachedDog, id: 'remote-dog', name: '远端布丁' }]
    const refreshed = await dogService.listDogs()
    assert.equal(refreshed[0].id, 'remote-dog')
    assert.equal(storage.getSync('dogsCache').items[0].id, 'remote-dog')

    cloudbaseAdapter.listDogs = async () => { throw new Error('网络不可用') }
    const fallback = await dogService.listDogs()
    assert.equal(fallback[0].id, 'remote-dog')
    assert.equal(storage.getSync('dogsCache').items[0].id, 'remote-dog')
  } finally {
    cloudbaseAdapter.listDogs = originalListDogs
    storage.removeSync('dogsCache')
  }
})

test('档案完善往返后 v3 缓存、特殊状态与草稿选狗保持一致', async () => {
  const incompleteDog = {
    id: 'dog-roundtrip',
    name: '布丁',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    weightKg: 10,
    dailyMeals: 2,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal',
    specialNutritionNeeds: {
      hasDisease: null,
      reproductiveStatus: null,
      therapeuticWeightManagement: null
    }
  }
  storage.setSync('mockDogs', [incompleteDog])
  storage.removeSync('dogsCache')
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  saveDraft(createDraftFromMenus(draftInput(incompleteDog)))

  await dogService.listDogs()
  const completedDog = await dogService.updateDog(incompleteDog.id, {
    ...incompleteDog,
    specialNutritionNeeds: {
      hasDisease: false,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'none'
    }
  })
  refreshDraftDog(completedDog)

  const cache = storage.getSync('dogsCache')
  const restored = restoreDraft('draft-auth-roundtrip')
  assert.equal(cache.profileSchemaVersion, 3)
  assert.deepEqual(
    cache.items[0].specialNutritionNeeds,
    completedDog.specialNutritionNeeds
  )
  assert.equal(restored.draft.dog.id, incompleteDog.id)
  assert.deepEqual(
    restored.draft.dog.specialNutritionNeeds,
    completedDog.specialNutritionNeeds
  )
})

test('仓库只有 dogProfileContract 定义 DOGS_CACHE_SCHEMA_VERSION', () => {
  const files = [
    'services/dogProfileContract.js',
    'services/dogService.js',
    'services/authService.js'
  ]
  const definitions = files.flatMap((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    return Array.from(source.matchAll(/const DOGS_CACHE_SCHEMA_VERSION\s*=\s*3/g), () => file)
  })
  assert.deepEqual(definitions, ['services/dogProfileContract.js'])
})
