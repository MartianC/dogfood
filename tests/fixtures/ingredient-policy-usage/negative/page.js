function canAddIngredient(component) {
  return component.policyStatus !== 'blocked'
}

module.exports = { canAddIngredient }
