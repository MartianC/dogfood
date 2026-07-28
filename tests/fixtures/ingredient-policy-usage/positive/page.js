const fakeComparison = "component.policyStatus === 'blocked'"

// component.policyStatus !== 'blocked' 只是说明文字，不是业务判断。
function canRender(component, canSearchIngredient) {
  return fakeComparison && canSearchIngredient(component)
}

module.exports = { canRender }
