const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadComponentDefinition() {
  const file = path.join(root, 'components/nutrition-assessment/index.js')
  let definition
  const previousComponent = global.Component
  global.Component = (config) => { definition = config }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Component = previousComponent
  return definition
}

test('本餐评估模板独立展示能量与营养密度两轴', () => {
  const wxml = read('components/nutrition-assessment/index.wxml')

  assert.match(wxml, /本餐评估/)
  assert.match(wxml, /viewAssessment\.energy\.statusLabel/)
  assert.match(wxml, /viewAssessment\.nutritionDensity\.statusLabel/)
  assert.match(wxml, /份量与能量/)
  assert.match(wxml, /营养密度/)
  assert.match(wxml, /不包含零食及其他额外喂食/)
  assert.match(wxml, /按目标调整整餐份量/)
  assert.match(wxml, /rangeStartText/)
  assert.match(wxml, /暂无法判断本餐份量/)
  assert.match(wxml, /暂无法判断营养密度/)
  assert.doesNotMatch(wxml, /viewAssessment\.statusLabel/)
  assert.doesNotMatch(wxml, /总体状态|综合评分/)
})

test('本餐评估支持创建页专用紧凑收起态且不改变默认态', () => {
  const definition = loadComponentDefinition()
  const wxml = read('components/nutrition-assessment/index.wxml')
  const wxss = read('components/nutrition-assessment/index.wxss')

  assert.deepEqual(definition.properties.compact, { type: Boolean, value: false })
  assert.match(wxml, /nutrition-assessment__summary--compact/)
  assert.match(wxss, /\.nutrition-assessment__summary--compact/)
})

test('品种估重缺失和高活动范围使用已确认的恢复与起始参考文案', () => {
  const definition = loadComponentDefinition()
  const context = {
    data: {},
    setData(patch, callback) {
      Object.assign(this.data, patch)
      if (callback) callback()
    },
    applyElementFilter() {}
  }

  definition.observers.assessment.call(context, {
    lifeStage: { available: true, reason: '', energyStage: 'puppy' },
    energy: {
      available: false,
      reason: 'breed_estimate_unavailable',
      status: 'unavailable',
      statusLabel: '暂无法判断本餐份量',
      mealTarget: null,
      dailyTarget: null,
      missingIngredients: [],
      scaleSuggestion: { available: false }
    },
    nutritionDensity: { standards: [], elements: [] }
  })
  assert.equal(context.data.viewAssessment.profileActionLabel, '完善狗狗品种')

  definition.observers.assessment.call(context, {
    lifeStage: { available: true, reason: '', energyStage: 'adult' },
    energy: {
      available: true,
      reason: '',
      status: 'near_target',
      statusLabel: '能量接近估算目标',
      currentKcal: 450,
      mealTarget: { min: 421.8, max: 492.1 },
      dailyTarget: { min: 843.5, max: 984.1 },
      missingIngredients: [],
      scaleSuggestion: { available: false }
    },
    nutritionDensity: { standards: [], elements: [] }
  })
  assert.equal(
    context.data.viewAssessment.energy.rangeStartText,
    '高活动目标为范围，建议先从下界 421.8 kcal 作为起始参考。'
  )
})

test('份量预览确认只通过 scaleconfirm 输出建议食材', () => {
  const definition = loadComponentDefinition()
  const events = []
  const context = {
    data: {
      viewAssessment: {
        energy: {
          scaleSuggestion: {
            available: true,
            rawSuggestedIngredients: [{ id: 'food_a', perMealAmountGram: 108 }]
          }
        }
      }
    },
    setData(patch) { Object.assign(this.data, patch) },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  }

  definition.methods.onConfirmScalePreview.call(context)

  assert.deepEqual(events, [{
    name: 'scaleconfirm',
    detail: { ingredients: [{ id: 'food_a', perMealAmountGram: 108 }] }
  }])
  assert.equal(context.data.scalePreviewVisible, false)
})

