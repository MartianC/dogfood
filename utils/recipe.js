const { checkRisksForDogs, worstLevel } = require('./risk')

function includesText(text, keyword) {
  return String(text || '').toLowerCase().includes(String(keyword || '').toLowerCase())
}

function searchRecipes(recipes, keyword) {
  if (!keyword) return recipes
  return recipes.filter((recipe) => (
    includesText(recipe.title, keyword) ||
    includesText(recipe.description, keyword) ||
    (recipe.mainIngredients || []).some((item) => includesText(item, keyword))
  ))
}

function matchesCustomFilters(recipe, filters = {}) {
  if (filters.ageStage && !(recipe.suitableAgeStages || []).includes(filters.ageStage)) return false
  if (filters.dietGoal && !(recipe.suitableDietGoals || []).includes(filters.dietGoal)) return false
  if (filters.allergenKey) {
    const hit = (recipe.ingredients || []).some((item) => item.allergenKey === filters.allergenKey)
    if (hit) return false
  }
  return true
}

function fitRecipeForDogs(recipe, dogs) {
  if (!Array.isArray(dogs) || dogs.length === 0) {
    return { status: 'visitor', label: '', warnings: [] }
  }
  const warnings = checkRisksForDogs(recipe, dogs)
  const level = worstLevel(warnings)
  if (level === 'danger') return { status: 'danger', label: '可能不适合', warnings }
  if (level === 'warning') return { status: 'warning', label: '需要留意', warnings }
  if (level === 'info') return { status: 'info', label: '建议查看详情', warnings }
  return { status: 'ok', label: dogs.length > 1 ? '适合全部狗狗' : '适合这只狗狗', warnings }
}

function filterRecipes(recipes, options = {}) {
  const { keyword, mode, dogs = [], selectedDogId, customFilters = {} } = options
  let list = searchRecipes(recipes, keyword)

  if (mode === 'custom') {
    list = list.filter((recipe) => matchesCustomFilters(recipe, customFilters))
  }

  const targetDogs = mode === 'singleDog'
    ? dogs.filter((dog) => dog.id === selectedDogId)
    : dogs

  if (mode === 'allDogs' || mode === 'singleDog') {
    list = list.filter((recipe) => fitRecipeForDogs(recipe, targetDogs).status !== 'danger')
  }

  return list.map((recipe) => ({
    ...recipe,
    mainIngredientText: (recipe.mainIngredients || []).join('、'),
    fit: fitRecipeForDogs(recipe, targetDogs)
  }))
}

function findRecipeById(recipes, id) {
  return (recipes || []).find((recipe) => recipe.id === id)
}

module.exports = {
  searchRecipes,
  matchesCustomFilters,
  fitRecipeForDogs,
  filterRecipes,
  findRecipeById
}
