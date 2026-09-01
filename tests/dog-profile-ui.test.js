const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const { breedOptions } = require('../subpackages/dog-profile/data/options')
const profilePages = [
  'subpackages/dog-profile/dog-edit',
  'subpackages/dog-profile/dog-quick-create'
]

function readPage(page, extension) {
  return fs.readFileSync(path.join(root, `${page}/index.${extension}`), 'utf8')
}

function loadPageDefinition(page) {
  const file = path.join(root, `${page}/index.js`)
  let definition
  const previousPage = global.Page
  global.Page = (config) => { definition = config }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = previousPage
  return definition
}

function pageContext(definition) {
  return {
    data: structuredClone(definition.data),
    setData(patch) {
      Object.entries(patch).forEach(([key, value]) => {
        const parts = key.split('.')
        let target = this.data
        parts.slice(0, -1).forEach((part) => {
          target = target[part]
        })
        target[parts.at(-1)] = value
      })
    }
  }
}

test('完整档案页保留基础档案字段和活动时长编辑能力', () => {
  const js = readPage('subpackages/dog-profile/dog-edit', 'js')
  const wxml = readPage('subpackages/dog-profile/dog-edit', 'wxml')

  assert.doesNotMatch(js, /ageStageOptions|onAge|allergenText|avoidText/)
  assert.doesNotMatch(wxml, /年龄阶段[^<]*<picker|活动强度|忌口/)
  assert.match(wxml, /label="过敏食材"/)
  assert.doesNotMatch(wxml, /预计成年体重[\s\S]{0,240}<input/)
  assert.match(wxml, /mode="date"/)
  assert.match(wxml, /label="出生日期"/)
  assert.match(wxml, /label="狗狗品种"/)
  assert.doesNotMatch(wxml, /系统估算阶段|lifeStageLabel/)
  assert.match(wxml, /<slider[^>]*min="0"[^>]*max="6"[^>]*step="0\.5"/)
  assert.match(wxml, /dog-profile-activity-slider__band--low/)
  assert.match(wxml, /dog-profile-activity-slider__band--general/)
  assert.match(wxml, /dog-profile-activity-slider__band--active/)
  assert.match(wxml, /dog-profile-activity-slider__band--high/)
  assert.match(wxml, /日均活动时长/)
  assert.match(wxml, /form\.dailyActivityHours/)
  assert.match(wxml, /activityLevelLabel/)
  assert.match(wxml, /label="体况"/)
  assert.match(wxml, /wx:if="\{\{isPuppy\}\}"[^>]*label="预计成年体重"/)
  assert.match(js, /estimateLifeStage/)
  assert.match(js, /estimateExpectedAdultWeight/)
  assert.match(js, /deriveActivityLevel/)
  assert.match(js, /defaultActivityHours:\s*1\.5/)
  assert.match(js, /allergens:/)
  assert.match(js, /avoidIngredients:/)
})

