const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const { canAddIngredient } = require('../subpackages/shared-meal/services/ingredientOperationRules')
const humanRecipeService = require('../subpackages/shared-meal/services/humanRecipeService')
const storage = require('../utils/storage')
const sharedMealFixture = require('./fixtures/shared-meal-ingredient-v1.json')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  createDraftFromMenus,
  saveDraft
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadPage(relativePath) {
  return loadPageModule(relativePath).definition
}

function loadPageModule(relativePath) {
  const file = path.join(root, relativePath)
  const previousPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(file)]
  const moduleExports = require(file)
  global.Page = previousPage
  return { definition, moduleExports }
}

test('sharedMealCreateRoute/v1 注册选狗、菜单搜索和 compose 连续路由', () => {
  const appConfig = JSON.parse(read('app.json'))
  const sharedMeal = appConfig.subpackages.find((item) => (
    item.root === 'subpackages/shared-meal'
  ))

  assert.deepEqual(sharedMeal.pages, [
    'menu-search/index',
    'dog-select/index',
    'dog-select/menu-search/index',
    'compose/index',
    'record-detail/index'
  ])

  const dogSelect = read('subpackages/shared-meal/dog-select/index.js')
  const menuSearch = read('subpackages/shared-meal/menu-search/index.js')
  const compose = read('subpackages/shared-meal/compose/index.js')
  assert.match(dogSelect, /sharedMealDogEligibility/)
  assert.match(dogSelect, /sharedMealDraftService/)
  assert.match(dogSelect, /authService\.login/)
  assert.match(dogSelect, /shared-meal\/menu-search\/index\?draftId=/)
  assert.match(menuSearch, /humanRecipeService\.searchHumanRecipes/)
  assert.match(menuSearch, /createDraftFromMenus/)
  assert.match(menuSearch, /compose\/index\?draftId=/)
  assert.match(compose, /const draftId = String\(options\.draftId/)
  assert.match(compose, /restoreTrustedDraft\(this\.data\.draftId/)
  assert.match(compose, /getHumanRecipe\(humanMenuId\)/)
  assert.doesNotMatch(compose, /options\.(ingredients|foodId|conceptId|variantId)/)
})

test('选狗主路径进入带独立选择、展开和确认操作的规范菜单页', () => {
  const dogSelect = read('subpackages/shared-meal/dog-select/index.js')
  const menuSearch = read('subpackages/shared-meal/menu-search/index.js')
  const template = read('subpackages/shared-meal/menu-search/index.wxml')

  assert.match(dogSelect, /shared-meal\/menu-search\/index\?draftId=/)
  assert.doesNotMatch(dogSelect, /dog-select\/menu-search\/index\?draftId=/)
  assert.match(template, /<ui-card\b/)
  assert.match(template, /catchtap="onToggleRecipeExpansion"/)
  assert.match(template, /选好菜单，继续/)
  assert.match(menuSearch, /createDraftFromMenus/)
  assert.match(menuSearch, /compose\/index\?draftId=/)
})

test('选狗页内容和狗狗卡片按内容高度从顶部连续排列', () => {
  const styles = read('subpackages/shared-meal/dog-select/index.wxss')

  assert.match(styles, /\.shared-meal-dog-page\s*\{[^}]*align-content:\s*start/s)
  assert.match(styles, /\.shared-meal-dog-list\s*\{[^}]*align-content:\s*start/s)
})

test('旧菜单路由只兼容跳转到 canonical 页面并保留草稿 ID', () => {
  const source = read('subpackages/shared-meal/dog-select/menu-search/index.js')
  const template = read('subpackages/shared-meal/dog-select/menu-search/index.wxml')
  const { definition, moduleExports } = loadPageModule(
    'subpackages/shared-meal/dog-select/menu-search/index.js'
  )
  const originalWx = global.wx
  let redirectedUrl = ''
  global.wx = {
    redirectTo({ url }) { redirectedUrl = url }
  }

  try {
    definition.onLoad({ draftId: 'draft/legacy' })
  } finally {
    global.wx = originalWx
  }

  assert.equal(
    redirectedUrl,
    '/subpackages/shared-meal/menu-search/index?draftId=draft%2Flegacy'
  )
  assert.equal(
    moduleExports.canonicalMenuSearchUrl({}),
    '/subpackages/shared-meal/menu-search/index'
  )
  assert.doesNotMatch(
    source,
    /humanRecipeService|createDraftFromMenus|onToggleComponent|onConfirm/
  )
  assert.doesNotMatch(template, /这顿就吃这些吧|selectedRecipe|sourceIngredientSelections/)
})

test('选狗页保留单狗自动、多狗显式单选和 incomplete/blocked 分支', () => {
  const source = read('subpackages/shared-meal/dog-select/index.js')
  const template = read('subpackages/shared-meal/dog-select/index.wxml')

  assert.match(source, /eligibleDogs\.length === 1/)
  assert.doesNotMatch(source, /dogs\[0\]/)
  assert.match(source, /eligibility\.status === 'incomplete'/)
  assert.match(source, /eligibility\.status === 'blocked'/)
  assert.match(source, /saveDogSelectionDraft/)
  assert.match(source, /dog-edit\/index\?id=/)
  assert.match(template, /适用范围/)
  assert.match(template, /兽医或宠物营养专业人士/)
  assert.doesNotMatch(template, /<button\b/)

  const dogEdit = read('subpackages/dog-profile/dog-edit/index.js')
  assert.match(dogEdit, /decodeURIComponent\(options\.redirect/)
  assert.match(dogEdit, /wx\.redirectTo\(\{ url: this\.data\.redirect \}\)/)
})

function createRecoveryDraft(dog, overrides = {}) {
  return createDraftFromMenus({
    id: overrides.id || 'draft-entry-recovery',
    dog,
    humanMenus: overrides.humanMenus || [{
      id: 'human-menu-recovery',
      title: '番茄炒蛋',
      ingredients: []
    }],
    sourceIngredientSelections: [],
    mealTime: '2026-07-30T08:30:00.000Z',
    dataVersions: sharedMealFixture.dataVersions
  })
}

function createDog(overrides = {}) {
  return {
    id: 'dog-recovery',
    name: '布丁',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    weightKg: 10,
    dailyMeals: 2,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal',
    specialNutritionNeeds: {
      hasDisease: false,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'none'
    },
    ...overrides
  }
}

async function withDogSelectPage({ draft, dogs }, run) {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalListDogs = dogService.listDogs
  const originalGetAuthState = authService.getAuthState
  const originalWx = global.wx
  const navigations = []
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  if (draft) saveDraft(draft)
  dogService.listDogs = async () => dogs
  authService.getAuthState = () => 'has-profile'
  global.wx = {
    navigateTo({ url }) { navigations.push(url) }
  }

  try {
    const definition = loadPage('subpackages/shared-meal/dog-select/index.js')
    const context = {
      ...definition,
      data: structuredClone(definition.data),
      setData(patch) { Object.assign(this.data, patch) }
    }
    await run({ definition, context, navigations })
  } finally {
    dogService.listDogs = originalListDogs
    authService.getAuthState = originalGetAuthState
    global.wx = originalWx
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  }
}

test('跳过人饭菜单入口选定狗狗后直接进入空白狗饭创建', async () => {
  await withDogSelectPage({ dogs: [createDog()] }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, { skipHumanMenu: '1' })
    await definition.onShow.call(context)

    assert.equal(context.data.skipHumanMenuSelection, true)
    assert.match(navigations[0], /shared-meal\/compose\/index\?draftId=/)
    assert.doesNotMatch(navigations[0], /menu-search/)
    const draft = storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    assert.deepEqual(draft.humanMenus, [])
    assert.deepEqual(draft.ingredients, [])
  })
})

test('妊娠犬可以从选狗页进入空白狗饭创建', async () => {
  await withDogSelectPage({
    dogs: [createDog({
      specialNutritionNeeds: {
        hasDisease: false,
        reproductiveStatus: 'pregnant',
        therapeuticWeightManagement: 'none'
      }
    })]
  }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, { skipHumanMenu: '1' })
    await definition.onShow.call(context)

    assert.equal(context.data.dogs[0].eligibility.status, 'eligible')
    assert.match(navigations[0], /shared-meal\/compose\/index\?draftId=/)
  })
})

