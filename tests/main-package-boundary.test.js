const test = require('node:test')
const assert = require('node:assert/strict')

const {
  findUnusedMainPackageJavaScript
} = require('../scripts/check-main-package-unused-js')

test('根目录普通 JS 均由主包真实页面或组件使用', () => {
  assert.deepEqual(findUnusedMainPackageJavaScript(), [])
})