test('快速建档按 1 至 4 的可见进度收集档案并在登录后直接进入首页', () => {
  const js = readPage('subpackages/dog-profile/dog-quick-create', 'js')
  const wxml = readPage('subpackages/dog-profile/dog-quick-create', 'wxml')
  const wxss = readPage('subpackages/dog-profile/dog-quick-create', 'wxss')

  assert.match(js, /initialStep = 2/)
  assert.match(js, /2:\s*\{ stepText: '1 \/ 4' \}/)
  assert.match(js, /3:\s*\{ stepText: '2 \/ 4' \}/)
  assert.match(js, /4:\s*\{ stepText: '3 \/ 4' \}/)
  assert.match(js, /5:\s*\{ stepText: '4 \/ 4' \}/)
  assert.match(js, /step === 5.*onLoginAndCreate/s)
  assert.match(js, /await authService\.login\(\)/)
  assert.match(js, /await dogService\.createDog\(payload\)/)
  assert.match(wxml, /step === 2/)
  assert.match(wxml, /openType="chooseAvatar"/)
  assert.match(wxml, /bind:chooseavatar="onChooseAvatar"/)
  assert.match(wxml, /label="宠物姓名"/)
  assert.match(wxml, /label="品种"/)
  assert.match(wxml, /step === 3/)
  assert.match(wxml, /label="出生日期"/)
  assert.match(wxml, /label="性别"/)
  assert.match(wxml, /label="当前体重（kg）"/)
  assert.match(wxml, /label="绝育状态"/)
  assert.match(wxml, /step === 4/)
  assert.match(wxml, /<slider[^>]*aria-label="日均活动时长/)
  assert.match(wxml, /label="每日餐数"/)
  assert.doesNotMatch(wxml, /type="number"[^>]*data-key="dailyMeals"/)
  assert.match(wxml, /bindtap="onDailyMeals"/)
  assert.match(wxml, /label="体况"/)
  assert.match(wxml, /label="生殖状态"/)
  assert.match(wxml, /step === 5/)
  assert.match(wxml, /微信登录并完成建档/)
  assert.doesNotMatch(wxml, /step === 6|狗狗档案已保存|bottom-action--surface/)
  assert.match(wxml, /class="dog-onboarding-previous"[^>]*bindtap="onPrevious"/)
  assert.match(wxss, /\.dog-onboarding-step[\s\S]*border-radius:\s*var\(--df-radius-pill\)/)
  assert.match(wxss, /\.dog-onboarding-step[\s\S]*background:\s*var\(--df-color-primary-soft\)/)
  assert.doesNotMatch(wxml, /dog-onboarding-description|dog-onboarding-eyebrow|dog-onboarding-benefits/)
  assert.doesNotMatch(wxml, /过敏食材|预计成年体重/)
})

test('完整档案与快速建档的每日餐数只能选择 1 餐或 2 餐', () => {
  profilePages.forEach((page) => {
    const definition = loadPageDefinition(page)
    const context = pageContext(definition)
    const wxml = readPage(page, 'wxml')

    assert.deepEqual(context.data.dailyMealOptions, [
      { value: 1, label: '1 餐' },
      { value: 2, label: '2 餐' }
    ])
    assert.doesNotMatch(wxml, /type="number"[^>]*data-key="dailyMeals"/)
    assert.match(wxml, /aria-label="每日餐数"/)
    assert.match(wxml, /bindtap="onDailyMeals"/)

    definition.onDailyMeals.call(context, { currentTarget: { dataset: { value: 1 } } })
    assert.equal(context.data.form.dailyMeals, 1)
  })
})

test('快速建档的体况和生殖状态与其他选项使用同一选择块样式', () => {
  const wxml = readPage(profilePages[1], 'wxml')
  const wxss = readPage(profilePages[1], 'wxss')

  assert.doesNotMatch(wxml, /dog-onboarding-choice--compact|<ui-tag/)
  assert.match(wxml, /bodyConditionOptions[\s\S]*dog-onboarding-choice--selected/)
  assert.match(wxml, /reproductiveStatusOptions[\s\S]*dog-onboarding-choice--selected/)
  assert.doesNotMatch(wxss, /\.dog-onboarding-choice--compact/)
})

test('档案界面不展示实现备注且编辑页可选择并保存过敏食材', () => {
  const editJs = readPage(profilePages[0], 'js')
  const allWxml = profilePages.map((page) => readPage(page, 'wxml')).join('\n')

  assert.doesNotMatch(allWxml, /点击可更换|点击更换|点击区|\d+\s*pt|只读实现|计算方式/)
  assert.match(editJs, /allergens:\s*Array\.isArray\(dog\.allergens\)/)
  assert.match(editJs, /allergyDisplayItems/)
  assert.match(editJs, /allergensSelected/)
  assert.match(editJs, /dogId:\s*this\.data\.id/)
  assert.match(allWxml, /选择食材/)
  assert.match(editJs, /avoidIngredients:\s*Array\.isArray\(dog\.avoidIngredients\)/)
  assert.doesNotMatch(editJs, /allergens:\s*splitText|avoidIngredients:\s*splitText/)
})

test('新增档案允许选择过敏食材并将结果暂存回表单', () => {
  const previousWx = global.wx
  let navigateOptions
  let initPayload
  global.wx = {
    navigateTo(options) {
      navigateOptions = options
      options.success({
        eventChannel: {
          emit(name, payload) {
            if (name === 'allergySelectionInit') initPayload = payload
          }
        }
      })
    }
  }

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    definition.onChooseAllergens.call(context)

    assert.ok(navigateOptions)
    assert.deepEqual(initPayload, {
      dogId: '',
      allergens: [],
      deferSave: true
    })

    const allergens = ['concept:food-egg|鸡蛋']
    navigateOptions.events.allergensSelected({ allergens })
    assert.deepEqual(context.data.form.allergens, allergens)
    assert.deepEqual(context.data.allergyDisplayItems.map((item) => item.name), ['鸡蛋'])
  } finally {
    global.wx = previousWx
  }
})

test('通用按钮阻止原生 tap 穿透组件边界', () => {
  const wxml = readPage('components/ui/ui-button', 'wxml')

  assert.match(wxml, /catchtap="handleTap"/)
  assert.doesNotMatch(wxml, /bindtap="handleTap"/)
})

