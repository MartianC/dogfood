const NUTRIENT_CODE_BY_ID = {
  1003: 'protein',
  1004: 'fat',
  1007: 'crude_ash',
  1051: 'water',
  1079: 'crude_fiber',
  1087: 'calcium',
  1089: 'iron',
  1090: 'magnesium',
  1091: 'phosphorus',
  1092: 'potassium',
  1093: 'sodium',
  1095: 'zinc',
  1098: 'copper',
  1100: 'iodine',
  1101: 'manganese',
  1103: 'selenium',
  1106: 'vitamin_a',
  1109: 'vitamin_e',
  1110: 'vitamin_d',
  1114: 'vitamin_d',
  1165: 'vitamin_b1_thiamine',
  1166: 'vitamin_b2_riboflavin',
  1167: 'vitamin_b3_niacin',
  1170: 'vitamin_b5_pantothenic_acid',
  1175: 'vitamin_b6_pyridoxine',
  1177: 'vitamin_b9_folic_acid',
  1178: 'vitamin_b12_cyanocobalamin',
  1180: 'choline',
  1210: 'tryptophan',
  1211: 'threonine',
  1212: 'isoleucine',
  1213: 'leucine',
  1214: 'lysine',
  1215: 'methionine',
  1216: 'cystine',
  1217: 'phenylalanine',
  1218: 'tyrosine',
  1219: 'valine',
  1220: 'arginine',
  1221: 'histidine',
  1269: 'linoleic_acid_omega_6',
  1272: 'dha',
  1278: 'epa'
}

const CODE_ALIASES = {
  crude_protein: 'protein',
  crude_fat: 'fat',
  phosphorus_total: 'phosphorus'
}

const CATEGORY_LABELS = {
  proximate: '宏量营养',
  mineral: '矿物质',
  vitamin: '维生素',
  amino_acid: '氨基酸',
  fatty_acid: '脂肪酸',
  other: '其他'
}

