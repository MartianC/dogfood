const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const storage = require('../utils/storage')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  createDraftFromMenus,
  createDraftFromRecord,
  normalizeHumanRecipeDetail,
  saveDraft,
  restoreDraft,
  restoreTrustedDraft,
  getDraftRecoveryDecision,
  continueDraftRecovery,
  restartDraftRecovery,
  resetDraft,
  includeSourceIngredient,
  removeSourceIngredient,
  reincludeSourceIngredient,
  updateDraftIngredients
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

const root = path.resolve(__dirname, '..')
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

function sourceSelection(humanMenuId = 'human_recipe_chicken') {
  return {
    humanMenuId,
    ingredientPosition: 0,
    conceptId: fixture.conceptId,
    variantId: fixture.variantId
  }
}

function draftWithSources(humanMenus, sourceIngredientSelections) {
  return createDraftFromMenus({
    id: 'draft-source-transition',
    dog,
    humanMenus,
    sourceIngredientSelections,
    dataVersions
  })
}

test('人饭详情与狗饭草稿统一使用 canonical 食材名', () => {
  const normalized = normalizeHumanRecipeDetail({
    recipeVersion: dataVersions.recipeVersion,
    recipe: {
      id: 'recipe-canonical-name',
      release_id: dataVersions.runtimeReleaseId,
      recipe_version: dataVersions.recipeVersion,
      mapping_version: dataVersions.mappingVersion,
      compatible_catalog_version: dataVersions.catalogVersion,
      compatible_policy_version: dataVersions.policyVersion,
      base_release_id: dataVersions.nutritionSourceReleaseId,
      ingredients: [{
        position: 0,
        raw_name: '鸡胸肉',
        components: [{
          concept_id: fixture.conceptId,
          variant_id: fixture.variantId,
          food_id: fixture.foodId,
          canonical_name_zh: '鸡胸肉',
          display_name_zh: '鸡胸肉（熟）',
          category_code: fixture.category,
          policy_status: fixture.policyStatus
        }]
      }]
    }
  })
  const component = normalized.ingredients[0].components[0]

  assert.equal(component.displayName, '鸡胸肉')

  const draft = createDraftFromMenus({
    id: 'draft-canonical-name',
    dog,
    humanMenus: [normalized],
    sourceIngredientSelections: [{
      humanMenuId: normalized.id,
      ingredientPosition: 0,
      conceptId: component.conceptId,
      variantId: component.variantId
    }],
    dataVersions
  })
  assert.equal(draft.ingredients[0].name, '鸡胸肉')
})

test('include 将单个允许来源加入草稿且不修改输入状态', () => {
  const draft = draftWithSources([menu()], [])

  const next = includeSourceIngredient(draft, sourceSelection())

  assert.deepEqual(draft.sourceIngredientSelections, [])
  assert.deepEqual(draft.ingredients, [])
  assert.deepEqual(next.sourceIngredientSelections, [sourceSelection()])
  assert.equal(next.ingredients.length, 1)
  assert.equal(next.ingredients[0].perMealAmountGram, null)
  assert.deepEqual(next.ingredients[0].sourceRefs, [
    { humanMenuId: 'human_recipe_chicken', ingredientPosition: 0 }
  ])
})

test('remove 移除单一来源后完全删除对应狗饭条目', () => {
  const draft = draftWithSources([menu()], [sourceSelection()])
  draft.ingredients[0].perMealAmountGram = 80

  const next = removeSourceIngredient(draft, sourceSelection())

  assert.equal(draft.ingredients[0].perMealAmountGram, 80)
  assert.deepEqual(next.sourceIngredientSelections, [])
  assert.deepEqual(next.ingredients, [])
})