test('过敏选择确认防止重复提交并在云端保存后只返回一层', async () => {
  const dogService = require('../services/dogService')
  const originalUpdate = dogService.updateDogAllergens
  const previousWx = global.wx
  let finishSave
  let updateCalls = 0
  let navigateBackCalls = 0
  let emitted = 0
  const pending = new Promise((resolve) => { finishSave = resolve })
  dogService.updateDogAllergens = async () => {
    updateCalls += 1
    await pending
  }
  global.wx = {
    showToast() {},
    navigateBack() { navigateBackCalls += 1 }
  }

  try {
    const definition = loadPageDefinition('subpackages/custom-recipe/allergy-select')
    const context = pageContext(definition)
    context.data.dogId = 'dog-1'
    context.data.selectedEntries = ['鸡蛋']
    context.openerEventChannel = {
      emit() { emitted += 1 }
    }

    const first = definition.onConfirm.call(context)
    const repeated = definition.onConfirm.call(context)
    assert.equal(updateCalls, 1)
    assert.equal(context.data.confirming, true)

    finishSave()
    await Promise.all([first, repeated])
    assert.equal(emitted, 1)
    assert.equal(navigateBackCalls, 1)
  } finally {
    dogService.updateDogAllergens = originalUpdate
    global.wx = previousWx
  }
})

test('过敏食材云端保存失败时停留当前页并恢复确认按钮', async () => {
  const dogService = require('../services/dogService')
  const originalUpdate = dogService.updateDogAllergens
  const previousWx = global.wx
  let navigateBackCalls = 0
  let toast
  dogService.updateDogAllergens = async () => { throw new Error('保存失败') }
  global.wx = {
    showToast(payload) { toast = payload },
    navigateBack() { navigateBackCalls += 1 }
  }

  try {
    const definition = loadPageDefinition('subpackages/custom-recipe/allergy-select')
    const context = pageContext(definition)
    context.data.dogId = 'dog-1'
    context.data.selectedEntries = ['鸡蛋']
    await definition.onConfirm.call(context)

    assert.equal(context.data.confirming, false)
    assert.equal(navigateBackCalls, 0)
    assert.match(toast.title, /保存失败/)
  } finally {
    dogService.updateDogAllergens = originalUpdate
    global.wx = previousWx
  }
})

test('新增档案的过敏选择只回传结果，不提前更新档案', async () => {
  const dogService = require('../services/dogService')
  const originalUpdate = dogService.updateDogAllergens
  const previousWx = global.wx
  let updateCalls = 0
  let selectedAllergens
  let navigateBackCalls = 0
  dogService.updateDogAllergens = async () => {
    updateCalls += 1
  }
  global.wx = {
    showToast() {},
    navigateBack() { navigateBackCalls += 1 }
  }

  try {
    const definition = loadPageDefinition('subpackages/custom-recipe/allergy-select')
    const context = pageContext(definition)
    context.data.deferSave = true
    context.data.selectedEntries = ['concept:food-egg|鸡蛋']
    context.openerEventChannel = {
      emit(name, payload) {
        if (name === 'allergensSelected') selectedAllergens = payload.allergens
      }
    }

    await definition.onConfirm.call(context)

    assert.equal(updateCalls, 0)
    assert.deepEqual(selectedAllergens, ['concept:food-egg|鸡蛋'])
    assert.equal(navigateBackCalls, 1)
  } finally {
    dogService.updateDogAllergens = originalUpdate
    global.wx = previousWx
  }
})

test('过敏选择页通过 TDesign 适配层集中管理已选食材', () => {
  const wxml = readPage('subpackages/custom-recipe/allergy-select', 'wxml')
  const json = readPage('subpackages/custom-recipe/allergy-select', 'json')
  const adapterWxml = readPage('components/vendor/recipe-filter-tabs', 'wxml')

  assert.match(json, /"recipe-filter-tabs"/)
  assert.doesNotMatch(wxml, /<t-tabs|<t-tab-panel/)
  assert.match(adapterWxml, /<t-tabs/)
  assert.match(adapterWxml, /<t-tab-panel/)
  assert.match(wxml, /value="\{\{activeTab\}\}"/)
  assert.match(wxml, /已选过敏食材/)
  assert.match(wxml, /bindtap="onRemoveSelected"/)
  assert.match(wxml, /bind:tap="onClearSelected"/)
})

