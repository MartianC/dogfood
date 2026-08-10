const { measurementBasisText } = require('../utils/ingredientMeasurementBasis')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const BREED_LABELS = Object.freeze({
  'shiba-inu': '柴犬',
  'labrador-retriever': '拉布拉多犬',
  'mixed-or-unknown': '混血/不确定'
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10)
}

function shanghaiMealTimeText(value) {
  if (value == null || value === '') return '时间待确认'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '时间待确认'
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

function dogModel(record) {
  const dog = record && record.dogSnapshot || {}
  const profileParts = []
  const breedLabel = String(dog.breedLabel || BREED_LABELS[dog.breed] || dog.breed || '').trim()
  const weight = formatNumber(dog.weightKg)
  const lifeStageLabel = String(dog.lifeStageLabel || dog.lifeStage && dog.lifeStage.label || '').trim()
  const activity = dog.dailyActivityHours === null || dog.dailyActivityHours === undefined || dog.dailyActivityHours === ''
    ? ''
    : formatNumber(dog.dailyActivityHours)
  if (breedLabel) profileParts.push(breedLabel)
  if (weight && Number(weight) > 0) profileParts.push(`${weight} kg`)
  if (lifeStageLabel) profileParts.push(lifeStageLabel)
  if (activity !== '') profileParts.push(`日均 ${activity} 小时`)
  return {
    heading: `${String(dog.name || '爱宠').trim() || '爱宠'}的一顿饭`,
    mealTimeText: shanghaiMealTimeText(record && record.mealTime),
    profileText: profileParts.join(' · ') || '档案快照信息不完整'
  }
}

function ingredientText(source) {
  const name = String(source && (source.sourceText || source.rawName || source.name) || '').trim()
  const amount = String(source && source.amountText || '').trim()
  if (!name) return amount || '原料信息未完整保存'
  return amount ? `${name} ${amount}` : name
}

function humanMenuModels(record) {
  return (Array.isArray(record && record.humanMenu) ? record.humanMenu : []).map((menu, index) => {
    const ingredients = (Array.isArray(menu && menu.ingredients) ? menu.ingredients : []).map((source, sourceIndex) => ({
      key: `${String(menu && menu.id || index)}:${String(source && source.position != null ? source.position : sourceIndex)}`,
      text: ingredientText(source)
    }))
    return {
      id: String(menu && menu.id || `menu-${index}`),
      title: String(menu && menu.title || '').trim() || '未命名人饭菜单',
      ingredients,
      ingredientsText: ingredients.map((item) => item.text).join(' · ') || '未保存原料快照'
    }
  })
}

function dogMealSourceText(item, menuTitles) {
  const refs = Array.isArray(item && item.sourceRefs) ? item.sourceRefs : []
  if (!refs.length) return '本餐额外添加'
  const titles = []
  let missing = false
  refs.forEach((ref) => {
    const title = menuTitles.get(String(ref && ref.humanMenuId || ''))
    if (!title) {
      missing = true
      return
    }
    if (!titles.includes(title)) titles.push(title)
  })
  if (!titles.length) return '来源快照未完整保存'
  const known = `来自${titles.join('、')}`
  return missing ? `${known}，另有来源快照未完整保存` : known
}

function preparationStateFromSources(item, record) {
  const direct = item && (item.preparationState || item.preparation_state)
  if (direct) return direct
  const refs = Array.isArray(item && item.sourceRefs) ? item.sourceRefs : []
  const menus = Array.isArray(record && record.humanMenu) ? record.humanMenu : []
  const states = []
  refs.forEach((ref) => {
    const menu = menus.find((candidate) => String(candidate && candidate.id || '') === String(ref && ref.humanMenuId || ''))
    const source = menu && (menu.ingredients || []).find((candidate) => (
      Number(candidate && candidate.position) === Number(ref && ref.ingredientPosition)
    ))
    const components = Array.isArray(source && source.components) ? source.components : []
    const matched = components.find((component) => (
      item && item.variantId && String(component && component.variantId || '') === String(item.variantId)
    )) || (components.length === 1 ? components[0] : null)
    const state = matched && (matched.preparationState || matched.preparation_state)
    if (state && !states.includes(state)) states.push(state)
  })
  return states.length === 1 ? states[0] : null
}

function dogMealModels(record, humanMenus) {
  const menuTitles = new Map(humanMenus.map((menu) => [menu.id, menu.title]))
  return (Array.isArray(record && record.dogMealItems) ? record.dogMealItems : []).map((item, index) => {
    const name = String(item && item.name || '').trim() || '未命名食材'
    const amount = formatNumber(item && item.perMealAmountGram)
    const basis = measurementBasisText(preparationStateFromSources(item, record))
    return {
      id: String(item && (item.variantId || item.ingredientId || item.id) || `ingredient-${index}`),
      name,
      amountText: amount && Number(amount) > 0 ? `${name} ${amount} g` : `${name} · 克重待确认`,
      detailText: `${basis} · ${dogMealSourceText(item, menuTitles)}`,
      measurementBasisText: basis
    }
  })
}

function targetText(target) {
  const min = formatNumber(target && target.min)
  const max = formatNumber(target && target.max)
  if (!min || !max) return '本餐目标未保存'
  return min === max ? `本餐目标约 ${min} kcal` : `本餐目标约 ${min}–${max} kcal`
}

function energyModel(energy) {
  const value = energy || {}
  if (value.available !== true) {
    const missingNames = (Array.isArray(value.missingIngredients) ? value.missingIngredients : [])
      .map((item) => String(item && item.name || '').trim())
      .filter(Boolean)
    return {
      tone: 'warning',
      heading: '能量 · 暂时无法评估',
      detailText: missingNames.length
        ? `缺少${missingNames.join('、')}的能量数据`
        : '保存时未记录可用的能量评估'
    }
  }
  const headings = {
    below_target: '能量 · 低于本餐目标',
    near_target: '能量 · 合适',
    above_target: '能量 · 高于本餐目标'
  }
  const current = formatNumber(value.currentKcal)
  return {
    tone: value.status === 'near_target' ? 'good' : 'warning',
    heading: headings[value.status] || `能量 · ${String(value.statusLabel || '已保存')}`,
    detailText: current
      ? `约 ${current} kcal / ${targetText(value.mealTarget)}`
      : `能量数值未完整保存 / ${targetText(value.mealTarget)}`
  }
}

function firstNutritionIssue(density) {
  const standards = Array.isArray(density && density.standards) ? density.standards : []
  const preferred = standards.find((item) => item && item.key === 'gb') || standards[0] || {}
  const high = Array.isArray(preferred.highItems) && preferred.highItems[0]
  const low = Array.isArray(preferred.lowItems) && preferred.lowItems[0]
  if (high) return `${String(high.name || high.code || '营养指标')}高于参考范围`
  if (low) return `${String(low.name || low.code || '营养指标')}低于参考要求`
  return ''
}

function nutritionModel(density) {
  const value = density || {}
  if (value.available !== true) {
    return {
      tone: 'warning',
      heading: '营养密度 · 暂时无法评估',
      detailText: String(value.primaryAdvice || '保存时未记录可用的营养密度评估')
    }
  }
  const issue = firstNutritionIssue(value)
  if (value.status === 'suitable') {
    return {
      tone: 'good',
      heading: '营养密度 · 符合当前参考要求',
      detailText: ''
    }
  }
  return {
    tone: 'warning',
    heading: `营养密度 · ${issue || String(value.statusLabel || '需要留意')}`,
    detailText: issue ? '' : String(value.primaryAdvice || '')
  }
}

function coverageState(assessment) {
  const source = assessment || {}
  const coverage = source.dataCoverage || {}
  const density = source.nutritionDensity || {}
  const energyComplete = coverage.energyComplete === true && source.energy && source.energy.available === true
  const unavailableCount = coverage.unavailableNutrientCount === null
    || coverage.unavailableNutrientCount === undefined
    || coverage.unavailableNutrientCount === ''
    ? NaN
    : Number(coverage.unavailableNutrientCount)
  const nutritionComplete = density.available === true && Number.isFinite(unavailableCount) && unavailableCount === 0
  return { energyComplete: Boolean(energyComplete), nutritionComplete }
}

function coverageSummary(assessment) {
  const { energyComplete, nutritionComplete } = coverageState(assessment)
  if (energyComplete && nutritionComplete) return '能量与营养数据完整'
  if (!energyComplete && !nutritionComplete) return '缺少部分能量与营养数据'
  if (!energyComplete) return '缺少部分能量数据'
  return '缺少部分水分与营养数据'
}

function assessmentModel(record) {
  const assessment = record && record.assessment || {}
  const summary = coverageSummary(assessment)
  return {
    energy: energyModel(assessment.energy),
    nutrition: nutritionModel(assessment.nutritionDensity),
    coverageText: `数据覆盖 · ${summary}`
  }
}

function standardVersionModels(versions) {
  return (Array.isArray(versions && versions.standardVersions) ? versions.standardVersions : []).map((item, index) => ({
    key: String(item && item.key || `standard-${index}`),
    text: [item && item.code, item && item.profileCode].map((value) => String(value || '').trim()).filter(Boolean).join(' · ')
  })).filter((item) => item.text)
}

function snapshotModel(record) {
  const assessment = record && record.assessment || {}
  const versions = record && record.versions || assessment.dataVersions || {}
  const coverage = coverageState(assessment)
  const versionParts = [`record v${Number(assessment.schemaVersion) || 1}`]
  const policyVersion = String(versions.policyVersion || '').trim()
  const nutritionVersion = String(versions.nutritionSourceReleaseId || '').trim()
  if (policyVersion) versionParts.push(`policy ${policyVersion}`)
  if (nutritionVersion) versionParts.push(`nutrition ${nutritionVersion}`)
  return {
    coverageText: `能量数据${coverage.energyComplete ? '完整' : '不完整'} · 营养数据${coverage.nutritionComplete ? '完整' : '不完整'}`,
    versionText: versionParts.join(' · '),
    algorithmVersion: String(versions.assessmentAlgorithmVersion || assessment.algorithmVersions && assessment.algorithmVersions.mealAssessment || ''),
    standardVersions: standardVersionModels(versions)
  }
}

function createSharedMealRecordDetailModel(record = {}) {
  const humanMenus = humanMenuModels(record)
  const note = String(record.note || '').trim()
  return {
    id: String(record.id || record._id || ''),
    dog: dogModel(record),
    assessment: assessmentModel(record),
    humanMenus,
    dogMealItems: dogMealModels(record, humanMenus),
    snapshot: snapshotModel(record),
    note,
    hasNote: Boolean(note)
  }
}

module.exports = {
  shanghaiMealTimeText,
  createSharedMealRecordDetailModel
}
