const calculator = require('../../../utils/calculator')
const risk = require('../../../utils/risk')

async function generate({ recipe, dogs, periodDays, targetDogIds, options = {} }) {
  if (options.algorithmMode && options.algorithmMode !== 'local') {
    throw new Error('当前版本只启用本地清单算法')
  }
  if (!periodDays || periodDays < 1 || periodDays > 30) {
    throw new Error('制作周期需在 1 到 30 天之间')
  }

  const targetDogs = (dogs || []).filter((dog) => (targetDogIds || []).includes(dog.id))
  const plan = calculator.calcBatchPlanForDogs(recipe, targetDogs, periodDays)
  const warnings = risk.checkRisksForDogs(recipe, targetDogs).map((item) => item.msg)

  return {
    ...plan,
    sourceType: recipe.sourceType || (recipe.id ? 'builtInRecipe' : 'customRecipe'),
    recipeId: recipe.id || '',
    customRecipeId: recipe.customRecipeId || '',
    recipeName: recipe.title,
    recipeSnapshot: JSON.parse(JSON.stringify(recipe)),
    calculationParams: {
      periodDays: Number(periodDays),
      targetDogIds: targetDogs.map((dog) => dog.id),
      rounding: 'roundTo5And10'
    },
    cookingSteps: recipe.steps || [],
    warnings
  }
}

module.exports = {
  generate
}