test('档案保存与过敏确认按钮使用带安全区的贴边背景层', () => {
  const profileWxml = readPage('subpackages/dog-profile/dog-edit', 'wxml')
  const allergyWxml = readPage('subpackages/custom-recipe/allergy-select', 'wxml')
  const appWxss = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')

  assert.match(profileWxml, /class="bottom-action bottom-action--surface"/)
  assert.match(allergyWxml, /class="bottom-action bottom-action--surface"/)
  assert.match(appWxss, /\.bottom-action\.bottom-action--surface\s*\{[\s\S]*?left:\s*0;[\s\S]*?padding:[^;]*env\(safe-area-inset-bottom\)[^;]*;[\s\S]*?background:\s*var\(--df-color-surface\)/)
})

test('过敏选择页有已有选择时默认展示已选页并支持集中取消', () => {
  const { createAllergyEntry } = require('../services/dogIngredientPolicy')
  const egg = createAllergyEntry({ conceptId: 'food-egg', name: '鸡蛋' })
  const beef = createAllergyEntry({ conceptId: 'food-beef', name: '牛肉' })
  const definition = loadPageDefinition('subpackages/custom-recipe/allergy-select')
  const context = pageContext(definition)
  let initialize
  context.getOpenerEventChannel = () => ({
    on(name, callback) {
      if (name === 'allergySelectionInit') initialize = callback
    }
  })
  context.loadIngredients = async () => true

  definition.onLoad.call(context)
  initialize({ dogId: 'dog-1', allergens: [egg, beef] })

  assert.equal(context.data.activeTab, 'selected')
  assert.deepEqual(context.data.selectedItems.map((item) => item.name), ['鸡蛋', '牛肉'])
  assert.equal(context.data.tabItems[1].label, '已选（2）')

  definition.onRemoveSelected.call(context, { currentTarget: { dataset: { entry: egg } } })
  assert.deepEqual(context.data.selectedEntries, [beef])
  assert.deepEqual(context.data.selectedItems.map((item) => item.name), ['牛肉'])
  assert.equal(context.data.tabItems[1].label, '已选（1）')
})

test('清空全部过敏食材需要二次确认且同步取消总表选中态', () => {
  const { createAllergyEntry } = require('../services/dogIngredientPolicy')
  const egg = createAllergyEntry({ conceptId: 'food-egg', name: '鸡蛋' })
  const definition = loadPageDefinition('subpackages/custom-recipe/allergy-select')
  const context = pageContext(definition)
  const previousWx = global.wx
  context.data.selectedEntries = [egg]
  context.data.selectedItems = [{ raw: egg, key: 'food-egg', name: '鸡蛋' }]
  context.data.ingredients = [{ id: 'egg', conceptId: 'food-egg', name: '鸡蛋', selected: true }]
  global.wx = {
    showModal(options) {
      assert.match(options.content, /确认选择/)
      options.success({ confirm: true })
    }
  }

  try {
    definition.onClearSelected.call(context)
    assert.deepEqual(context.data.selectedEntries, [])
    assert.deepEqual(context.data.selectedItems, [])
    assert.equal(context.data.ingredients[0].selected, false)
    assert.equal(context.data.tabItems[1].label, '已选（0）')
  } finally {
    global.wx = previousWx
  }
})

test('编辑档案使用原生导航栏，并把删除入口放在头像右侧', () => {
  const wxml = readPage(profilePages[0], 'wxml')
  const json = readPage(profilePages[0], 'json')

  assert.doesNotMatch(json, /"navigationStyle"\s*:\s*"custom"/)
  assert.match(wxml, /class="dog-profile-avatar-row"[\s\S]*?class="dog-profile-delete-action"[\s\S]*?ariaLabel="删除档案"[\s\S]*?>删除档案<\/ui-button>/)
  assert.doesNotMatch(wxml, /dog-profile-navbar__action|>删除<\/ui-button>/)
})

test('完整档案在品种右侧提供未选择、女孩和男孩三个性别选项', () => {
  const definition = loadPageDefinition(profilePages[0])
  const context = pageContext(definition)
  const wxml = readPage(profilePages[0], 'wxml')
  const wxss = readPage(profilePages[0], 'wxss')

  assert.deepEqual(context.data.genderOptions, [
    { value: '', label: '未选择' },
    { value: 'female', label: '女孩' },
    { value: 'male', label: '男孩' }
  ])
  assert.equal(context.data.form.gender, '')
  assert.equal(context.data.genderIndex, 0)
  assert.match(wxml, /class="dog-profile-pair"[\s\S]*?label="狗狗品种"[\s\S]*?label="狗狗性别"/)
  assert.match(wxml, /range="\{\{genderOptions\}\}"/)
  assert.match(wxml, /range-key="label"/)
  assert.match(wxss, /\.dog-profile-picker-value\s*\{[\s\S]*text-overflow:\s*ellipsis/)

  definition.onGenderChange.call(context, { detail: { value: '1' } })
  assert.equal(context.data.form.gender, 'female')
  assert.equal(context.data.genderIndex, 1)

  definition.onGenderChange.call(context, { detail: { value: '2' } })
  assert.equal(context.data.form.gender, 'male')
  assert.equal(context.data.genderIndex, 2)
})

test('编辑档案载入已有性别时回显对应选项', async () => {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalListDogs = dogService.listDogs
  const originalAuthState = authService.getAuthState
  dogService.listDogs = async () => [{
    id: 'female-dog',
    name: '布丁',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    gender: 'female',
    weightKg: 8,
    dailyMeals: 2,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal'
  }]
  authService.getAuthState = () => 'authenticated'

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    await definition.onLoad.call(context, { id: 'female-dog' })

    assert.equal(context.data.form.gender, 'female')
    assert.equal(context.data.genderIndex, 1)
  } finally {
    dogService.listDogs = originalListDogs
    authService.getAuthState = originalAuthState
  }
})

test('编辑旧档案时将超出新选项范围的餐数回显为 2 餐', async () => {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalListDogs = dogService.listDogs
  const originalAuthState = authService.getAuthState
  dogService.listDogs = async () => [{
    id: 'legacy-meals-dog',
    name: '旧档案',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    weightKg: 8,
    dailyMeals: 3,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal'
  }]
  authService.getAuthState = () => 'authenticated'

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    await definition.onLoad.call(context, { id: 'legacy-meals-dog' })

    assert.equal(context.data.form.dailyMeals, 2)
  } finally {
    dogService.listDogs = originalListDogs
    authService.getAuthState = originalAuthState
  }
})

