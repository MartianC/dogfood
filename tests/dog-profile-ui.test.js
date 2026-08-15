const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
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

test('完整与快速建档只收集出生日期、品种和日均活动时长', () => {
  profilePages.forEach((page) => {
    const js = readPage(page, 'js')
    const wxml = readPage(page, 'wxml')

    assert.doesNotMatch(js, /ageStageOptions|onAge|allergenText|avoidText/)
    assert.doesNotMatch(wxml, /年龄阶段[^<]*<picker|活动强度|过敏源|忌口/)
    assert.doesNotMatch(wxml, /预计成年体重[\s\S]{0,240}<input/)

    assert.match(wxml, /mode="date"/)
    assert.match(wxml, /label="出生日期"/)
    assert.match(wxml, /label="(?:爱宠|狗狗)品种"/)
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
    assert.match(js, /defaultActivityHours:\s*1\.5|dailyActivityHours:\s*1\.5/)
    assert.match(js, /allergens:/)
    assert.match(js, /avoidIngredients:/)
  })
})

test('档案界面不展示实现备注且编辑保存保留隐藏数据字段', () => {
  const editJs = readPage(profilePages[0], 'js')
  const allWxml = profilePages.map((page) => readPage(page, 'wxml')).join('\n')

  assert.doesNotMatch(allWxml, /点击可更换|点击更换|点击区|\d+\s*pt|只读实现|计算方式/)
  assert.match(editJs, /allergens:\s*Array\.isArray\(dog\.allergens\)/)
  assert.match(editJs, /avoidIngredients:\s*Array\.isArray\(dog\.avoidIngredients\)/)
  assert.doesNotMatch(editJs, /allergens:\s*splitText|avoidIngredients:\s*splitText/)
})

test('编辑档案使用原生导航栏，并把删除入口放在头像右侧', () => {
  const wxml = readPage(profilePages[0], 'wxml')
  const json = readPage(profilePages[0], 'json')

  assert.doesNotMatch(json, /"navigationStyle"\s*:\s*"custom"/)
  assert.match(wxml, /class="dog-profile-avatar-row"[\s\S]*?class="dog-profile-delete-action"[\s\S]*?ariaLabel="删除档案"[\s\S]*?>删除档案<\/ui-button>/)
  assert.doesNotMatch(wxml, /dog-profile-navbar__action|>删除<\/ui-button>/)
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

test('档案页所有选择项使用浅灰未选中态和绿色选中态', () => {
  const wxml = readPage(profilePages[0], 'wxml')
  const wxss = readPage('components/ui/ui-tag', 'wxss')

  assert.match(wxml, /profile-choice-selected/)
  assert.doesNotMatch(wxml, /variant="\{\{[^}]+\? 'good' : 'neutral'/)
  assert.match(wxss, /background:\s*var\(--df-profile-color-choice-unselected\)/)
})

test('建档字段变化实时刷新阶段、品种估算和纯时长活动档位', () => {
  profilePages.forEach((page) => {
    const definition = loadPageDefinition(page)
    const context = pageContext(definition)

    definition.onBirthDate.call(context, { detail: { value: '2025-12-18' } })
    assert.equal(context.data.lifeStageLabel, '幼犬晚期')
    assert.equal(context.data.isPuppy, true)

    definition.onBreed.call(context, { detail: { value: 0 } })
    assert.equal(context.data.form.breed, 'shiba-inu')
    assert.equal(context.data.expectedAdultWeightKg, 10.5)

    definition.onActivityHours.call(context, { detail: { value: 3 } })
    assert.equal(context.data.form.dailyActivityHours, 3)
    assert.equal(context.data.activityLevel, 'high')
    assert.equal(context.data.activityLevelLabel, '高活动')
  })
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

test('新建档案保存请求进行中时重复触发不会再次创建', async () => {
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
    for (const page of profilePages) {
      let createCalls = 0
      let finishCreate
      const createPending = new Promise((resolve) => { finishCreate = resolve })
      dogService.createDog = async () => {
        createCalls += 1
        await createPending
      }

      const definition = loadPageDefinition(page)
      const context = pageContext(definition)
      const firstSave = definition.onSave.call(context)
      const repeatedSave = definition.onSave.call(context)

      assert.equal(createCalls, 1, `${page} 不应重复创建档案`)
      finishCreate()
      await Promise.all([firstSave, repeatedSave])
    }
  } finally {
    dogService.normalizeDog = originalNormalize
    dogService.validateDog = originalValidate
    dogService.createDog = originalCreateDog
    global.wx = previousWx
    global.setTimeout = previousSetTimeout
  }
})

test('Slider 和档案选择项暴露无障碍名称、角色与当前状态', () => {
  profilePages.forEach((page) => {
    const wxml = readPage(page, 'wxml')

    assert.match(wxml, /<slider[^>]*aria-role="slider"[^>]*aria-label=/)
    assert.match(wxml, /<slider[^>]*aria-valuenow=/)
    assert.match(wxml, /class="dog-profile-choices"[^>]*aria-role="radiogroup"/)
    assert.match(wxml, /class="dog-profile-choice"[^>]*aria-role="radio"[^>]*aria-label=/)
    assert.match(wxml, /class="dog-profile-choice"[^>]*aria-role="radio"[^>]*aria-checked=/)
  })
})

test('完整与快速建档显式采集三项特殊营养需求且默认未确认', () => {
  profilePages.forEach((page) => {
    const definition = loadPageDefinition(page)
    const context = pageContext(definition)
    const wxml = readPage(page, 'wxml')

    assert.deepEqual(context.data.form.specialNutritionNeeds, {
      hasDisease: null,
      reproductiveStatus: null,
      therapeuticWeightManagement: null
    })
    assert.match(wxml, /label="是否有已确诊疾病"/)
    assert.match(wxml, /label="生殖状态"/)
    assert.match(wxml, /label="治疗性体重管理"/)
    assert.match(wxml, /aria-label="是否有已确诊疾病"/)
    assert.match(wxml, /aria-label="生殖状态"/)
    assert.match(wxml, /aria-label="治疗性体重管理"/)

    definition.onSpecialNutritionNeed.call(context, {
      currentTarget: { dataset: { key: 'hasDisease', value: false } }
    })
    definition.onSpecialNutritionNeed.call(context, {
      currentTarget: { dataset: { key: 'reproductiveStatus', value: 'none' } }
    })
    definition.onSpecialNutritionNeed.call(context, {
      currentTarget: { dataset: { key: 'therapeuticWeightManagement', value: 'loss' } }
    })

    assert.deepEqual(context.data.form.specialNutritionNeeds, {
      hasDisease: false,
      reproductiveStatus: 'none',
      therapeuticWeightManagement: 'loss'
    })
  })
})
