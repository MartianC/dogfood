const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

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
    'compose/index'
  ])

  const dogSelect = read('subpackages/shared-meal/dog-select/index.js')
  const menuSearch = read('subpackages/shared-meal/dog-select/menu-search/index.js')
  const compose = read('subpackages/shared-meal/compose/index.js')
  assert.match(dogSelect, /sharedMealDogEligibility/)
  assert.match(dogSelect, /sharedMealDraftService/)
  assert.match(dogSelect, /authService\.login/)
  assert.match(dogSelect, /dog-select\/menu-search\/index\?draftId=/)
  assert.match(menuSearch, /humanRecipeService\.searchHumanRecipes/)
  assert.match(menuSearch, /createDraftFromMenus/)
  assert.match(menuSearch, /compose\/index\?draftId=/)
  assert.match(compose, /const draftId = String\(options\.draftId/)
  assert.match(compose, /restoreTrustedDraft\(draftId/)
  assert.match(compose, /getHumanRecipe\(humanMenuId\)/)
  assert.doesNotMatch(compose, /options\.(ingredients|foodId|conceptId|variantId)/)
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

test('菜单页只把已发布非 blocked 映射项写入草稿并展示来源原料', () => {
  const source = read('subpackages/shared-meal/dog-select/menu-search/index.js')
  const template = read('subpackages/shared-meal/dog-select/menu-search/index.wxml')

  assert.match(source, /component\.policyStatus !== 'blocked'/)
  assert.match(source, /sourceIngredientSelections/)
  assert.match(source, /saveDraft/)
  assert.match(template, /item\.sourceText/)
  assert.match(template, /component\.blockedReason/)
  assert.match(template, /这顿就吃这些吧/)
  assert.doesNotMatch(template, /<button\b/)
})

test('compose 直接消费根共享能量实现并保持所有自动食材克重为空', () => {
  const source = read('subpackages/shared-meal/compose/index.js')
  const template = read('subpackages/shared-meal/compose/index.wxml')
  const compatibility = read('subpackages/custom-recipe/services/energyRequirementService.js')

  assert.match(source, /services\/meal-assessment\/energyRequirementService/)
  assert.match(source, /services\/lifeStageEstimator/)
  assert.match(source, /calculateEnergyRequirement/)
  assert.match(source, /perMealAmountGram === null/)
  assert.match(template, /本餐能量目标/)
  assert.match(template, /待填写/)
  assert.match(template, /系统不会自动生成单项克重或比例/)
  assert.match(template, /<ui-button[^>]*wx:if="\{\{errorText\}\}"[^>]*>明确重新开始/)
  assert.equal(
    compatibility.trim(),
    "module.exports = require('../../../services/meal-assessment/energyRequirementService')"
  )
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
  } = require('../services/sharedMealDraftService')
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

  const menuModule = loadPageModule(
    'subpackages/shared-meal/dog-select/menu-search/index.js'
  )
  const normalizedMenu = menuModule.moduleExports.normalizeRecipeDetail(
    await mock.getHumanRecipe('mock_human_tomato_egg')
  )
  const sourceIngredientSelections = normalizedMenu.ingredients.flatMap((ingredient) => (
    ingredient.components
      .filter((component) => component.selected && component.policyStatus !== 'blocked')
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
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }
  }
  await definition.onLoad.call(context, { draftId: 'draft-compose' })

  assert.match(context.data.energyTargetText, /千卡/)
  assert.ok(context.data.ingredients.length >= 1)
  assert.ok(context.data.ingredients.every((item) => item.amountText === '待填写'))
  assert.ok(storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY).ingredients.every(
    (item) => item.perMealAmountGram === null
  ))
})
