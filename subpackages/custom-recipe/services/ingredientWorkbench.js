function amountOf(item) {
  const amount = Number(item && item.perMealAmountGram)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function calculateIngredientRatios(ingredients = []) {
  const totalGram = ingredients.reduce((sum, item) => sum + amountOf(item), 0)
  return ingredients.map((item) => ({
    ...item,
    ratioPercent: totalGram > 0 ? Math.round(amountOf(item) / totalGram * 100) : 0
  }))
}

function updateIngredientAmount(ingredients = [], index, value) {
  const amount = Number(value)
  const nextAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0
  return calculateIngredientRatios(ingredients.map((item, itemIndex) => (
    itemIndex === Number(index) ? { ...item, perMealAmountGram: nextAmount } : item
  )))
}

function addIngredient(ingredients = [], ingredient, amount) {
  const nextAmount = Number(amount)
  if (!ingredient || !Number.isFinite(nextAmount) || nextAmount <= 0) return calculateIngredientRatios(ingredients)
  const ingredientId = ingredient.id || ingredient.ingredientId || ingredient.name
  const existingIndex = ingredients.findIndex((item) => (
    (item.ingredientId && item.ingredientId === ingredientId) || item.name === ingredient.name
  ))
  const next = existingIndex >= 0
    ? ingredients.map((item, index) => index === existingIndex
      ? { ...item, perMealAmountGram: Number(item.perMealAmountGram || 0) + nextAmount }
      : item)
    : ingredients.concat({
      ingredientId,
      name: ingredient.name,
      category: ingredient.category || 'other',
      categoryLabel: ingredient.categoryLabel || '其他',
      perMealAmountGram: nextAmount
    })
  return calculateIngredientRatios(next)
}

function totalIngredientGram(ingredients = []) {
  return ingredients.reduce((sum, item) => sum + amountOf(item), 0)
}

module.exports = {
  calculateIngredientRatios,
  updateIngredientAmount,
  addIngredient,
  totalIngredientGram
}