test('remove 只移除一个来源时保留其他来源和已有合法克重', () => {
  const secondMenu = {
    ...menu(),
    id: 'human_recipe_chicken_soup',
    title: '鸡汤'
  }
  const secondSelection = sourceSelection('human_recipe_chicken_soup')
  const draft = draftWithSources(
    [menu(), secondMenu],
    [sourceSelection(), secondSelection]
  )
  draft.ingredients[0].perMealAmountGram = 80

  const next = removeSourceIngredient(draft, sourceSelection())

  assert.deepEqual(next.sourceIngredientSelections, [secondSelection])
  assert.equal(next.ingredients.length, 1)
  assert.equal(next.ingredients[0].perMealAmountGram, 80)
  assert.deepEqual(next.ingredients[0].sourceRefs, [
    { humanMenuId: 'human_recipe_chicken_soup', ingredientPosition: 0 }
  ])
})

test('reinclude 在条目仍存在时恢复来源并保留已有合法克重', () => {
  const secondMenu = {
    ...menu(),
    id: 'human_recipe_chicken_soup',
    title: '鸡汤'
  }
  const secondSelection = sourceSelection('human_recipe_chicken_soup')
  const draft = draftWithSources([menu(), secondMenu], [secondSelection])
  draft.ingredients[0].perMealAmountGram = 80

  const next = reincludeSourceIngredient(draft, sourceSelection())

  assert.equal(next.ingredients.length, 1)
  assert.equal(next.ingredients[0].perMealAmountGram, 80)
  assert.deepEqual(next.ingredients[0].sourceRefs, [
    { humanMenuId: 'human_recipe_chicken_soup', ingredientPosition: 0 },
    { humanMenuId: 'human_recipe_chicken', ingredientPosition: 0 }
  ])
})

test('reinclude 在条目已完全删除时恢复条目并将克重设为 null', () => {
  const included = draftWithSources([menu()], [sourceSelection()])
  included.ingredients[0].perMealAmountGram = 80
  const removed = removeSourceIngredient(included, sourceSelection())

  const reIncluded = reincludeSourceIngredient(removed, sourceSelection())

  assert.equal(reIncluded.ingredients.length, 1)
  assert.equal(reIncluded.ingredients[0].perMealAmountGram, null)
})

test('include 和 reinclude 都拒绝 blocked 与未映射来源', () => {
  const blockedDraft = draftWithSources([menu({ policyStatus: 'blocked' })], [])
  const unmappedMenu = menu()
  unmappedMenu.ingredients[0].components = []
  const unmappedDraft = draftWithSources([unmappedMenu], [])

  ;[includeSourceIngredient, reincludeSourceIngredient].forEach((transition) => {
    assert.throws(
      () => transition(blockedDraft, sourceSelection()),
      /不可加入/
    )
    assert.throws(
      () => transition(unmappedDraft, sourceSelection()),
      /来源选择无效/
    )
  })
})

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

test('当天记录可以转换为编辑草稿并保留原记录版本与快照字段', () => {
  const record = {
    id: 'record-edit-1',
    revision: 3,
    targetDogId: dog.id,
    mealTime: new Date().toISOString(),
    dogSnapshot: dog,
    humanMenu: [menu()],
    sourceIngredientSelections: [sourceSelection()],
    dogMealItems: [{ ...fixture, perMealAmountGram: 80 }],
    assessment: { energy: { available: true } },
    note: '原备注',
    photoFileIds: [],
    versions: dataVersions
  }
  const draft = createDraftFromRecord(record)
  assert.equal(draft.draftMode, 'edit')
  assert.equal(draft.sourceRecordId, record.id)
  assert.equal(draft.baseRevision, 3)
  assert.equal(draft.mealTime, record.mealTime)
  assert.equal(draft.ingredients[0].perMealAmountGram, 80)
  assert.equal(draft.note, '原备注')
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

test('恢复决策区分无草稿、有效草稿、空菜单草稿、旧版本和损坏内容', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  assert.deepEqual(getDraftRecoveryDecision(), {
    status: 'none',
    draft: null
  })

  const resumable = createDraftFromMenus({
    id: 'draft-recovery-resumable',
    dog,
    humanMenus: [menu()],
    sourceIngredientSelections: [sourceSelection()],
    dataVersions
  })
  saveDraft(resumable)
  assert.deepEqual(getDraftRecoveryDecision(), {
    status: 'resumable',
    draft: resumable
  })

  const emptyMenu = createDraftFromMenus({
    id: 'draft-recovery-empty-menu',
    dog,
    humanMenus: [],
    sourceIngredientSelections: [],
    dataVersions: null
  })
  saveDraft(emptyMenu)
  assert.deepEqual(getDraftRecoveryDecision(), {
    status: 'none',
    draft: null
  })
  assert.deepEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), emptyMenu)

  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, { schemaVersion: 0, id: 'old' })
  assert.deepEqual(getDraftRecoveryDecision(), {
    status: 'invalid',
    reason: 'unsupported_schema_version',
    draft: null
  })
  assert.notEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)

  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, { schemaVersion: 1, id: 'broken' })
  assert.deepEqual(getDraftRecoveryDecision(), {
    status: 'invalid',
    reason: 'corrupt_draft',
    draft: null
  })
  assert.notEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)
})

