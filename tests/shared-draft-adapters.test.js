const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const storage = require('../utils/storage')
const customRecipeService = require('../services/customRecipeService')
const draftAdapters = require('../subpackages/custom-recipe/services/draftAdapters')
const {
  saveDraft,
  SHARED_MEAL_DRAFT_STORAGE_KEY
} = require('../subpackages/custom-recipe/services/sharedMealDraftService')

function sharedDraft() {
  return {
    schemaVersion: 1,
    id: 'shared-adapter-draft',
    dog: { id: 'dog-1' },
    humanMenus: [],
    sourceIngredientSelections: [],
    ingredients: [{ ...fixture, sourceRefs: [] }],
    latestAssessment: null,
    saveIntent: 'editing',
    mealTime: '2026-07-27T12:00:00.000Z',
    note: '',
    photoFileIds: [],
    dataVersions: fixture.dataVersions
  }
}

test('draftAdapters/v1 严格隔离 customRecipe 与 sharedMeal 草稿', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  customRecipeService.saveDraft({ id: 'custom-1', title: '旧食谱', ingredients: [] })
  saveDraft(sharedDraft())

  draftAdapters.saveIngredients('customRecipe', 'custom-1', [{ name: '南瓜', perMealAmountGram: 20 }])
  assert.equal(draftAdapters.getDraft('sharedMeal', 'shared-adapter-draft').ingredients[0].name, fixture.name)

  const sharedIngredients = [{ ...fixture, sourceRefs: [], perMealAmountGram: 80 }]
  draftAdapters.saveIngredients('sharedMeal', 'shared-adapter-draft', sharedIngredients)
  assert.equal(draftAdapters.getDraft('sharedMeal', 'shared-adapter-draft').ingredients[0].perMealAmountGram, 80)
  assert.equal(draftAdapters.getDraft('customRecipe', 'custom-1').ingredients[0].name, '南瓜')
})