test('有效草稿显示恢复选择，未选择前不导航、不写回且单狗不会抢先继续', async () => {
  const savedDog = createDog({ name: '旧名字' })
  const latestDog = createDog({ name: '新名字' })
  const draft = createRecoveryDraft(savedDog)

  await withDogSelectPage({ draft, dogs: [latestDog] }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)

    assert.equal(context.data.recoveryVisible, true)
    assert.equal(context.data.recoveryStatus, 'resumable')
    assert.equal(context.data.recoveryDogName, '旧名字')
    assert.match(context.data.recoveryMenuSummary, /番茄炒蛋/)
    assert.deepEqual(navigations, [])
    assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).dog.name, '旧名字')
  })
})

test('继续编辑使用最新狗狗档案进入原草稿 compose', async () => {
  const draft = createRecoveryDraft(createDog({ name: '旧名字' }))
  const latestDog = createDog({ name: '新名字' })

  await withDogSelectPage({ draft, dogs: [latestDog] }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)
    definition.onContinueRecovery.call(context)

    assert.deepEqual(navigations, [
      '/subpackages/shared-meal/compose/index?draftId=draft-entry-recovery'
    ])
    assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).dog.name, '新名字')
  })
})

test('继续编辑遇到不完整档案时先完善，返回后用更新档案继续原草稿', async () => {
  const incompleteDog = createDog({ birthDate: '' })
  const latestDogs = [incompleteDog]
  const draft = createRecoveryDraft(incompleteDog)

  await withDogSelectPage({ draft, dogs: latestDogs }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)
    definition.onContinueRecovery.call(context)
    assert.match(navigations[0], /dog-profile\/dog-edit\/index\?id=dog-recovery/)

    latestDogs[0] = createDog({ name: '完善后的布丁' })
    const returnedDefinition = loadPage('subpackages/shared-meal/dog-select/index.js')
    const returnedContext = {
      ...returnedDefinition,
      data: structuredClone(returnedDefinition.data),
      setData(patch) { Object.assign(this.data, patch) }
    }
    returnedDefinition.onLoad.call(returnedContext, { draftId: draft.id })
    await returnedDefinition.onShow.call(returnedContext)

    assert.match(navigations[1], /compose\/index\?draftId=draft-entry-recovery/)
    assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).dog.name, '完善后的布丁')
  })
})