test('空白狗饭草稿首次添加目录食材时采用食材发布版本', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const draft = createDraftFromMenus({
    id: 'draft-direct-dog-meal',
    dog,
    humanMenus: [],
    sourceIngredientSelections: [],
    dataVersions: null
  })
  saveDraft(draft)

  const updated = updateDraftIngredients(draft.id, [{
    ...fixture,
    perMealAmountGram: 80,
    sourceRefs: []
  }])

  assert.deepEqual(updated.dataVersions, fixture.dataVersions)
  assert.equal(updated.ingredients.length, 1)
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
})

test('继续与重新开始只有显式调用时才读取或清理当前草稿', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const draft = createDraftFromMenus({
    id: 'draft-recovery-action',
    dog,
    humanMenus: [menu()],
    sourceIngredientSelections: [sourceSelection()],
    dataVersions
  })
  saveDraft(draft)

  assert.deepEqual(continueDraftRecovery(draft.id), draft)
  assert.deepEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), draft)
  assert.equal(continueDraftRecovery('different'), null)
  assert.equal(restartDraftRecovery('different'), false)
  assert.deepEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), draft)
  assert.equal(restartDraftRecovery(draft.id), true)
  assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)
})

test('草稿顶层共同发布版本必须与所有来源食材一致', () => {
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

test('同步篡改三份缓存也必须经 Issue 1 可信详情重验', async () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const forgedMenu = menu()
  const draft = createDraftFromMenus({
    id: 'draft-trusted-detail',
    dog,
    humanMenus: [forgedMenu],
    sourceIngredientSelections: [{
      humanMenuId: forgedMenu.id,
      ingredientPosition: 0,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions
  })
  saveDraft(draft)

  const blockedTrustedMenu = menu({ policyStatus: 'blocked' })
  const blockedResult = await restoreTrustedDraft(
    draft.id,
    async () => blockedTrustedMenu
  )
  assert.deepEqual(blockedResult, {
    status: 'invalid',
    reason: 'untrusted_recipe_detail',
    draft: null
  })

  const unmappedTrustedMenu = menu()
  unmappedTrustedMenu.ingredients[0].components = []
  const unmappedResult = await restoreTrustedDraft(
    draft.id,
    async () => unmappedTrustedMenu
  )
  assert.deepEqual(unmappedResult, {
    status: 'invalid',
    reason: 'untrusted_recipe_detail',
    draft: null
  })
})

test('共同发布版本一致时保留各食材不同的营养来源版本', () => {
  const secondVersions = {
    ...dataVersions,
    nutritionSourceReleaseId: 'usda-sr-legacy-2018-04'
  }
  const secondMenu = {
    ...menu({
      conceptId: 'ingredient_beef',
      variantId: 'variant_beef_raw',
      foodId: 'food_beef',
      displayName: '牛肉',
      category: 'meat',
      dataVersions: secondVersions
    }),
    id: 'human_recipe_beef'
  }
  const draft = createDraftFromMenus({
    id: 'draft-mixed-nutrition-source',
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
        humanMenuId: 'human_recipe_beef',
        ingredientPosition: 0,
        conceptId: 'ingredient_beef',
        variantId: 'variant_beef_raw'
      }
    ],
    dataVersions
  })

  assert.deepEqual(
    draft.ingredients.map((ingredient) => ingredient.dataVersions.nutritionSourceReleaseId),
    [dataVersions.nutritionSourceReleaseId, secondVersions.nutritionSourceReleaseId]
  )
})

test('ingredientPosition 必须是大于等于 0 的整数', () => {
  const negativePositionMenu = menu()
  negativePositionMenu.ingredients[0].position = -1

  assert.throws(() => createDraftFromMenus({
    id: 'draft-negative-position',
    dog,
    humanMenus: [negativePositionMenu],
    sourceIngredientSelections: [{
      humanMenuId: negativePositionMenu.id,
      ingredientPosition: -1,
      conceptId: fixture.conceptId,
      variantId: fixture.variantId
    }],
    dataVersions
  }), /来源选择字段无效/)
})

test('草稿服务对四态分别执行自动带入、来源选择和后续更新规则', () => {
  const expected = {
    allowed: true,
    conditional: true,
    unknown: true,
    blocked: false
  }

  Object.entries(expected).forEach(([policyStatus, canOperate]) => {
    const normalized = normalizeHumanRecipeDetail({
      recipeVersion: dataVersions.recipeVersion,
      recipe: {
        id: `recipe-${policyStatus}`,
        release_id: dataVersions.runtimeReleaseId,
        recipe_version: dataVersions.recipeVersion,
        mapping_version: dataVersions.mappingVersion,
        compatible_catalog_version: dataVersions.catalogVersion,
        compatible_policy_version: dataVersions.policyVersion,
        base_release_id: dataVersions.nutritionSourceReleaseId,
        ingredients: [{
          position: 0,
          raw_name: '鸡胸肉',
          components: [{
            concept_id: fixture.conceptId,
            variant_id: fixture.variantId,
            food_id: fixture.foodId,
            display_name_zh: fixture.name,
            category_code: fixture.category,
            policy_status: policyStatus
          }]
        }]
      }
    })
    const component = normalized.ingredients[0].components[0]
    assert.equal(component.canSelect, canOperate, `${policyStatus} 自动带入资格`)
    assert.equal(component.selected, canOperate, `${policyStatus} 初始来源选择`)

    const create = () => createDraftFromMenus({
      id: `draft-create-${policyStatus}`,
      dog,
      humanMenus: [menu({ policyStatus })],
      sourceIngredientSelections: [{
        humanMenuId: 'human_recipe_chicken',
        ingredientPosition: 0,
        conceptId: fixture.conceptId,
        variantId: fixture.variantId
      }],
      dataVersions
    })
    if (canOperate) assert.doesNotThrow(create, `${policyStatus} 来源选择应通过`)
    else assert.throws(create, /不可加入/)

    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    saveDraft(createDraftFromMenus({
      id: `draft-update-${policyStatus}`,
      dog,
      humanMenus: [menu()],
      sourceIngredientSelections: [{
        humanMenuId: 'human_recipe_chicken',
        ingredientPosition: 0,
        conceptId: fixture.conceptId,
        variantId: fixture.variantId
      }],
      dataVersions
    }))
    const update = () => updateDraftIngredients(
      `draft-update-${policyStatus}`,
      [{ ...fixture, policyStatus }]
    )
    if (canOperate) assert.doesNotThrow(update, `${policyStatus} 草稿更新应通过`)
    else assert.throws(update, /不可加入/)
  })
})

test('草稿服务不直接比较 blocked 且保留自动带入与用户添加语义', () => {
  const source = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/services/sharedMealDraftService.js'),
    'utf8'
  )

  assert.match(source, /canAutoIncludeIngredient\(policyStatus\)/)
  assert.match(source, /canAddIngredient\(component\)/)
  assert.match(source, /canAddIngredient\(ingredient\)/)
  assert.doesNotMatch(source, /component\.policyStatus\s*(?:===|!==)\s*['"]blocked['"]/)
  assert.doesNotMatch(source, /policyStatus\s*(?:===|!==)\s*['"]blocked['"]/)
})