const AGE_STAGE_LABELS = {
  puppy: '幼犬',
  adult: '成年犬',
  senior: '老年犬'
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function normalizeCode(value) {
  const code = String(value || '')
  return CODE_ALIASES[code] || code
}

function normalizeUnit(value) {
  const unit = String(value || '').trim().toUpperCase()
  if (unit === 'ΜG' || unit === 'MCG' || unit === 'UG' || unit === 'µG') return 'UG'
  return unit
}

function nutrientCodeOf(record) {
  return normalizeCode(record.nutrient_code || NUTRIENT_CODE_BY_ID[Number(record.nutrient_id)])
}

function ingredientIdOf(ingredient) {
  return String(ingredient.ingredientId || ingredient.id || '')
}

function amountGramOf(ingredient) {
  const value = Number(ingredient.perMealAmountGram)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function standardKey(standard) {
  return standard.authority === 'GB/T' || /^GB\/T/.test(String(standard.standard_code || '')) ? 'gb' : 'fediaf'
}

function autoProfileCode(key, dog, profiles) {
  if (key === 'gb') {
    return dog.ageStage === 'puppy' && profiles.some((item) => item.profile_code === 'growth_gestation_lactation')
      ? 'growth_gestation_lactation'
      : 'adult'
  }
  if (dog.ageStage === 'puppy') {
    const lateGrowth = profiles.find((item) => /late_growth/.test(item.profile_code))
    return lateGrowth ? lateGrowth.profile_code : profiles[0] && profiles[0].profile_code
  }
  const suffix = dog.activityLevel === 'high' ? 'adult_mer_110' : 'adult_mer_95'
  const adult = profiles.find((item) => item.profile_code.includes(suffix))
  return adult ? adult.profile_code : profiles[0] && profiles[0].profile_code
}

function selectProfile(standard, dog, profileOverrides) {
  const key = standardKey(standard)
  const profiles = Array.isArray(standard.profiles) ? standard.profiles : []
  const override = profileOverrides && profileOverrides[key]
  const recommendedCode = autoProfileCode(key, dog, profiles)
  const profile = profiles.find((item) => item.profile_code === override)
    || profiles.find((item) => item.profile_code === recommendedCode)
    || profiles[0]
  return {
    key,
    profile,
    recommendedCode,
    profileSelection: override && profile && profile.profile_code === override ? 'manual' : 'automatic'
  }
}

function groupRecordsByFood(nutrientRecords) {
  return (nutrientRecords || []).reduce((result, record) => {
    const foodId = String(record.food_id || '')
    const code = nutrientCodeOf(record)
    if (!foodId || !code) return result
    if (!result[foodId]) result[foodId] = {}
    const unit = normalizeUnit(record.unit_name)
    if (!result[foodId][code]) result[foodId][code] = {}
    result[foodId][code][unit] = Number(record.amount)
    return result
  }, {})
}

function requiredRecordUnit(requirement) {
  const unit = normalizeUnit(requirement.unit)
  if (unit === '%' || unit === 'G') return 'G'
  if (unit === 'MG') return 'MG'
  if (unit === 'UG') return 'UG'
  if (unit === 'IU') return 'IU'
  return unit
}

function valuePer100GramDryMatter(total, dryMatterGram) {
  return dryMatterGram > 0 ? total / dryMatterGram * 100 : null
}

function valueInUnit(values, targetUnit) {
  if (!values) return null
  if (Number.isFinite(values[targetUnit])) return values[targetUnit]
  if (targetUnit === 'G') {
    if (Number.isFinite(values.MG)) return values.MG / 1000
    if (Number.isFinite(values.UG)) return values.UG / 1000000
  }
  if (targetUnit === 'MG') {
    if (Number.isFinite(values.G)) return values.G * 1000
    if (Number.isFinite(values.UG)) return values.UG / 1000
  }
  if (targetUnit === 'UG') {
    if (Number.isFinite(values.G)) return values.G * 1000000
    if (Number.isFinite(values.MG)) return values.MG * 1000
  }
  return null
}

function aggregateNutrient(code, recordUnit, ingredients, recordsByFood) {
  let total = 0
  const contributions = []
  const missingIngredients = []
  ingredients.forEach((ingredient) => {
    const foodId = ingredientIdOf(ingredient)
    const amount = valueInUnit(recordsByFood[foodId] && recordsByFood[foodId][code], recordUnit)
    if (!Number.isFinite(amount)) {
      missingIngredients.push({ id: foodId, name: ingredient.name })
      return
    }
    const contribution = amount * amountGramOf(ingredient) / 100
    total += contribution
    contributions.push({ ingredientName: ingredient.name, value: contribution })
  })
  return { total, contributions, missingIngredients }
}

function evaluateRequirements(requirements, currentValue) {
  if (!Number.isFinite(currentValue)) return 'unavailable'
  const minimums = requirements.filter((item) => item.requirement_type === 'min').map((item) => Number(item.value))
  const maximums = requirements.filter((item) => item.requirement_type === 'max').map((item) => Number(item.value))
  const minimum = minimums.length ? Math.max(...minimums) : null
  const maximum = maximums.length ? Math.min(...maximums) : null
  if (minimum !== null && currentValue < minimum) return 'low'
  if (maximum !== null && currentValue > maximum) return 'high'
  return 'met'
}

function formatRequirement(requirements) {
  const minimums = requirements.filter((item) => item.requirement_type === 'min').map((item) => Number(item.value))
  const maximums = requirements.filter((item) => item.requirement_type === 'max').map((item) => Number(item.value))
  const minimum = minimums.length ? Math.max(...minimums) : null
  const maximum = maximums.length ? Math.min(...maximums) : null
  const unit = requirements[0] && requirements[0].unit || ''
  if (minimum !== null && maximum !== null) return `${minimum}–${maximum} ${unit}`.trim()
  if (minimum !== null) return `≥ ${minimum} ${unit}`.trim()
  if (maximum !== null) return `≤ ${maximum} ${unit}`.trim()
  return '未规定'
}

function buildContributors(contributions, total) {
  if (!(total > 0)) return []
  return contributions
    .map((item) => ({
      ingredientName: item.ingredientName,
      percent: Math.round(item.value / total * 100)
    }))
    .sort((left, right) => right.percent - left.percent)
    .slice(0, 3)
}

function buildElementData(selectedStandards, ingredients, recordsByFood, dryMatterGram) {
  const requirementGroups = {}
  selectedStandards.forEach(({ key, profile }) => {
    ;(profile && profile.requirements || []).forEach((requirement) => {
      const code = normalizeCode(requirement.pet_nutrient_code)
      if (!requirementGroups[code]) requirementGroups[code] = { code, requirements: {} }
      if (!requirementGroups[code].requirements[key]) requirementGroups[code].requirements[key] = []
      requirementGroups[code].requirements[key].push(requirement)
    })
  })

  return Object.values(requirementGroups).map((group) => {
    const firstRequirements = group.requirements.gb || group.requirements.fediaf || []
    const first = firstRequirements[0] || {}
    const evaluation = {}
    let displayValue = null
    let displayUnit = ''
    let contributors = []

    ;['gb', 'fediaf'].forEach((key) => {
      const requirements = group.requirements[key]
      if (!requirements || !requirements.length) {
        evaluation[key] = { status: 'not_specified', requirementText: '未规定' }
        return
      }
      const recordUnit = requiredRecordUnit(requirements[0])
      const aggregate = aggregateNutrient(group.code, recordUnit, ingredients, recordsByFood)
      const currentValue = aggregate.missingIngredients.length
        ? null
        : valuePer100GramDryMatter(aggregate.total, dryMatterGram)
      const status = evaluateRequirements(requirements, currentValue)
      evaluation[key] = {
        status,
        currentValue: Number.isFinite(currentValue) ? round(currentValue) : null,
        unit: requirements[0].unit,
        requirementText: formatRequirement(requirements),
        missingIngredients: aggregate.missingIngredients
      }
      if (displayValue === null && Number.isFinite(currentValue)) {
        displayValue = round(currentValue)
        displayUnit = requirements[0].unit
      }
      if (status === 'high' && !contributors.length) contributors = buildContributors(aggregate.contributions, aggregate.total)
    })

    return {
      code: group.code,
      name: first.name_zh || group.code,
      category: first.category || 'other',
      categoryLabel: CATEGORY_LABELS[first.category] || CATEGORY_LABELS.other,
      currentValue: displayValue,
      currentUnit: displayUnit,
      contributors,
      gb: evaluation.gb || { status: 'not_specified', requirementText: '未规定' },
      fediaf: evaluation.fediaf || { status: 'not_specified', requirementText: '未规定' }
    }
  })
}

function buildStandardResult(selected, elements) {
  const key = selected.key
  const relevant = elements.filter((item) => item[key].status !== 'not_specified')
  const lowItems = relevant.filter((item) => item[key].status === 'low').map((item) => ({
    code: item.code,
    name: item.name,
    currentValue: item[key].currentValue,
    unit: item[key].unit,
    requirementText: item[key].requirementText,
    actionText: `挑选富含${item.name}的食物`
  }))
  const highItems = relevant.filter((item) => item[key].status === 'high').map((item) => ({
    code: item.code,
    name: item.name,
    currentValue: item[key].currentValue,
    unit: item[key].unit,
    requirementText: item[key].requirementText,
    contributors: item.contributors,
    actionText: '查看并调整相关食材'
  }))
  return {
    key,
    code: selected.key === 'gb' ? 'GB/T 31216-2014' : 'FEDIAF 2025',
    profileCode: selected.profile && selected.profile.profile_code || '',
    profileName: selected.profile && selected.profile.profile_name || '需要选择参考档案',
    profileSelection: selected.profileSelection,
    recommendedProfileCode: selected.recommendedCode,
    profileOptions: selected.profiles,
    lowItems,
    highItems,
    metCount: relevant.filter((item) => item[key].status === 'met').length,
    unavailableCount: relevant.filter((item) => item[key].status === 'unavailable').length
  }
}

function unavailableAssessment({ dog, ingredients, missingIngredients, message, selectedStandards = [] }) {
  return {
    available: false,
    status: 'unavailable',
    statusLabel: '暂无法评估',
    primaryAdvice: message,
    contextText: `${dog.name || '未选择狗狗'} · ${AGE_STAGE_LABELS[dog.ageStage] || '阶段未设置'} · 每日 ${Number(dog.dailyMeals || 0)} 餐`,
    basisText: '补齐数据后按食谱干物质密度评估',
    coverageText: `${ingredients.length} 种食材中 ${ingredients.length - missingIngredients.length} 种数据完整`,
    missingIngredients,
    standards: selectedStandards,
    elements: [],
    counts: { adjust: 0, met: 0, unavailable: missingIngredients.length }
  }
}

function buildAssessment({ ingredients = [], dog = {}, standards = [], nutrientRecords = [], profileOverrides = {} }) {
  const validIngredients = ingredients.filter((item) => amountGramOf(item) > 0)
  const selectedStandards = standards
    .map((standard) => ({ ...selectProfile(standard, dog, profileOverrides), standard }))
    .filter((item) => item.profile)
    .sort((left, right) => left.key === 'gb' ? -1 : 1)
    .map((item) => ({
      ...item,
      profiles: (item.standard.profiles || []).map((profile) => ({
        code: profile.profile_code,
        name: profile.profile_name,
        recommended: profile.profile_code === item.recommendedCode
      }))
    }))

  if (!validIngredients.length || !dog.id) {
    return unavailableAssessment({
      dog,
      ingredients: validIngredients,
      missingIngredients: [],
      message: !dog.id ? '请选择狗狗后开始营养评估' : '添加食材后开始营养评估',
      selectedStandards: []
    })
  }

  const recordsByFood = groupRecordsByFood(nutrientRecords)
  const missingWater = validIngredients.filter((ingredient) => {
    const foodId = ingredientIdOf(ingredient)
    return !Number.isFinite(recordsByFood[foodId] && recordsByFood[foodId].water && recordsByFood[foodId].water.G)
  }).map((ingredient) => ({ id: ingredientIdOf(ingredient), name: ingredient.name, reason: '缺少水分数据' }))
  if (missingWater.length) {
    return unavailableAssessment({
      dog,
      ingredients: validIngredients,
      missingIngredients: missingWater,
      message: '部分食材缺少水分数据，暂时无法按干物质完成评估',
      selectedStandards: selectedStandards.map((item) => ({
        key: item.key,
        code: item.key === 'gb' ? 'GB/T 31216-2014' : 'FEDIAF 2025',
        profileCode: item.profile.profile_code,
        profileName: item.profile.profile_name,
        profileSelection: item.profileSelection,
        recommendedProfileCode: item.recommendedCode,
        profileOptions: item.profiles,
        lowItems: [],
        highItems: [],
        metCount: 0,
        unavailableCount: 0
      }))
    })
  }

  const waterGram = validIngredients.reduce((sum, ingredient) => {
    const water = recordsByFood[ingredientIdOf(ingredient)].water.G
    return sum + water * amountGramOf(ingredient) / 100
  }, 0)
  const totalGram = validIngredients.reduce((sum, ingredient) => sum + amountGramOf(ingredient), 0)
  const dryMatterGram = totalGram - waterGram
  if (!(dryMatterGram > 0)) {
    return unavailableAssessment({
      dog,
      ingredients: validIngredients,
      missingIngredients: validIngredients.map((item) => ({ id: ingredientIdOf(item), name: item.name, reason: '干物质数据异常' })),
      message: '食谱干物质数据异常，暂时无法完成评估',
      selectedStandards: []
    })
  }

  const elements = buildElementData(selectedStandards, validIngredients, recordsByFood, dryMatterGram)
  const standardResults = selectedStandards.map((item) => buildStandardResult(item, elements))
  const gb = standardResults.find((item) => item.key === 'gb')
  const high = gb && gb.highItems[0]
  const low = gb && gb.lowItems[0]
  const groupedCounts = elements.reduce((counts, item) => {
    const statuses = [item.gb.status, item.fediaf.status]
    if (statuses.includes('low') || statuses.includes('high')) counts.adjust += 1
    else if (statuses.includes('unavailable')) counts.unavailable += 1
    else if (statuses.includes('met')) counts.met += 1
    return counts
  }, { adjust: 0, met: 0, unavailable: 0 })
  const { adjust: adjustCount, met: metCount, unavailable: unavailableCount } = groupedCounts
  const status = high || low ? 'needs_adjustment' : unavailableCount ? 'suggest_adjustment' : 'suitable'
  const primaryAdvice = high
    ? `适当减少${high.name}主要来源，本餐${high.name}高于国标参考范围`
    : low
      ? `优先补充富含${low.name}的食材，本餐${low.name}低于国标参考要求`
      : unavailableCount
        ? '部分元素数据不足，当前结果可能不完整'
        : '当前已评估的主要营养指标处于国标参考范围内'

  return {
    available: true,
    status,
    statusLabel: status === 'needs_adjustment' ? '需要调整' : status === 'suggest_adjustment' ? '建议调整' : '基本合适',
    primaryAdvice,
    contextText: `${dog.name} · ${AGE_STAGE_LABELS[dog.ageStage] || '阶段未设置'} · 每日 ${Number(dog.dailyMeals || 0)} 餐`,
    basisText: `本餐按每日 ${Number(dog.dailyMeals || 0)} 餐等额评估；标准按干物质密度换算`,
    coverageText: `${validIngredients.length} 种食材均已读取水分数据`,
    missingIngredients: [],
    standards: standardResults,
    elements,
    counts: { adjust: adjustCount, met: metCount, unavailable: unavailableCount }
  }
}

module.exports = {
  buildAssessment,
  selectProfile,
  normalizeCode,
  nutrientCodeOf
}