test('编辑档案头像沿用狗狗列表的默认 SVG 和圆角矩形规格', () => {
  const js = readPage(profilePages[0], 'js')
  const wxml = readPage(profilePages[0], 'wxml')
  const wxss = readPage(profilePages[0], 'wxss')

  assert.match(js, /defaultDogAvatar:\s*assets\.defaultDogAvatar/)
  assert.match(wxml, /src="\{\{form\.avatarUrl \|\| defaultDogAvatar\}\}"/)
  assert.match(wxss, /\.dog-profile-avatar__image[\s\S]*border-radius:\s*24rpx/)
  assert.doesNotMatch(wxml, /dog-profile-avatar__fallback|avatarInitial/)
})

test('完整与快速建档头像都使用微信 chooseAvatar，并不再调用普通图片选择 API', () => {
  profilePages.forEach((page) => {
    const js = readPage(page, 'js')
    const wxml = readPage(page, 'wxml')

    assert.match(wxml, /openType="chooseAvatar"/)
    assert.match(wxml, /bind:chooseavatar="onChooseAvatar"/)
    assert.doesNotMatch(js, /chooseLocalImage|openAvatarEditor|chooseMedia|chooseImage/)
  })
})

test('档案页所有选择项使用浅灰未选中态和绿色选中态', () => {
  const wxml = readPage(profilePages[0], 'wxml')
  const wxss = readPage('components/ui/ui-tag', 'wxss')

  assert.match(wxml, /profile-choice-selected/)
  assert.doesNotMatch(wxml, /variant="\{\{[^}]+\? 'good' : 'neutral'/)
  assert.match(wxss, /background:\s*var\(--df-profile-color-choice-unselected\)/)
})

test('档案选择胶囊视觉收紧但保留最小点击区域', () => {
  const tagWxss = readPage('components/ui/ui-tag', 'wxss')
  const profileWxss = readPage(profilePages[0], 'wxss')

  assert.match(tagWxss, /min-height:\s*var\(--df-profile-choice-height\)/)
  assert.match(tagWxss, /min-width:\s*var\(--df-profile-choice-min-width\)/)
  assert.match(tagWxss, /font-size:\s*var\(--df-font-sm\)/)
  assert.match(tagWxss, /border-radius:\s*var\(--df-radius-pill\)/)
  assert.match(profileWxss, /\.dog-profile-choice\s*\{[\s\S]*min-height:\s*88rpx/)
})

test('完整档案字段变化实时刷新阶段、品种估算和活动档位', () => {
  const definition = loadPageDefinition(profilePages[0])
  const context = pageContext(definition)

  definition.onBirthDate.call(context, { detail: { value: '2025-12-18' } })
  assert.equal(context.data.lifeStageLabel, '幼犬晚期')
  assert.equal(context.data.isPuppy, true)

  definition.applyBreed.call(context, 'shiba-inu')
  assert.equal(context.data.form.breed, 'shiba-inu')
  assert.equal(context.data.breedLabel, '柴犬')
  assert.equal(context.data.expectedAdultWeightKg, 10.5)

  definition.onActivityHours.call(context, { detail: { value: 3 } })
  assert.equal(context.data.form.dailyActivityHours, 3)
  assert.equal(context.data.activityLevel, 'high')
  assert.equal(context.data.activityLevelLabel, '高活动')

  definition.onDailyMeals.call(context, { currentTarget: { dataset: { value: 1 } } })
  assert.equal(context.data.form.dailyMeals, 1)
})

test('快速建档字段变化更新品种和活动 Slider，但不展示估算字段', () => {
  const definition = loadPageDefinition(profilePages[1])
  const context = pageContext(definition)

  definition.onBirthDate.call(context, { detail: { value: '2025-12-18' } })
  assert.equal(context.data.lifeStageLabel, '幼犬晚期')

  definition.applyBreed.call(context, 'shiba-inu')
  assert.equal(context.data.form.breed, 'shiba-inu')
  assert.equal(context.data.breedLabel, '柴犬')

  definition.onActivityHours.call(context, { detail: { value: 4 } })
  assert.equal(context.data.form.activityLevel, 'high')
  assert.equal(context.data.form.dailyActivityHours, 4)
  assert.equal(context.data.activityThumbLeft, 4 / 6 * 100)

  definition.onDailyMeals.call(context, { currentTarget: { dataset: { value: 1 } } })
  assert.equal(context.data.form.dailyMeals, 1)
  assert.equal(context.data.dailyMealsError, '')
})

test('编辑旧档案不会把缺失活动时长或旧 high 静默改成 1.5 小时', async () => {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalListDogs = dogService.listDogs
  const originalAuthState = authService.getAuthState
  dogService.listDogs = async () => [{
    id: 'legacy-dog',
    name: '旧档案',
    birthDate: '2020-01-01',
    breed: 'labrador-retriever',
    weightKg: 25,
    dailyMeals: 2,
    activityLevel: 'high',
    bodyCondition: 'ideal'
  }]
  authService.getAuthState = () => 'authenticated'

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    await definition.onLoad.call(context, { id: 'legacy-dog' })

    assert.equal(context.data.form.dailyActivityHours, null)
    assert.equal(context.data.activityLevel, '')
    assert.equal(context.data.activityLevelLabel, '待选择')
  } finally {
    dogService.listDogs = originalListDogs
    authService.getAuthState = originalAuthState
  }
})

test('保存未主动选择活动时长的旧档案会保留缺失值并显示字段错误', async () => {
  const dogService = require('../services/dogService')
  const originalNormalize = dogService.normalizeDog
  const originalValidate = dogService.validateDog
  const previousWx = global.wx
  let savedPayload
  dogService.normalizeDog = (payload) => {
    savedPayload = payload
    return payload
  }
  dogService.validateDog = () => {
    throw new Error('请选择 0–6 小时的日均活动时长')
  }
  global.wx = { showToast() {} }

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    context.data.form.dailyActivityHours = null
    await definition.onSave.call(context)

    assert.equal(savedPayload.dailyActivityHours, null)
    assert.equal(context.data.dailyActivityHoursError, '请选择 0–6 小时的日均活动时长')
  } finally {
    dogService.normalizeDog = originalNormalize
    dogService.validateDog = originalValidate
    global.wx = previousWx
  }
})

