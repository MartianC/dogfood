const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createSharedMealRecordDetailModel
} = require('../subpackages/shared-meal/record-detail/viewModel')

function fullRecord(overrides = {}) {
  return {
    id: 'record-1',
    mealTime: '2026-07-30T10:35:00.000Z',
    dogSnapshot: {
      name: '布丁',
      breed: 'shiba-inu',
      weightKg: 8.2,
      lifeStageLabel: '成年犬',
      dailyActivityHours: 1.5
    },
    humanMenu: [
      {
        id: 'menu-beef',
        title: '番茄牛腩',
        ingredients: [
          { position: 0, sourceText: '牛肉', amountText: '100 g' },
          { position: 1, sourceText: '番茄', amountText: '60 g' }
        ]
      },
      {
        id: 'menu-broccoli',
        title: '清炒西兰花',
        ingredients: [{ position: 0, sourceText: '西兰花', amountText: '35 g' }]
      }
    ],
    dogMealItems: [
      {
        variantId: 'beef-raw',
        name: '牛肉',
        perMealAmountGram: 108,
        preparationState: 'raw',
        sourceRefs: [{ humanMenuId: 'menu-beef', ingredientPosition: 0 }]
      },
      {
        variantId: 'pumpkin-cooked',
        name: '南瓜',
        perMealAmountGram: 65,
        preparationState: 'simmered',
        sourceRefs: []
      },
      {
        variantId: 'broccoli-cooked',
        name: '西兰花',
        perMealAmountGram: 38,
        preparationState: 'simmered',
        sourceRefs: [{ humanMenuId: 'menu-broccoli', ingredientPosition: 0 }]
      }
    ],
    assessment: {
      schemaVersion: 1,
      energy: {
        available: true,
        status: 'near_target',
        statusLabel: '能量接近估算目标',
        currentKcal: 310,
        mealTarget: { min: 310, max: 310 },
        missingIngredients: []
      },
      nutritionDensity: {
        available: true,
        status: 'suitable',
        statusLabel: '基本合适',
        primaryAdvice: '当前已评估的主要营养指标处于国标参考范围内',
        counts: { adjust: 0, met: 8, unavailable: 0 },
        standards: [{ key: 'gb', lowItems: [], highItems: [] }]
      },
      dataCoverage: { energyComplete: true, unavailableNutrientCount: 0 }
    },
    versions: {
      policyVersion: '2026.07',
      nutritionSourceReleaseId: 'CN-2026.1',
      assessmentAlgorithmVersion: 'meal-assessment/v1',
      standardVersions: [{ key: 'gb', code: 'GB/T 31216-2014', profileCode: 'adult' }]
    },
    note: '晚餐后精神不错，明天继续观察接受情况。',
    photoFileIds: [],
    ...overrides
  }
}

test('完整详情模型从不可变快照生成狗狗、人饭、狗饭、双轴、覆盖和版本分组', () => {
  const model = createSharedMealRecordDetailModel(fullRecord())

  assert.equal(model.dog.heading, '布丁的一顿饭')
  assert.equal(model.dog.mealTimeText, '2026年7月30日 18:35')
  assert.equal(model.dog.profileText, '柴犬 · 8.2 kg · 成年犬 · 日均 1.5 小时')
  assert.deepEqual(model.humanMenus.map((menu) => [menu.title, menu.ingredientsText]), [
    ['番茄牛腩', '牛肉 100 g · 番茄 60 g'],
    ['清炒西兰花', '西兰花 35 g']
  ])
  assert.deepEqual(model.dogMealItems.map((item) => [item.amountText, item.detailText]), [
    ['牛肉 108 g', '按生重称量 · 来自番茄牛腩'],
    ['南瓜 65 g', '按熟重称量 · 本餐额外添加'],
    ['西兰花 38 g', '按熟重称量 · 来自清炒西兰花']
  ])
  assert.deepEqual(model.assessment, {
    energy: {
      tone: 'good',
      heading: '能量 · 合适',
      detailText: '约 310 kcal / 本餐目标约 310 kcal'
    },
    nutrition: {
      tone: 'good',
      heading: '营养密度 · 符合当前参考要求',
      detailText: ''
    },
    coverageText: '数据覆盖 · 能量与营养数据完整'
  })
  assert.deepEqual(model.assessmentSnapshot, fullRecord().assessment)
  assert.equal(model.snapshot.versionText, 'record v1 · policy 2026.07 · nutrition CN-2026.1')
  assert.equal(model.snapshot.coverageText, '能量数据完整 · 营养数据完整')
  assert.equal(model.hasNote, true)
  assert.equal(Object.hasOwn(model, 'photoFileIds'), false)
  assert.equal(JSON.stringify(model).includes('photo'), false)
})