test('食谱编辑页使用组合评估、缓存和档案恢复路径', () => {
  const js = read('subpackages/custom-recipe/edit/index.js')
  const wxml = read('subpackages/custom-recipe/edit/index.wxml')

  assert.match(js, /require\(['"]\.\.\/services\/mealAssessmentService['"]\)/)
  assert.match(js, /loadMealAssessmentData/)
  assert.match(js, /buildMealAssessment/)
  assert.match(js, /mealAssessmentRequestId/)
  assert.match(js, /mealAssessmentDataSignature/)
  assert.match(js, /finally/)
  assert.match(js, /async onShow\(\)/)
  assert.match(js, /await dogService\.listDogs\(\)/)
  assert.match(js, /onMealScaleConfirm/)
  assert.match(js, /onCompleteDogProfile/)
  assert.match(js, /subpackages\/dog-profile\/dog-edit\/index/)
  assert.match(wxml, /assessment="\{\{mealAssessment\}\}"/)
  assert.match(wxml, /bind:scaleconfirm="onMealScaleConfirm"/)
  assert.match(wxml, /bind:completeprofile="onCompleteDogProfile"/)
  assert.doesNotMatch(js, /nutritionAssessmentService\.buildAssessment/)
})

test('营养评估展开为保留顶部露出区的弹出层并支持下滑收起', () => {
  const definition = loadComponentDefinition()
  const wxml = read('components/nutrition-assessment/index.wxml')
  const wxss = read('components/nutrition-assessment/index.wxss')

  assert.match(wxml, /expandedMounted/)
  assert.match(wxml, /nutrition-assessment__expanded-grabber/)
  assert.match(wxml, /class="nutrition-assessment__summary[^"]*"/)
  assert.match(wxml, /class="nutrition-assessment__expanded-backdrop"/)
  assert.match(wxml, /bindtouchstart="onExpandedTouchStart"/)
  assert.match(wxml, /bindtouchmove="onExpandedTouchMove"/)
  assert.match(wxml, /bindtouchend="onExpandedTouchEnd"/)
  assert.match(wxml, /bindscroll="onExpandedScroll"/)
  assert.match(wxml, /upper-threshold="0"/)
  assert.match(wxml, /bindscrolltoupper="onExpandedScrollToUpper"/)
  assert.doesNotMatch(wxml, /nutrition-assessment__collapse/)
  assert.match(wxss, /top:\s*96rpx;/)
  assert.match(wxss, /transition:\s*transform\s+320ms\s+ease-out;/)
  assert.match(wxss, /transform:\s*translateY\(100%\)/)
  assert.equal(typeof definition.observers.expanded, 'function')
  assert.equal(typeof definition.methods.onExpandedScroll, 'function')
  assert.equal(typeof definition.methods.onExpandedScrollToUpper, 'function')
  assert.equal(typeof definition.methods.onExpandedTouchStart, 'function')
  assert.equal(typeof definition.methods.onExpandedTouchMove, 'function')
  assert.equal(typeof definition.methods.onExpandedTouchEnd, 'function')
})

test('营养评估下滑超过阈值时在 touchmove 阶段收起', () => {
  const definition = loadComponentDefinition()
  const events = []
  const context = {
    properties: { expanded: true },
    expandedScrollTop: 0,
    triggerEvent(name, detail) { events.push({ name, detail }) },
    onToggle: definition.methods.onToggle,
    readExpandedScrollTop(callback) { callback(this.expandedScrollTop) }
  }

  definition.methods.onExpandedTouchStart.call(context, {
    touches: [{ clientY: 120 }]
  })
  definition.methods.onExpandedTouchMove.call(context, {
    touches: [{ clientY: 180 }]
  })

  assert.deepEqual(events, [{ name: 'toggle', detail: { expanded: false } }])
  assert.equal(context.expandedTouchCloseTriggered, true)
})

test('营养评估手指向上滑动时不触发收起', () => {
  const definition = loadComponentDefinition()
  const events = []
  const context = {
    properties: { expanded: true },
    expandedScrollTop: 0,
    triggerEvent(name, detail) { events.push({ name, detail }) },
    onToggle: definition.methods.onToggle,
    readExpandedScrollTop(callback) { callback(this.expandedScrollTop) }
  }

  definition.methods.onExpandedTouchStart.call(context, {
    touches: [{ clientY: 240 }]
  })
  definition.methods.onExpandedTouchMove.call(context, {
    touches: [{ clientY: 180 }]
  })

  assert.deepEqual(events, [])
})

test('营养评估只有在详情已滚到顶部时才允许下滑收起', () => {
  const definition = loadComponentDefinition()
  const events = []
  const context = {
    properties: { expanded: true },
    expandedScrollTop: 80,
    triggerEvent(name, detail) { events.push({ name, detail }) },
    onToggle: definition.methods.onToggle,
    readExpandedScrollTop(callback) { callback(this.expandedScrollTop) }
  }

  definition.methods.onExpandedTouchStart.call(context, {
    touches: [{ clientY: 120 }]
  })
  definition.methods.onExpandedTouchMove.call(context, {
    touches: [{ clientY: 180 }]
  })

  assert.deepEqual(events, [])
})

test('营养评估滚动时只更新实例滚动位置，不触发视图数据更新', () => {
  const definition = loadComponentDefinition()
  const context = {
    expandedScrollTop: 0,
    setData() {
      throw new Error('滚动过程中不应触发 setData')
    }
  }

  definition.methods.onExpandedScroll.call(context, {
    detail: { scrollTop: 36 }
  })

  assert.equal(context.expandedScrollTop, 36)
})

test('营养评估惯性滚动到顶部后仍允许下滑收起', () => {
  const definition = loadComponentDefinition()
  const events = []
  const context = {
    properties: { expanded: true },
    expandedScrollTop: 80,
    triggerEvent(name, detail) { events.push({ name, detail }) },
    onToggle: definition.methods.onToggle,
    readExpandedScrollTop(callback) { callback(this.expandedScrollTop) }
  }

  definition.methods.onExpandedScrollToUpper.call(context)
  definition.methods.onExpandedTouchStart.call(context, {
    touches: [{ clientY: 120 }]
  })
  definition.methods.onExpandedTouchMove.call(context, {
    touches: [{ clientY: 180 }]
  })

  assert.deepEqual(events, [{ name: 'toggle', detail: { expanded: false } }])
})

test('营养评估以原生 scrollTop 为准，不被过期缓存阻止下滑收起', async () => {
  const definition = loadComponentDefinition()
  const events = []
  const selectorQuery = {
    select() { return this },
    scrollOffset(callback) {
      callback({ scrollTop: 0 })
      return this
    },
    exec() {}
  }
  const context = {
    properties: { expanded: true },
    expandedScrollTop: 80,
    createSelectorQuery: () => selectorQuery,
    triggerEvent(name, detail) { events.push({ name, detail }) },
    onToggle: definition.methods.onToggle,
    readExpandedScrollTop: definition.methods.readExpandedScrollTop
  }

  definition.methods.onExpandedTouchStart.call(context, {
    touches: [{ clientY: 120 }]
  })
  definition.methods.onExpandedTouchMove.call(context, {
    touches: [{ clientY: 180 }]
  })
  await Promise.resolve()

  assert.deepEqual(events, [{ name: 'toggle', detail: { expanded: false } }])
})

test('营养评估取消触摸时清理下滑状态', () => {
  const definition = loadComponentDefinition()
  const context = {
    expandedTouchStartY: 120,
    expandedTouchStartScrollTop: 10,
    expandedTouchCloseTriggered: true
  }

  definition.methods.onExpandedTouchCancel.call(context)

  assert.equal(context.expandedTouchStartY, 0)
  assert.equal(context.expandedTouchStartScrollTop, 0)
  assert.equal(context.expandedTouchCloseTriggered, false)
})

test('本餐评估展开时的父级堆叠层覆盖保存操作', () => {
  const wxml = read('subpackages/custom-recipe/edit/index.wxml')
  const wxss = read('subpackages/custom-recipe/edit/index.wxss')

  assert.match(
    wxml,
    /nutritionExpanded \? 'recipe-design-summary-floating--expanded' : ''/
  )
  assert.match(wxss, /\.recipe-design-summary-floating--expanded\s*{[^}]*z-index:\s*30;/s)
  assert.match(wxss, /\.recipe-design-save-action\s*{[^}]*z-index:\s*20;/s)
})
