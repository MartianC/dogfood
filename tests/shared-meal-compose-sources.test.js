const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const storage = require('../utils/storage')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  createDraftFromMenus,
  restoreDraft,
  saveDraft
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

const root = path.resolve(__dirname, '..')
const dog = { id: 'dog-source-panel', name: '布丁' }

function component(overrides = {}) {
  return {
    conceptId: fixture.conceptId,
    variantId: fixture.variantId,
    foodId: fixture.foodId,
    displayName: fixture.name,
    category: fixture.category,
    policyStatus: fixture.policyStatus,
    blockedReason: '',
    dataVersions: fixture.dataVersions,
    ...overrides
  }
}

function menu({ id = 'menu-1', title = '鸡肉饭', ingredients } = {}) {
  return {
    id,
    title,
    ingredients: ingredients || [{
      position: 0,
      sourceText: '鸡胸肉',
      amountText: '100 克',
      components: [component()]
    }]
  }
}

function selection(humanMenuId = 'menu-1', overrides = {}) {
  return {
    humanMenuId,
    ingredientPosition: 0,
    conceptId: fixture.conceptId,
    variantId: fixture.variantId,
    ...overrides
  }
}

function loadComposePage() {
  const file = path.join(root, 'subpackages/shared-meal/compose/index.js')
  const previousPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(file)]
  const moduleExports = require(file)
  global.Page = previousPage
  return { definition, moduleExports }
}

function createPageContext(definition, draft) {
  let assessmentRefreshCount = 0
  return {
    ...definition,
    data: {
      ...structuredClone(definition.data),
      draftId: draft.id,
      humanMenus: structuredClone(draft.humanMenus)
    },
    setData(patch, callback) {
      Object.assign(this.data, patch)
      if (callback) callback()
    },
    refreshMealAssessment() {
      assessmentRefreshCount += 1
    },
    assessmentRefreshCount() {
      return assessmentRefreshCount
    }
  }
}

test('今天的人饭展示 included、removed、blocked 和 unmapped 四态且不编辑克重', () => {
  const { moduleExports } = loadComposePage()
  const humanMenus = [menu({
    ingredients: [
      {
        position: 0,
        sourceText: '鸡胸肉',
        amountText: '100 克',
        components: [component()]
      },
      {
        position: 1,
        sourceText: '胡萝卜',
        amountText: '半根',
        components: [component({
          conceptId: 'ingredient_carrot',
          variantId: 'variant_carrot_raw',
          foodId: 'food_carrot',
          displayName: '胡萝卜'
        })]
      },
      {
        position: 2,
        sourceText: '洋葱',
        amountText: '少许',
        components: [component({
          conceptId: 'ingredient_onion',
          variantId: 'variant_onion_raw',
          foodId: 'food_onion',
          displayName: '洋葱',
          policyStatus: 'blocked',
          blockedReason: '洋葱不适合犬只食用。'
        })]
      },
      {
        position: 3,
        sourceText: '秘制调味料',
        amountText: '少许',
        components: []
      }
    ]
  })]

  const groups = moduleExports.humanMealGroups(humanMenus, [selection()])

  assert.deepEqual(groups[0].rows.map((row) => row.state), [
    'included',
    'removed',
    'blocked',
    'unmapped'
  ])
  assert.deepEqual(groups[0].rows.map((row) => row.actionLabel), [
    `从狗饭移除${fixture.name}`,
    '加入狗饭胡萝卜',
    '洋葱不可加入狗饭',
    ''
  ])
  assert.equal(groups[0].rows[2].detailText, '洋葱不适合犬只食用。')
  assert.equal(groups[0].rows[3].detailText, '暂未识别，不能加入狗饭')

  const template = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/compose/index.wxml'),
    'utf8'
  )
  const styles = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/compose/index.wxss'),
    'utf8'
  )
  const sourcePanel = template.match(
    /class="shared-meal-compose-source-panel"[\s\S]*?<\/scroll-view>/
  )
  assert.ok(sourcePanel)
  assert.doesNotMatch(sourcePanel[0], /<input\b/)
  assert.match(sourcePanel[0], /icon="\{\{source\.actionIcon\}\}"/)
  assert.match(template, /catchtap="onToggleHumanMealPicker"/)
  assert.doesNotMatch(template, /<t-[a-z-]+/)
  assert.match(
    styles,
    /\.shared-meal-compose-source-panel\s*{[^}]*width:\s*calc\(100% - 64rpx\);/s
  )
  assert.doesNotMatch(
    styles,
    /\.shared-meal-compose-source-panel\s*{[^}]*right:\s*32rpx;/s
  )
})

