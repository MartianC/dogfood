const ageStageLabels = {
  puppy: '幼犬',
  adult: '成年犬',
  senior: '老年犬'
}

const dietGoalLabels = {
  daily: '日常',
  lowFat: '低脂',
  gainWeight: '增重',
  stomachFriendly: '肠胃友好'
}
const { isIngredientAllergen } = require('../services/dogIngredientPolicy')

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function derivedAgeStage(dog) {
  return dog && dog.lifeStage && dog.lifeStage.legacyAgeStage || dog && dog.ageStage || ''
}

function derivedAgeStageLabel(dog) {
  return dog && dog.lifeStageLabel || ageStageLabels[derivedAgeStage(dog)] || '阶段待完善'
}

function checkRisk(recipe, dog) {
  const warnings = []
  const allergens = normalizeList(dog.allergens)
  const avoidIngredients = normalizeList(dog.avoidIngredients)
  const ageStage = derivedAgeStage(dog)

  normalizeList(recipe.ingredients).forEach((ingredient) => {
    if (isIngredientAllergen(ingredient, dog) || (ingredient.allergenKey && allergens.includes(ingredient.allergenKey))) {
      warnings.push({
        level: 'danger',
        msg: `不建议选择：${dog.name}的档案里标记了${ingredient.name}过敏。`
      })
    }
  })

  normalizeList(recipe.ingredients).forEach((ingredient) => {
    if (avoidIngredients.includes(ingredient.name) || avoidIngredients.includes(ingredient.allergenKey)) {
      warnings.push({
        level: 'warning',
        msg: `${dog.name}的忌口里包含了${ingredient.name}，请注意。`
      })
    }
  })

  if (recipe.suitableAgeStages && !recipe.suitableAgeStages.includes(ageStage)) {
    const labels = recipe.suitableAgeStages.map((item) => ageStageLabels[item] || item).join('、')
    warnings.push({
      level: 'info',
      msg: `这道食谱主要适合${labels}，${dog.name}是${derivedAgeStageLabel(dog)}，建议少量尝试。`
    })
  }

  const dietMatched = recipe.suitableDietGoals
    ? recipe.suitableDietGoals.includes(dog.dietGoal)
    : normalizeList(recipe.tags).some((tag) => tag === dietGoalLabels[dog.dietGoal])
  if (dog.dietGoal && dog.dietGoal !== 'daily' && !dietMatched) {
    warnings.push({
      level: 'info',
      msg: `${dog.name}当前饮食目标是${dietGoalLabels[dog.dietGoal] || dog.dietGoal}，这道食谱未标记为对应目标。`
    })
  }

  return warnings
}

function checkRisksForDogs(recipe, dogs) {
  return normalizeList(dogs).reduce((warnings, dog) => warnings.concat(checkRisk(recipe, dog)), [])
}

function worstLevel(warnings) {
  if (warnings.some((item) => item.level === 'danger')) return 'danger'
  if (warnings.some((item) => item.level === 'warning')) return 'warning'
  if (warnings.some((item) => item.level === 'info')) return 'info'
  return 'ok'
}

module.exports = {
  ageStageLabels,
  dietGoalLabels,
  checkRisk,
  checkRisksForDogs,
  worstLevel,
  derivedAgeStage,
  derivedAgeStageLabel
}
