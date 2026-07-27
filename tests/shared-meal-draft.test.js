const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  createDraftFromMenus,
  saveDraft,
  restoreDraft,
  resetDraft
} = require('../services/sharedMealDraftService')

const dog = { id: 'dog-1', name: '布丁' }
const dataVersions = fixture.dataVersions

function menu(componentOverrides = {}) {
  return {
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
        dataVersions,
        ...componentOverrides
      }]
    }]
  }
}

test('同一已发布食材按来源合并，初始克重保持 null', () => {
  const secondMenu = {
    ...menu(),
    id: 'human_recipe_chicken_soup',
    title: '鸡汤'
  }
  const draft = createDraftFromMenus({
    id: 'draft-1',
    dog,
    humanMenus: [menu(), secondMenu],
    sourceIngredientSelections: [
      {
        humanMenuId: 'human_recipe_chicken',
        ingredientPosition: 0,
        conceptId: fixture.conceptId,
        variantId: fixture.variantId
      },
      {
        humanMenuId: 'human_recipe_chicken_soup',
        ingredientPosition: 0,
        conceptId: fixture.conceptId,
        variantId: fixture.variantId
      }
    ],
    dataVersions
  })

  assert.equal(draft.ingredients.length, 1)
  assert.equal(draft.ingredients[0].ingredientId, fixture.foodId)
  assert.equal(draft.ingredients[0].perMealAmountGram, null)
  assert.deepEqual(draft.ingredients[0].sourceRefs, [
    { humanMenuId: 'human_recipe_chicken', ingredientPosition: 0 },
    { humanMenuId: 'human_recipe_chicken_soup', ingredientPosition: 0 }
  ])
})

test('blocked、未映射和伪造来源选择不能进入草稿食材', () => {
  assert.throws(() => createDraftFromMenus({
    id: 'draft-blocked',
    dog,
    humanMenus: [menu({ policyStatus: 'blocked' })],
    sourceIngredientSelections: [{
      humanMenuId: 'human_recipe_chicken',
      ingredientPosition: 0,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions
  }), /不可加入/)

  assert.throws(() => createDraftFromMenus({
    id: 'draft-forged',
    dog,
    humanMenus: [menu()],
    sourceIngredientSelections: [{
      humanMenuId: 'human_recipe_chicken',
      ingredientPosition: 99,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions
  }), /来源选择无效/)
})

test('同一 fixture 经草稿序列化和恢复后保持完整结构', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const draft = {
    schemaVersion: 1,
    id: 'draft-roundtrip',
    dog,
    humanMenus: [menu()],
    sourceIngredientSelections: [{
      humanMenuId: 'human_recipe_chicken',
      ingredientPosition: 0,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    ingredients: [fixture],
    latestAssessment: { energy: { status: 'available' } },
    saveIntent: 'editing',
    dataVersions
  }

  saveDraft(draft)
  assert.deepEqual(restoreDraft('draft-roundtrip'), {
    status: 'restored',
    draft
  })
})

test('旧版或损坏草稿显式失效，只有明确 reset 才清除', () => {
  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, { schemaVersion: 0, id: 'old' })
  assert.deepEqual(restoreDraft(), {
    status: 'invalid',
    reason: 'unsupported_schema_version',
    draft: null
  })
  assert.notEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)

  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, { schemaVersion: 1, id: 'broken' })
  assert.deepEqual(restoreDraft(), {
    status: 'invalid',
    reason: 'corrupt_draft',
    draft: null
  })
  assert.equal(resetDraft('different'), false)
  assert.notEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)
  assert.equal(resetDraft('broken'), true)
  assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)
})

test('草稿顶层版本必须与所有来源食材版本一致', () => {
  const draft = createDraftFromMenus({
    id: 'draft-version-mismatch',
    dog,
    humanMenus: [menu()],
    sourceIngredientSelections: [{
      humanMenuId: 'human_recipe_chicken',
      ingredientPosition: 0,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions
  })
  const tampered = structuredClone(draft)
  tampered.dataVersions = { ...draft.dataVersions }
  tampered.humanMenus[0].ingredients[0].components[0].dataVersions.policyVersion = 'other-policy'
  tampered.ingredients[0].dataVersions.policyVersion = 'other-policy'

  assert.throws(() => saveDraft(tampered), /草稿版本与食材版本不一致/)
})