test('重新开始显式清理旧草稿并停留选狗页', async () => {
  const draft = createRecoveryDraft(createDog())

  await withDogSelectPage({ draft, dogs: [createDog()] }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)
    definition.onRestartRecovery.call(context)

    assert.equal(context.data.recoveryVisible, false)
    assert.notEqual(context.data.draftId, draft.id)
    assert.equal(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), null)
    assert.deepEqual(navigations, [])
  })
})

test('关闭恢复提示保留草稿并且不触发单狗自动跳转', async () => {
  const draft = createRecoveryDraft(createDog())

  await withDogSelectPage({ draft, dogs: [createDog()] }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)
    definition.onCloseRecovery.call(context)

    assert.equal(context.data.recoveryVisible, false)
    assert.deepEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), draft)
    assert.deepEqual(navigations, [])
  })
})

test('Loading 期间关闭恢复提示后不会在档案加载完成时再次弹出', async () => {
  const draft = createRecoveryDraft(createDog())
  let resolveDogs
  const dogs = new Promise((resolve) => { resolveDogs = resolve })

  await withDogSelectPage({ draft, dogs }, async ({ definition, context, navigations }) => {
    definition.onLoad.call(context, {})
    const showing = definition.onShow.call(context)
    definition.onCloseRecovery.call(context)
    resolveDogs([createDog()])
    await showing

    assert.equal(context.data.recoveryVisible, false)
    assert.deepEqual(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY), draft)
    assert.deepEqual(navigations, [])
  })
})

