const loader = { require() {} }
const request = '../../utils/orphan'

loader.require('../../utils/orphan')
require(request)
require(`../../utils/orphan`)

module.exports = {}
