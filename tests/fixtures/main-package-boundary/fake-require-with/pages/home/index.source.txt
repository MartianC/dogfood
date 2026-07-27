const context = {
  require() {
    return {}
  }
}

with (context) {
  require('../../utils/orphan')
}

module.exports = {}
