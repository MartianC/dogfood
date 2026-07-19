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