test('编辑档案保存请求进行中时重复触发不会再次创建', async () => {
  const dogService = require('../services/dogService')
  const originalNormalize = dogService.normalizeDog
  const originalValidate = dogService.validateDog
  const originalCreateDog = dogService.createDog
  const previousWx = global.wx
  const previousSetTimeout = global.setTimeout
  dogService.normalizeDog = (payload) => payload
  dogService.validateDog = () => {}
  global.wx = { showToast() {}, navigateBack() {} }
  global.setTimeout = (callback) => callback()

  try {
    let createCalls = 0
    let finishCreate
    const createPending = new Promise((resolve) => { finishCreate = resolve })
    dogService.createDog = async () => {
      createCalls += 1
      await createPending
    }

    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    const firstSave = definition.onSave.call(context)
    const repeatedSave = definition.onSave.call(context)

    assert.equal(createCalls, 1, '编辑页不应重复创建档案')
    finishCreate()
    await Promise.all([firstSave, repeatedSave])
  } finally {
    dogService.normalizeDog = originalNormalize
    dogService.validateDog = originalValidate
    dogService.createDog = originalCreateDog
    global.wx = previousWx
    global.setTimeout = previousSetTimeout
  }
})

test('快速建档登录请求进行中时重复触发不会重复登录或创建', async () => {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalNormalize = dogService.normalizeDog
  const originalValidate = dogService.validateDog
  const originalCreateDog = dogService.createDog
  const originalAuthState = authService.getAuthState
  const originalLogin = authService.login
  const previousWx = global.wx
  let finishCreate
  let createCalls = 0
  let loginCalls = 0
  const navigations = []
  const createPending = new Promise((resolve) => { finishCreate = resolve })

  dogService.normalizeDog = (payload) => payload
  dogService.validateDog = () => {}
  dogService.createDog = async () => {
    createCalls += 1
    await createPending
    return { id: 'dog-1', name: '团团', breed: 'shiba-inu', gender: 'female', weightKg: 10, dailyMeals: 2 }
  }
  authService.getAuthState = () => 'guest'
  authService.login = async () => {
    loginCalls += 1
    return true
  }
  global.wx = {
    showToast() {},
    switchTab({ url }) { navigations.push(url) }
  }

  try {
    const definition = loadPageDefinition(profilePages[1])
    const context = pageContext(definition)
    context.validateStep = definition.validateStep
    context.redirectAfterCreation = definition.redirectAfterCreation
    context.data.step = 5
    context.data.form = {
      ...context.data.form,
      name: '团团',
      birthDate: '2020-01-01',
      breed: 'shiba-inu',
      gender: 'female',
      weightKg: '10',
      dailyMeals: 2,
      activityLevel: 'moderateLowImpact',
      dailyActivityHours: 1.5,
      bodyCondition: 'ideal',
      neutered: true,
      avatarUrl: '/tmp/avatar.png',
      specialNutritionNeeds: {
        ...context.data.form.specialNutritionNeeds,
        reproductiveStatus: 'none'
      }
    }

    const firstSave = definition.onLoginAndCreate.call(context)
    const repeatedSave = definition.onLoginAndCreate.call(context)
    await Promise.resolve()

    assert.equal(loginCalls, 1)
    assert.equal(createCalls, 1)
    assert.equal(context.data.saving, true)

    finishCreate()
    await Promise.all([firstSave, repeatedSave])
    assert.equal(context.data.step, 5)
    assert.deepEqual(navigations, ['/pages/home/index'])
    assert.equal(context.data.saving, false)
  } finally {
    dogService.normalizeDog = originalNormalize
    dogService.validateDog = originalValidate
    dogService.createDog = originalCreateDog
    authService.getAuthState = originalAuthState
    authService.login = originalLogin
    global.wx = previousWx
  }
})

