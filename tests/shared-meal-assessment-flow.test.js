const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const storage = require('../utils/storage')
const { checkGeneratedFiles } = require('../scripts/sync-subpackage-services')
const mealEnergyService = require('../subpackages/shared-meal/services/mealEnergyService')
const {
  saveDraft,
  buildSaveIntent,
  confirmSaveIntent,
  SHARED_MEAL_DRAFT_STORAGE_KEY
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

function seedDraft() {
  const ingredient = { ...fixture, perMealAmountGram: 100 }
  const draft = {
    schemaVersion: 1,
    id: 'assessment-draft',
    dog: { id: 'dog-1', name: '布丁' },
    humanMenus: [{ id: 'human_recipe_chicken', title: '清蒸鸡胸', ingredients: [{ position: 0 }] }],
    sourceIngredientSelections: [],
    ingredients: [ingredient],
    latestAssessment: null,
    saveIntent: 'editing',
    mealTime: '2026-07-27T12:00:00.000Z',
    note: '',
    photoFileIds: [],
    dataVersions: fixture.dataVersions
  }
  saveDraft(draft)
  return draft
}

function assessment({ critical = false, missing = false } = {}) {
  return {
    energy: {
      available: !missing,
      status: missing ? 'unavailable' : 'near_target',
      statusLabel: missing ? '暂无法判断本餐份量' : '能量接近估算目标',
      missingIngredients: missing ? [{ name: '鸡胸肉' }] : []
    },
    nutritionDensity: {
      counts: { unavailable: 0 },
      standards: [{
        key: 'gb',
        code: 'GB/T 31216-2014',
        profileCode: 'adult',
        lowItems: [{ code: 'CA' }],
        highItems: critical ? [{ code: 'CU', priority: 'highest' }] : []
      }]
    }
  }
}

test('共享评估核心由唯一源同步到两个分包且模块状态隔离', () => {
  assert.deepEqual(checkGeneratedFiles(), [])
  ;['energyRequirementService', 'mealEnergyService', 'nutritionAssessmentService', 'mealAssessmentService', 'nutritionDataService', 'runtimeDataReleaseService'].forEach((name) => {
    const customRecipe = require(`../subpackages/custom-recipe/services/${name}`)
    const sharedMeal = require(`../subpackages/shared-meal/services/${name}`)
    assert.notEqual(customRecipe, sharedMeal)
    assert.deepEqual(Object.keys(customRecipe).sort(), Object.keys(sharedMeal).sort())
  })
})

test('等比例调整保持食材比例，取消预览不写草稿', () => {
  const draft = seedDraft()
  const suggestion = mealEnergyService.buildScaleSuggestion({
    ingredients: draft.ingredients,
    currentKcal: 100,
    mealTarget: { min: 200, max: 200 }
  })
  assert.equal(suggestion.available, true)
  assert.equal(suggestion.suggestedIngredients[0].perMealAmountGram, 200)
  assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).ingredients[0].perMealAmountGram, 100)
})

test('普通缺口不确认，最高优先级偏高或关键缺失每个 saveIntent 只确认一次', () => {
  seedDraft()
  const ordinary = buildSaveIntent('assessment-draft', assessment())
  assert.equal(ordinary.warningConfirmation, 'not_required')
  assert.equal(buildSaveIntent('assessment-draft', assessment()).requestFingerprint, ordinary.requestFingerprint)

  seedDraft()
  const warned = buildSaveIntent('assessment-draft', assessment({ critical: true }))
  assert.equal(warned.warningConfirmation, 'required')
  assert.equal(confirmSaveIntent('assessment-draft').warningConfirmation, 'confirmed')

  seedDraft()
  assert.equal(buildSaveIntent('assessment-draft', assessment({ missing: true })).warningConfirmation, 'required')
})
