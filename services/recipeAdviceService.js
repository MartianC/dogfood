const ingredientAdvice = require('../utils/ingredientAdvice')

async function buildAdvice({ customRecipe, dogs, options = {} }) {
  if (options.algorithmMode && options.algorithmMode !== 'local') {
    throw new Error('当前版本只启用本地建议算法')
  }
  const advices = ingredientAdvice.buildIngredientAdvices(customRecipe, dogs || [])
  return {
    adviceAlgorithmVersion: 'local-rules-v1',
    adviceAlgorithmSource: 'local',
    targetDogIds: (dogs || []).map((dog) => dog.id),
    targetDogSnapshots: (dogs || []).map((dog) => ({
      dogId: dog.id,
      dogName: dog.name,
      avatarUrl: dog.avatarUrl || '',
      weightKg: Number(dog.weightKg),
      dailyMeals: Number(dog.dailyMeals)
    })),
    adviceSummary: ingredientAdvice.buildAdviceSummary(advices),
    advices
  }
}

module.exports = {
  buildAdvice
}