test('失效草稿只显示重新开始，入口模板只使用项目 UI 与 vendor wrapper', async () => {
  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, { schemaVersion: 0, id: 'old-draft' })
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalListDogs = dogService.listDogs
  const originalGetAuthState = authService.getAuthState
  dogService.listDogs = async () => [createDog()]
  authService.getAuthState = () => 'has-profile'

  try {
    const definition = loadPage('subpackages/shared-meal/dog-select/index.js')
    const context = {
      ...definition,
      data: structuredClone(definition.data),
      setData(patch) { Object.assign(this.data, patch) }
    }
    definition.onLoad.call(context, {})
    await definition.onShow.call(context)
    assert.equal(context.data.recoveryStatus, 'invalid')
    assert.equal(context.data.recoveryVisible, true)
  } finally {
    dogService.listDogs = originalListDogs
    authService.getAuthState = originalGetAuthState
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  }

  const source = read('subpackages/shared-meal/dog-select/index.js')
  const template = read('subpackages/shared-meal/dog-select/index.wxml')
  const styles = read('subpackages/shared-meal/dog-select/index.wxss')
  const config = JSON.parse(read('subpackages/shared-meal/dog-select/index.json'))
  assert.doesNotMatch(source, /resumeExistingDraft/)
  assert.doesNotMatch(template, /<button\b|<t-/)
  assert.match(template, /wx:elif="\{\{recoveryStatus === 'resumable'\}\}"/)
  assert.match(template, /继续编辑/)
  assert.match(template, /重新开始/)
  assert.equal((template.match(/variant="warning-outline"/g) || []).length, 1)
  assert.equal((template.match(/size="xlarge"/g) || []).length, 3)
  assert.match(template, /上次做到这里/)
  assert.match(template, /继续会保留现在的菜单和食材；重新开始会清除这份草稿。/)
  assert.match(template, /草稿状态/)
  assert.match(template, /无法安全恢复/)
  assert.match(template, /不会进入原来的编辑内容/)
  assert.match(template, /请稍候，不会修改现有草稿/)
  assert.doesNotMatch(template, /wx:if="\{\{recoveryStatus !== 'loading'\}\}"/)
  assert.match(styles, /max-height:\s*calc\(100vh - 96px\)/)
  assert.match(styles, /padding:\s*0 max\(var\(--df-space-6\), 16px\)/)
  assert.match(styles, /margin-bottom:\s*max\(64rpx, 32px, env\(safe-area-inset-bottom\)\)/)
  assert.match(styles, /padding:\s*max\(48rpx, 24px\)/)
  assert.match(styles, /border-radius:\s*max\(32rpx, 16px\)/)
  assert.match(styles, /width:\s*max\(var\(--df-touch-min\), 44px\)/)
  assert.match(styles, /font-size:\s*max\(40rpx, 20px\)/)
  assert.match(template, /recipe-menu-indicator/)
  assert.match(template, /ui-button/)
  assert.equal(
    config.usingComponents['recipe-menu-indicator'],
    '../../../components/vendor/recipe-menu-indicator/index'
  )
  assert.equal(config.usingComponents['ui-button'], '../../../components/ui/ui-button/index')
})