test('狗饭行展示真实每百克能量、克重占比且不替用户补首次克重', () => {
  const { moduleExports } = loadComposePage()
  const ingredients = [
    { ...fixture, ingredientId: 'food-beef', name: '牛肉（瘦）', perMealAmountGram: 100 },
    { ...fixture, ingredientId: 'food-broccoli', name: '西兰花', perMealAmountGram: 3 },
    { ...fixture, ingredientId: 'food-rice', name: '米饭', perMealAmountGram: 34 },
    { ...fixture, ingredientId: 'food-empty', name: '待称量食材', perMealAmountGram: null }
  ]
  const nutrientRecords = [
    { food_id: 'food-beef', nutrient_id: 1008, unit_name: 'KCAL', amount: 199 },
    { food_id: 'food-broccoli', nutrient_id: 1008, unit_name: 'KCAL', amount: 15 },
    { food_id: 'food-rice', nutrient_id: 1008, unit_name: 'KCAL', amount: 116 }
  ]

  const rows = moduleExports.ingredientRows(ingredients, nutrientRecords)

  assert.deepEqual(rows.map((row) => row.energyText), [
    '每 100g 199 kcal',
    '每 100g 15 kcal',
    '每 100g 116 kcal',
    '每 100g 能量待完善'
  ])
  assert.deepEqual(rows.map((row) => row.ratioText), ['73%', '2%', '25%', '—'])
  assert.deepEqual(rows.map((row) => row.amountInput), ['100', '3', '34', ''])
  assert.equal(ingredients[3].perMealAmountGram, null)
})

test('狗饭行按来源营养形态展示生活化称量口径且旧数据安全降级', () => {
  const { moduleExports } = loadComposePage()
  const ingredients = [
    { ...fixture, variantId: 'variant-raw', name: '生鸡肉' },
    { ...fixture, variantId: 'variant-cooked', name: '熟鸡肉' },
    { ...fixture, variantId: 'variant-dry', name: '鸡肉干' },
    { ...fixture, variantId: 'variant-legacy', name: '旧版食材' }
  ]
  const humanMenus = [menu({
    ingredients: [{
      position: 0,
      sourceText: '鸡肉',
      amountText: '',
      components: [
        component({ variantId: 'variant-raw', preparationState: 'raw' }),
        component({ variantId: 'variant-cooked', preparationState: 'boiled' }),
        component({ variantId: 'variant-dry', preparationState: 'dry' })
      ]
    }]
  })]

  const rows = moduleExports.ingredientRows(ingredients, [], humanMenus)

  assert.deepEqual(rows.map((row) => row.measurementBasisText), [
    '按生重称量',
    '按熟重称量',
    '按干重称量',
    '按当前记录口径称量'
  ])
  const template = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/compose/index.wxml'),
    'utf8'
  )
  assert.match(template, /\{\{item\.measurementBasisText\}\}/)
})

test('人饭入口按全部来源行统计当前加入数', () => {
  const { moduleExports } = loadComposePage()
  const groups = [{ rows: [
    { state: 'included' },
    { state: 'included' },
    { state: 'removed' },
    { state: 'unmapped' }
  ] }]

  assert.equal(moduleExports.humanMealSummary(groups), '人饭 2/4')
  assert.equal(moduleExports.humanMealSummary([]), '人饭')
})

