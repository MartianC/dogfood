function canAddIngredient(ingredient) {
  return ingredient.policyStatus !== 'blocked'
}

module.exports = { canAddIngredient }
