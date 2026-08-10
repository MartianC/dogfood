const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function registeredRoutes(config) {
  return [
    ...config.pages,
    ...config.subpackages.flatMap((subpackage) => (
      subpackage.pages.map((page) => `${subpackage.root}/${page}`)
    ))
  ]
}

test('狗狗 canonical 页面注册并成为第四个真实 Tab', () => {
  const config = JSON.parse(read('app.json'))
  const contract = JSON.parse(read('contracts/navigation/project-navigation-migration-v1.json'))
  const targetPaths = contract.target.registrationOrder

  assert.deepEqual(config.pages.slice(0, targetPaths.length), targetPaths)
  assert.equal(config.pages.filter((page) => page === 'pages/dogs/index').length, 1)
  assert.deepEqual(config.tabBar.list.map((item) => item.text), ['首页', '记录', '爱宠', '我的'])
  assert.equal(config.tabBar.list.some((item) => item.pagePath === 'pages/dogs/index'), true)

  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(fs.existsSync(path.join(root, `pages/dogs/index.${extension}`)), true)
  }

  const pageSource = read('pages/dogs/index.js')
  assert.match(pageSource, /Page\(\{/)
  assert.match(pageSource, /require\(['"]\.\.\/\.\.\/services\/dogService['"]\)/)
  assert.match(pageSource, /require\(['"]\.\.\/\.\.\/services\/authService['"]\)/)
  assert.doesNotMatch(pageSource, /wx\.cloud/)
})

test('P0.2 固定的旧深链继续注册且不成为主入口', () => {
  const config = JSON.parse(read('app.json'))
  const contract = JSON.parse(read('contracts/navigation/project-navigation-migration-v1.json'))
  const routes = registeredRoutes(config)
  const tabPaths = config.tabBar.list.map((item) => item.pagePath)

  contract.legacyDeepLinks.forEach(({ path: legacyPath }) => {
    assert.ok(routes.includes(legacyPath), `旧深链未注册：${legacyPath}`)
    assert.equal(tabPaths.includes(legacyPath), false, `旧深链不应成为 Tab：${legacyPath}`)
  })
})

test('旧批量页面使用普通页面导航，不向非 Tab 页面调用 switchTab', () => {
  const planPage = read('pages/plan/index/index.js')
  const periodPage = read('subpackages/plan-extra/period/index.js')
  const detailPage = read('subpackages/plan-extra/detail/index.js')

  assert.doesNotMatch(planPage, /wx\.switchTab/)
  assert.match(planPage, /wx\.navigateTo\(\{ url: '\/pages\/recipes\/list\/index' \}\)/)
  assert.doesNotMatch(periodPage, /wx\.switchTab/)
  assert.match(periodPage, /wx\.redirectTo\(\{ url: '\/pages\/plan\/index\/index' \}\)/)
  assert.doesNotMatch(detailPage, /wx\.switchTab/)
  assert.match(detailPage, /wx\.navigateTo\(\{ url: '\/pages\/recipes\/list\/index' \}\)/)
})