test('来源面板移除和重新加入后立即同步狗饭条目、克重与评估', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const secondMenu = menu({ id: 'menu-2', title: '鸡汤' })
  const draft = createDraftFromMenus({
    id: 'draft-source-panel',
    dog,
    humanMenus: [menu(), secondMenu],
    sourceIngredientSelections: [selection(), selection('menu-2')],
    dataVersions: fixture.dataVersions
  })
  draft.ingredients[0].perMealAmountGram = 80
  saveDraft(draft)
  const { definition } = loadComposePage()
  const page = createPageContext(definition, draft)

  page.onToggleSourceIngredient({
    currentTarget: { dataset: { ...selection(), included: true } }
  })

  let restored = restoreDraft(draft.id).draft
  assert.equal(restored.ingredients.length, 1)
  assert.equal(restored.ingredients[0].perMealAmountGram, 80)
  assert.deepEqual(restored.sourceIngredientSelections, [selection('menu-2')])
  assert.equal(page.assessmentRefreshCount(), 1)

  page.onToggleSourceIngredient({
    currentTarget: { dataset: { ...selection('menu-2'), included: true } }
  })
  restored = restoreDraft(draft.id).draft
  assert.deepEqual(restored.ingredients, [])

  page.onToggleSourceIngredient({
    currentTarget: { dataset: { ...selection(), included: false } }
  })
  restored = restoreDraft(draft.id).draft
  assert.equal(restored.ingredients.length, 1)
  assert.equal(restored.ingredients[0].perMealAmountGram, null)
  assert.equal(page.assessmentRefreshCount(), 3)

  page.onRemoveIngredient({ currentTarget: { dataset: { index: 0 } } })
  restored = restoreDraft(draft.id).draft
  assert.deepEqual(restored.sourceIngredientSelections, [])
  assert.deepEqual(restored.ingredients, [])
  assert.equal(page.data.humanMenuGroups[0].rows[0].state, 'removed')
  assert.equal(page.assessmentRefreshCount(), 4)

  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
})

test('伪造 blocked 来源操作仍由草稿服务拒绝且页面不产生绕过状态', () => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const blockedMenu = menu({
    ingredients: [{
      position: 0,
      sourceText: '洋葱',
      amountText: '少许',
      components: [component({
        policyStatus: 'blocked',
        blockedReason: '洋葱不适合犬只食用。'
      })]
    }]
  })
  const draft = createDraftFromMenus({
    id: 'draft-blocked-source-panel',
    dog,
    humanMenus: [blockedMenu],
    sourceIngredientSelections: [],
    dataVersions: fixture.dataVersions
  })
  saveDraft(draft)
  const { definition } = loadComposePage()
  const page = createPageContext(definition, draft)
  const originalWx = global.wx
  const toasts = []
  global.wx = {
    showToast(options) { toasts.push(options) }
  }

  try {
    page.onToggleSourceIngredient({
      currentTarget: { dataset: { ...selection(), included: false } }
    })
  } finally {
    global.wx = originalWx
  }

  const restored = restoreDraft(draft.id).draft
  assert.deepEqual(restored.sourceIngredientSelections, [])
  assert.deepEqual(restored.ingredients, [])
  assert.equal(page.assessmentRefreshCount(), 0)
  assert.match(toasts[0].title, /不可加入/)

  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
})

test('共享本餐应用国标和 FEDIAF 档案后保存选择并重新评估', () => {
  const template = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/compose/index.wxml'),
    'utf8'
  )
  const pageSource = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/compose/index.js'),
    'utf8'
  )
  assert.match(template, /bind:profilechange="onNutritionProfileChange"/)
  assert.match(pageSource, /profileOverrides: draft\.nutritionStandardProfiles \|\| \{\}/)

  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const draft = createDraftFromMenus({
    id: 'draft-profile-selection',
    dog,
    humanMenus: [],
    sourceIngredientSelections: [],
    dataVersions: null
  })
  saveDraft(draft)
  const { definition } = loadComposePage()
  const page = createPageContext(definition, draft)

  page.onNutritionProfileChange({
    detail: { key: 'gb', profileCode: 'adult' }
  })
  page.onNutritionProfileChange({
    detail: { key: 'fediaf', profileCode: 'fediaf_2025_dog_adult_mer_95' }
  })

  assert.deepEqual(
    storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).nutritionStandardProfiles,
    {
      gb: 'adult',
      fediaf: 'fediaf_2025_dog_adult_mer_95'
    }
  )
  assert.deepEqual(page.data.nutritionStandardProfiles, {
    gb: 'adult',
    fediaf: 'fediaf_2025_dog_adult_mer_95'
  })
  assert.equal(page.assessmentRefreshCount(), 2)
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
})
