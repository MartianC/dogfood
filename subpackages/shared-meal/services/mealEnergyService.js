// 此文件由 scripts/sync-subpackage-services.js 自动生成，请修改 shared-src 后重新同步。
const DIRECT_ENERGY_SOURCES = [
  { nutrientId: 1008, source: 'direct' },
  { nutrientId: 2047, source: 'direct_atwater_general' },
  { nutrientId: 2048, source: 'direct_atwater_specific' }
]
const PROTEIN_ID = 1003
const FAT_ID = 1004
const CARBOHYDRATE_ID = 1005

function amountGramOf(ingredient) {
  const value = Number(ingredient && ingredient.perMealAmountGram)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function recordsByFood(nutrientRecords) {
  return nutrientRecords.reduce((result, record) => {
    const foodId = String(record.food_id || '')
    const nutrientId = Number(record.nutrient_id)
    const rawAmount = record.amount
    const amount = Number(rawAmount)
    const unit = String(record.unit_name || '').toUpperCase()
    const hasAmount = rawAmount !== null &&
      rawAmount !== undefined &&
      !(typeof rawAmount === 'string' && rawAmount.trim() === '')
    if (foodId && hasAmount && Number.isFinite(amount) && amount >= 0) {
      if (!result[foodId]) result[foodId] = {}
      result[foodId][nutrientId] = { amount, unit }
    }
    return result
  }, {})
}

function energyPer100g(foodRecords) {
  const directSource = DIRECT_ENERGY_SOURCES.find(({ nutrientId }) => {
    const record = foodRecords && foodRecords[nutrientId]
    return record && record.unit === 'KCAL'
  })
  if (directSource) {
    return {
      value: foodRecords[directSource.nutrientId].amount,
      source: directSource.source
    }
  }
  const protein = foodRecords && foodRecords[PROTEIN_ID]
  const fat = foodRecords && foodRecords[FAT_ID]
  const carbohydrate = foodRecords && foodRecords[CARBOHYDRATE_ID]
  if (![protein, fat, carbohydrate].every((item) => item && item.unit === 'G')) return null
  return {
    value: 4 * protein.amount + 9 * fat.amount + 4 * carbohydrate.amount,
    source: 'macro_estimate'
  }
}

function calculateMealEnergy({ ingredients = [], nutrientRecords = [] }) {
  const index = recordsByFood(nutrientRecords)
  const ingredientEnergies = []
  const missingIngredients = []
  ingredients.filter((ingredient) => amountGramOf(ingredient) > 0).forEach((ingredient) => {
    const id = String(ingredient.ingredientId || ingredient.id || '')
    const per100g = energyPer100g(index[id])
    if (!per100g) {
      missingIngredients.push({
        id,
        name: ingredient.name,
        reason: '缺少能量和完整宏量营养数据'
      })
      return
    }
    ingredientEnergies.push({
      id,
      name: ingredient.name,
      kcal: per100g.value * amountGramOf(ingredient) / 100,
      source: per100g.source
    })
  })
  const knownKcal = ingredientEnergies.reduce((sum, item) => sum + item.kcal, 0)
  const available = missingIngredients.length === 0 && ingredientEnergies.length > 0

  return {
    available,
    totalKcal: available ? knownKcal : null,
    knownKcal,
    ingredientEnergies,
    missingIngredients
  }
}

function isValidMealTarget(mealTarget) {
  return Boolean(mealTarget &&
    Number.isFinite(mealTarget.min) &&
    Number.isFinite(mealTarget.max) &&
    mealTarget.min > 0 &&
    mealTarget.max >= mealTarget.min)
}

function evaluateEnergyStatus({ currentKcal, mealTarget }) {
  if (!Number.isFinite(currentKcal) || currentKcal < 0 || !isValidMealTarget(mealTarget)) {
    return 'unavailable'
  }
  const isRange = mealTarget.min !== mealTarget.max
  const lower = isRange ? mealTarget.min : mealTarget.min * 0.9
  const upper = isRange ? mealTarget.max : mealTarget.max * 1.1
  if (currentKcal < lower) return 'below_target'
  if (currentKcal > upper) return 'above_target'
  return 'near_target'
}

function roundOne(value) {
  return Math.round(value * 10) / 10
}

function allocateRoundedAmounts(active, scale, suggestedTotalGram) {
  const targetUnits = Math.round(suggestedTotalGram * 10)
  const allocations = active.map((item, index) => {
    const rawUnits = amountGramOf(item) * scale * 10
    const units = Math.floor(rawUnits)
    return { index, units, remainder: rawUnits - units }
  })
  let remainingUnits = targetUnits - allocations.reduce((sum, item) => sum + item.units, 0)
  const byLargestRemainder = [...allocations].sort((a, b) => {
    return b.remainder - a.remainder || a.index - b.index
  })
  let cursor = 0
  while (remainingUnits > 0) {
    byLargestRemainder[cursor % byLargestRemainder.length].units += 1
    remainingUnits -= 1
    cursor += 1
  }

  return allocations.sort((a, b) => a.index - b.index).map((item) => item.units / 10)
}

function buildScaleSuggestion({ ingredients = [], currentKcal, mealTarget }) {
  if (!Number.isFinite(currentKcal) || !(currentKcal > 0) || !isValidMealTarget(mealTarget)) {
    return { available: false }
  }
  const scale = mealTarget.min / currentKcal
  const active = ingredients.filter((item) => amountGramOf(item) > 0)
  if (!active.length) return { available: false }
  const currentTotalGram = active.reduce((sum, item) => sum + amountGramOf(item), 0)
  const suggestedTotalGram = roundOne(currentTotalGram * scale)
  const roundedAmounts = allocateRoundedAmounts(active, scale, suggestedTotalGram)
  const suggestedIngredients = active.map((item, index) => ({
    ...item,
    perMealAmountGram: roundedAmounts[index]
  }))

  return {
    available: true,
    scale,
    currentTotalGram,
    suggestedTotalGram,
    targetRange: { min: mealTarget.min, max: mealTarget.max },
    suggestedIngredients
  }
}

module.exports = {
  buildScaleSuggestion,
  calculateMealEnergy,
  evaluateEnergyStatus
}