test('canonical 菜单页只把已发布非 blocked 映射项写入草稿并展示安全分组', () => {
  const source = read('subpackages/shared-meal/menu-search/index.js')
  const template = read('subpackages/shared-meal/menu-search/index.wxml')

  assert.match(source, /canSearchIngredient\(component\)/)
  assert.match(source, /canAutoIncludeIngredient\(component\)/)
  assert.doesNotMatch(
    source,
    /component\.policyStatus\s*(?:===|!==)\s*['"]blocked['"]/
  )
  assert.match(source, /sourceIngredientSelections/)
  assert.match(source, /saveDraft/)
  assert.match(template, /item\.allowedIngredientText/)
  assert.match(template, /item\.blockedIngredientText/)
  assert.match(template, /选好菜单，继续/)
  assert.doesNotMatch(template, /<button\b/)
})

test('compose 使用 v2 连续食材列表并保持所有自动食材克重为空', () => {
  const source = read('subpackages/shared-meal/compose/index.js')
  const template = read('subpackages/shared-meal/compose/index.wxml')
  const generatedService = read('subpackages/custom-recipe/services/energyRequirementService.js')

  assert.match(source, /require\(['"]\.\.\/services\/energyRequirementService['"]\)/)
  assert.match(source, /require\(['"]\.\.\/services\/mealEnergyService['"]\)/)
  assert.match(source, /services\/lifeStageEstimator/)
  assert.match(source, /calculateEnergyRequirement/)
  assert.match(source, /perMealAmountGram === null/)
  assert.match(template, /狗饭食材/)
  assert.match(template, /item\.energyText/)
  assert.match(template, /item\.ratioText/)
  assert.match(template, /icon="minus-circle"/)
  assert.match(template, /compact/)
  assert.match(template, /\{\{humanMealSummary\}\}/)
  assert.match(template, /disabled="\{\{!ingredients\.length\}\}"/)
  assert.match(template, /class="shared-meal-compose-scroll"[^>]*scroll-y/)
  assert.match(template, /class="shared-meal-compose-human-menu-button"[^>]*catchtap="onToggleHumanMealPicker"/)
  assert.match(template, /wx:if="\{\{hasHumanMenus\}\}"[^>]*class="shared-meal-compose-human-menu-button"/s)
  assert.match(template, /shared-meal-compose-bottom-action--save-only/)
  assert.doesNotMatch(template, /本餐能量目标/)
  assert.doesNotMatch(template, /系统不会自动生成单项克重或比例/)
  assert.doesNotMatch(template, /<ui-field[\s\S]*?item\.amountInput/)
  assert.doesNotMatch(template, /备注（可选）|最多 200 字|保存是记录本餐/)
  assert.doesNotMatch(template, /明确重新开始/)
  assert.doesNotMatch(source, /onRestart\(/)
  assert.doesNotMatch(source, /onNoteInput\(|\bnote:\s*['"]/)
  assert.doesNotMatch(
    read('subpackages/shared-meal/compose/index.json'),
    /"ui-field"/
  )
  assert.match(generatedService, /sync-subpackage-services\.js 自动生成/)
  assert.match(generatedService, /\.\.\/\.\.\/\.\.\/services\/dogProfileDerivations/)
})

test('空白狗饭从目录添加首个食材时携带目录发布版本', () => {
  const { moduleExports } = loadPageModule('subpackages/custom-recipe/ingredient-search/index.js')
  const ingredients = moduleExports.addSharedMealIngredient(
    { ingredients: [], dataVersions: null },
    { ...sharedMealFixture, dataVersions: sharedMealFixture.dataVersions },
    80
  )

  assert.equal(ingredients.length, 1)
  assert.deepEqual(ingredients[0].dataVersions, sharedMealFixture.dataVersions)
})

test('compose 对 eligible 菜谱草稿显示能量目标且不填入食材克重', async () => {
  const dogService = require('../services/dogService')
  const mock = require('../services/adapters/mock')
  const storage = require('../utils/storage')
  const {
    SHARED_MEAL_DRAFT_STORAGE_KEY,
    saveDogSelectionDraft,
    createDraftFromMenus,
    saveDraft
  } = require('../subpackages/shared-meal/services/sharedMealDraftService')
  const dog = dogService.decorateSavedDog({
    id: 'dog-compose',
    name: '布丁',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    weightKg: 10,
    dailyMeals: 2,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal',
    specialNutritionNeeds: {
      hasDisease: false,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'none'
    }
  }, '2026-07-27')
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  saveDogSelectionDraft(dog, 'draft-compose')

  const normalizedMenu = humanRecipeService.normalizeRecipeDetail(
    await mock.getHumanRecipe('mock_human_tomato_egg')
  )
  const sourceIngredientSelections = normalizedMenu.ingredients.flatMap((ingredient) => (
    ingredient.components
      .filter((component) => component.selected && canAddIngredient(component))
      .map((component) => ({
        humanMenuId: normalizedMenu.id,
        ingredientPosition: ingredient.position,
        conceptId: component.conceptId,
        variantId: component.variantId
      }))
  ))
  const dataVersions = normalizedMenu.ingredients[0].components[0].dataVersions
  saveDraft(createDraftFromMenus({
    id: 'draft-compose',
    dog,
    humanMenus: [normalizedMenu],
    sourceIngredientSelections,
    dataVersions
  }))

  const definition = loadPage('subpackages/shared-meal/compose/index.js')
  const context = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }
  }
  await definition.onLoad.call(context, { draftId: 'draft-compose' })

  assert.match(context.data.energyTargetText, /千卡/)
  assert.ok(context.data.ingredients.length >= 1)
  assert.ok(context.data.ingredients.every((item) => item.amountInput === ''))
  assert.ok(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).ingredients.every(
    (item) => item.perMealAmountGram === null
  ))
})
