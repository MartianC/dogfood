const ALGORITHM_VERSION = 'local-rules-v1'

function roundTo5(gram) {
  return Math.round(Number(gram || 0) / 5) * 5
}

function roundTo10(gram) {
  return Math.round(Number(gram || 0) / 10) * 10
}

function formatGram(gram) {
  const value = Number(gram || 0)
  if (value >= 1000) {
    const kg = value / 1000
    return `${Number.isInteger(kg) ? kg.toFixed(0) : kg.toFixed(1)}kg`
  }
  return `${value}g`
}

function assertPlanInput(recipe, dog, periodDays) {
  if (!recipe || !Array.isArray(recipe.ingredients)) {
    throw new Error('缺少食谱食材，不能生成清单')
  }
  if (!recipe.baseWeightKg || recipe.baseWeightKg <= 0) {
    throw new Error('缺少食谱参考体重，不能生成清单')
  }
  if (!dog || !dog.weightKg || !dog.dailyMeals) {
    throw new Error('缺少狗狗体重或每日餐数，不能生成清单')
  }
  if (!periodDays || periodDays < 1 || periodDays > 30) {
    throw new Error('制作周期需在 1 到 30 天之间')
  }
}

function calcBatchPlan(recipe, dog, periodDays) {
  assertPlanInput(recipe, dog, periodDays)

  const ratio = Number(dog.weightKg) / Number(recipe.baseWeightKg)
  const totalMeals = Number(dog.dailyMeals) * Number(periodDays)
  const perMealItems = recipe.ingredients.map((item) => ({
    name: item.name,
    category: item.category,
    amountGram: roundTo5(Number(item.baseAmountGram) * ratio),
    allergenKey: item.allergenKey || ''
  }))
  const totalItems = perMealItems.map((item) => ({
    name: item.name,
    category: item.category,
    amountGram: roundTo10(item.amountGram * totalMeals),
    allergenKey: item.allergenKey || ''
  }))

  return {
    dogId: dog.id,
    dogName: dog.name,
    dailyMeals: Number(dog.dailyMeals),
    totalMeals,
    perMealTotalGram: perMealItems.reduce((sum, item) => sum + item.amountGram, 0),
    perMealItems,
    totalItems
  }
}

function mergePlanItems(itemGroups) {
  const merged = []
  const indexByKey = {}

  itemGroups.reduce((allItems, group) => allItems.concat(group), []).forEach((item) => {
    const key = `${item.category}:${item.name}`
    if (indexByKey[key] === undefined) {
      indexByKey[key] = merged.length
      merged.push({
        name: item.name,
        category: item.category,
        amountGram: 0,
        allergenKey: item.allergenKey || ''
      })
    }
    merged[indexByKey[key]].amountGram = roundTo10(merged[indexByKey[key]].amountGram + Number(item.amountGram || 0))
  })

  return merged
}

function calcBatchPlanForDogs(recipe, dogs, periodDays) {
  if (!Array.isArray(dogs) || dogs.length === 0) {
    throw new Error('请选择制作对象')
  }
  const dogMealSummaries = dogs.map((dog) => calcBatchPlan(recipe, dog, periodDays))
  const targetDogSnapshots = dogs.map((dog) => ({
    dogId: dog.id,
    dogName: dog.name,
    avatarUrl: dog.avatarUrl || '',
    weightKg: Number(dog.weightKg),
    dailyMeals: Number(dog.dailyMeals)
  }))

  return {
    algorithmVersion: ALGORITHM_VERSION,
    algorithmSource: 'local',
    periodDays: Number(periodDays),
    targetMode: dogs.length === 1 ? 'singleDog' : 'multipleDogs',
    targetDogIds: dogs.map((dog) => dog.id),
    targetDogSnapshots,
    dogMealSummaries,
    totalPortions: dogMealSummaries.reduce((sum, item) => sum + item.totalMeals, 0),
    totalItems: mergePlanItems(dogMealSummaries.map((item) => item.totalItems)),
    warnings: []
  }
}

module.exports = {
  ALGORITHM_VERSION,
  roundTo5,
  roundTo10,
  formatGram,
  calcBatchPlan,
  calcBatchPlanForDogs,
  mergePlanItems
}
