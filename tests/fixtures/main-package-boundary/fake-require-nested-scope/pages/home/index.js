function outer() {
  function inner(require) {
    return require('../../utils/orphan')
  }

  return inner
}

module.exports = outer