test('快速建档按步骤校验字段并在第四页完成后进入微信登录页', () => {
  const definition = loadPageDefinition(profilePages[1])
  const context = pageContext(definition)
  context.validateStep = definition.validateStep

  definition.onNext.call(context)
  assert.equal(context.data.step, 2)
  assert.equal(context.data.nameError, '请填写宠物姓名')
  assert.equal(context.data.breedError, '请选择宠物品种')

  context.data.form.name = '团团'
  context.data.form.breed = 'shiba-inu'
  definition.onNext.call(context)
  assert.equal(context.data.step, 3)

  definition.onNext.call(context)
  assert.equal(context.data.step, 3)
  assert.equal(context.data.birthDateError, '请填写正确的出生日期')
  assert.equal(context.data.genderError, '请选择狗狗性别')
  assert.equal(context.data.weightError, '请填写狗狗体重')
  assert.equal(context.data.neuteredError, '请选择绝育状态')

  Object.assign(context.data.form, {
    birthDate: '2020-01-01',
    gender: 'female',
    weightKg: '10',
    neutered: true,
    activityLevel: '',
    dailyActivityHours: '',
    bodyCondition: '',
    dailyMeals: '',
    specialNutritionNeeds: { reproductiveStatus: '' }
  })
  definition.onNext.call(context)
  assert.equal(context.data.step, 4)

  definition.onNext.call(context)
  assert.equal(context.data.step, 4)
  assert.equal(context.data.dailyActivityHoursError, '请选择活动水平')
  assert.equal(context.data.dailyMealsError, '请选择每日餐数')
  assert.equal(context.data.bodyConditionError, '请选择体况')
  assert.equal(context.data.reproductiveStatusError, '请选择生殖状态')

  Object.assign(context.data.form, {
    activityLevel: 'moderateLowImpact',
    dailyActivityHours: 1.5,
    dailyMeals: 2,
    bodyCondition: 'ideal',
    specialNutritionNeeds: { reproductiveStatus: 'none' }
  })
  definition.onNext.call(context)
  assert.equal(context.data.step, 5)
  assert.equal(context.data.stepText, '4 / 4')
})