test('营养不足分别表达能量和营养密度结论且不只依赖颜色', () => {
  const record = fullRecord()
  record.assessment.energy = {
    ...record.assessment.energy,
    status: 'below_target',
    statusLabel: '能量低于估算目标',
    currentKcal: 260
  }
  record.assessment.nutritionDensity = {
    ...record.assessment.nutritionDensity,
    status: 'needs_adjustment',
    statusLabel: '需要调整',
    standards: [{
      key: 'gb',
      lowItems: [{ code: 'CA', name: '钙' }],
      highItems: []
    }]
  }

  const model = createSharedMealRecordDetailModel(record)
  assert.equal(model.assessment.energy.tone, 'warning')
  assert.equal(model.assessment.energy.heading, '能量 · 低于本餐目标')
  assert.equal(model.assessment.energy.detailText, '约 260 kcal / 本餐目标约 310 kcal')
  assert.equal(model.assessment.nutrition.tone, 'warning')
  assert.equal(model.assessment.nutrition.heading, '营养密度 · 钙低于参考要求')
})

test('能量和营养数据缺失分别给出原因并保留其余快照', () => {
  const record = fullRecord()
  record.assessment.energy = {
    available: false,
    status: 'unavailable',
    statusLabel: '暂无法判断本餐份量',
    currentKcal: null,
    mealTarget: { min: 310, max: 310 },
    missingIngredients: [{ name: '牛肉' }]
  }
  record.assessment.nutritionDensity = {
    available: false,
    status: 'unavailable',
    statusLabel: '暂无法评估',
    primaryAdvice: '部分食材缺少水分数据，暂时无法按干物质完成评估',
    missingIngredients: [{ name: '牛肉', reason: '缺少水分数据' }],
    counts: { adjust: 0, met: 0, unavailable: 1 },
    standards: []
  }
  record.assessment.dataCoverage = { energyComplete: false, unavailableNutrientCount: 1 }

  const model = createSharedMealRecordDetailModel(record)
  assert.equal(model.assessment.energy.heading, '能量 · 暂时无法评估')
  assert.equal(model.assessment.energy.detailText, '缺少牛肉的能量数据')
  assert.equal(model.assessment.nutrition.heading, '营养密度 · 暂时无法评估')
  assert.equal(model.assessment.nutrition.detailText, '部分食材缺少水分数据，暂时无法按干物质完成评估')
  assert.equal(model.assessment.coverageText, '数据覆盖 · 缺少部分能量与营养数据')
  assert.equal(model.humanMenus.length, 2)
  assert.equal(model.dogMealItems.length, 3)
})

test('无备注不生成占位，长名称和长版本保持完整文本', () => {
  const longName = '阿拉斯加雪橇犬糯米团子的一顿饭'
  const policy = 'policy/shared-meal-2026.07-release.18'
  const nutrition = 'nutrition/CN-2026.1-with-a-very-long-release-name'
  const record = fullRecord({ note: '   ' })
  record.dogSnapshot.name = longName
  record.humanMenu[0].title = '番茄牛腩与菌菇慢炖家庭共享菜单'
  record.versions.policyVersion = policy
  record.versions.nutritionSourceReleaseId = nutrition

  const model = createSharedMealRecordDetailModel(record)
  assert.equal(model.dog.heading, `${longName}的一顿饭`)
  assert.equal(model.humanMenus[0].title, '番茄牛腩与菌菇慢炖家庭共享菜单')
  assert.equal(model.hasNote, false)
  assert.equal(model.note, '')
  assert.equal(model.snapshot.versionText.includes(policy), true)
  assert.equal(model.snapshot.versionText.includes(nutrition), true)
})

test('缺损旧快照安全降级且不会重新计算或查询当前数据', () => {
  const model = createSharedMealRecordDetailModel({
    id: 'legacy',
    mealTime: 'invalid',
    dogSnapshot: {},
    humanMenu: [{ ingredients: [{ sourceText: '鸡肉' }] }],
    dogMealItems: [{ name: '鸡肉', perMealAmountGram: null, sourceRefs: [{ humanMenuId: 'missing' }] }],
    assessment: {},
    versions: {}
  })

  assert.equal(model.dog.mealTimeText, '时间待确认')
  assert.equal(model.dog.profileText, '档案快照信息不完整')
  assert.equal(model.humanMenus[0].title, '未命名人饭菜单')
  assert.equal(model.dogMealItems[0].amountText, '鸡肉 · 克重待确认')
  assert.equal(model.dogMealItems[0].detailText, '按当前记录口径称量 · 来源快照未完整保存')
  assert.equal(model.assessment.energy.heading, '能量 · 暂时无法评估')
  assert.equal(model.assessment.nutrition.heading, '营养密度 · 暂时无法评估')
})

test('canonical 狗饭食材缺少口径时只从保存的人饭来源快照恢复', () => {
  const record = fullRecord()
  delete record.dogMealItems[0].preparationState
  record.humanMenu[0].ingredients[0].components = [{
    variantId: 'beef-raw',
    preparationState: 'raw'
  }]

  const model = createSharedMealRecordDetailModel(record)
  assert.equal(model.dogMealItems[0].measurementBasisText, '按生重称量')
  assert.equal(model.dogMealItems[1].measurementBasisText, '按熟重称量')

  delete record.dogMealItems[1].preparationState
  assert.equal(
    createSharedMealRecordDetailModel(record).dogMealItems[1].measurementBasisText,
    '按当前记录口径称量'
  )
})
