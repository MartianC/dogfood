const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createBoundaryChecker,
  collectReachableMainJavaScript,
  findUnusedMainPackageJavaScript
} = require('../scripts/check-main-package-unused-js')

test('根目录普通 JS 均由主包真实页面或组件使用', () => {
  assert.deepEqual(findUnusedMainPackageJavaScript(), [])
})

test('全部分包页面与组件入口让真实共享根 JS 可达', () => {
  const reachable = collectReachableMainJavaScript()
  assert.equal(reachable.has('utils/ingredientOperationRules.js'), true)

  const mainPackageSources = [
    'app.js',
    ...JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')
    ).pages.map((page) => `${page}.js`)
  ].map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n')
  assert.doesNotMatch(mainPackageSources, /ingredientOperationRules/)
})

test('mainPackageReachability/v2 正反 fixtures 保留分包共享并拒绝孤儿根 JS', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const positive = createBoundaryChecker(path.join(fixtureRoot, 'subpackage-shared'))
  const negative = createBoundaryChecker(path.join(fixtureRoot, 'orphan-root-js'))

  assert.equal(
    positive.collectReachableMainJavaScript().has('utils/sharedRule.js'),
    true
  )
  assert.deepEqual(positive.findUnusedMainPackageJavaScript(), [])
  assert.deepEqual(negative.findUnusedMainPackageJavaScript(), ['utils/orphan.js'])
})