test('新增档案最终保存时携带暂存的过敏食材', async () => {
  const dogService = require('../services/dogService')
  const authService = require('../services/authService')
  const originalNormalize = dogService.normalizeDog
  const originalValidate = dogService.validateDog
  const originalCreateDog = dogService.createDog
  const originalAuthState = authService.getAuthState
  const previousWx = global.wx
  const previousSetTimeout = global.setTimeout
  let savedPayload
  dogService.normalizeDog = (payload) => payload
  dogService.validateDog = () => {}
  dogService.createDog = async (payload) => {
    savedPayload = payload
    return { id: 'dog-1' }
  }
  authService.getAuthState = () => 'authenticated'
  global.wx = { showToast() {}, navigateBack() {} }
  global.setTimeout = (callback) => callback()

  try {
    const definition = loadPageDefinition(profilePages[0])
    const context = pageContext(definition)
    context.data.form.allergens = ['concept:food-egg|鸡蛋']

    await definition.onSave.call(context)

    assert.deepEqual(savedPayload.allergens, ['concept:food-egg|鸡蛋'])
  } finally {
    dogService.normalizeDog = originalNormalize
    dogService.validateDog = originalValidate
    dogService.createDog = originalCreateDog
    authService.getAuthState = originalAuthState
    global.wx = previousWx
    global.setTimeout = previousSetTimeout
  }
})

test('完整档案 Slider 和选择项暴露无障碍名称、角色与当前状态', () => {
  const wxml = readPage(profilePages[0], 'wxml')

  assert.match(wxml, /<slider[^>]*aria-role="slider"[^>]*aria-label=/)
  assert.match(wxml, /<slider[^>]*aria-valuenow=/)
  assert.match(wxml, /class="dog-profile-choices"[^>]*aria-role="radiogroup"/)
  assert.match(wxml, /class="dog-profile-choice"[^>]*aria-role="radio"[^>]*aria-label=/)
  assert.match(wxml, /class="dog-profile-choice"[^>]*aria-role="radio"[^>]*aria-checked=/)
})

test('快速建档 Slider 和选择项暴露无障碍名称、角色与当前状态', () => {
  const wxml = readPage(profilePages[1], 'wxml')

  assert.match(wxml, /<slider[^>]*aria-role="slider"[^>]*aria-label=/)
  assert.match(wxml, /<slider[^>]*aria-valuenow=/)
  assert.match(wxml, /class="dog-onboarding-choices"[^>]*aria-role="radiogroup"[^>]*aria-label="性别"/)
  assert.match(wxml, /class="dog-onboarding-choice[^>]*aria-role="radio"[^>]*aria-label="男孩"[^>]*aria-checked=/)
})

test('档案隐藏已移除的三个选项并保留特殊营养需求数据兼容', () => {
  profilePages.forEach((page) => {
    const definition = loadPageDefinition(page)
    const context = pageContext(definition)
    const js = readPage(page, 'js')
    const wxml = readPage(page, 'wxml')

    assert.doesNotMatch(js, /dietGoalOptions|diseaseStatusOptions|therapeuticWeightManagementOptions|goalIndex|onGoalTap/)
    assert.doesNotMatch(wxml, /饮食目标|是否有已确诊疾病|治疗性体重管理/)
    assert.equal(context.data.form.dietGoal, 'daily')
    assert.deepEqual(context.data.form.specialNutritionNeeds, page.endsWith('dog-quick-create')
      ? { hasDisease: null, reproductiveStatus: 'none', therapeuticWeightManagement: null }
      : { hasDisease: null, reproductiveStatus: null, therapeuticWeightManagement: null })
    assert.match(wxml, /label="生殖状态"/)
    assert.match(wxml, /aria-label="生殖状态"/)

    definition.onSpecialNutritionNeed.call(context, {
      currentTarget: { dataset: { key: 'reproductiveStatus', value: 'none' } }
    })

    assert.deepEqual(context.data.form.specialNutritionNeeds, {
      hasDisease: null,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: null
    })
  })
})
