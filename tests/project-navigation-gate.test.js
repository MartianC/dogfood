const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const {
  validateNavigationImplementation,
  validateProjectNavigationContract
} = require('../scripts/check-project-navigation-gate')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function createAppConfig(contract) {
  const legacyPaths = contract.legacyDeepLinks.map((item) => item.path)
  const mainLegacyPaths = legacyPaths.filter((item) => !item.startsWith('subpackages/'))
  const subpackagePaths = legacyPaths
    .filter((item) => item.startsWith('subpackages/'))
    .reduce((groups, item) => {
      const [rootPath, ...pageParts] = item.split('/')
      const page = pageParts.join('/')
      const group = groups.find((candidate) => candidate.root === rootPath)
      if (group) group.pages.push(page)
      else groups.push({ root: rootPath, pages: [page] })
      return groups
    }, [])

  return {
    pages: [
      ...contract.target.registrationOrder,
      ...mainLegacyPaths
    ],
    subpackages: subpackagePaths,
    tabBar: {
      list: contract.target.tabBar.map((item) => ({
        pagePath: item.pagePath,
        text: item.label
      }))
    }
  }
}

function createSources(contract) {
  const tabItems = contract.target.tabBar.map((item) => (
    `{ value: '${item.id}', label: '${item.label}', path: '/${item.pagePath}' }`
  )).join(',\n  ')
  const tabMarkup = contract.target.tabBar.map((item) => (
    `<t-tab-bar-item value="${item.id}">${item.label}</t-tab-bar-item>`
  )).join('\n')

  return {
    customTabBarJs: `const sharedMealEntryService = require('../services/sharedMealEntryService')
const items = [\n  ${tabItems}\n]
Component({
  data: { selected: 'home', items },
  methods: {
    onStartSharedMeal() { return sharedMealEntryService.startSharedMeal() }
  }
})`,
    customTabBarWxml: `<t-tab-bar>\n${tabMarkup}\n</t-tab-bar>\n<button data-action-id="start-shared-meal" bindtap="onStartSharedMeal">记一顿</button>`,
    homeJs: "const sharedMealEntryService = require('../../services/sharedMealEntryService')\nfunction onCreateMeal() { return sharedMealEntryService.startSharedMeal() }",
    homeWxml: '<ui-button bind:tap="onCreateMeal">开始记录</ui-button>',
    recordsJs: "const sharedMealEntryService = require('../../services/sharedMealEntryService')\nfunction onCreateMeal() { return sharedMealEntryService.startSharedMeal() }",
    recordsWxml: '<ui-button bind:tap="onCreateMeal">记录第一顿</ui-button>',
    dogsJs: "const dogService = require('../../services/dogService')\nPage({})",
    profileJs: "const authService = require('../../../services/authService')\nPage({ data: { authState: 'guest' } })",
    profileWxml: '<view>账号与设置</view>'
  }
}

function createFixture() {
  const contract = readJson('contracts/navigation/project-navigation-migration-v1.json')
  return {
    contract,
    appConfig: createAppConfig(contract),
    sources: createSources(contract)
  }
}

test('目标导航契约和实现样例可以通过 G1.1 门禁', () => {
  const fixture = createFixture()

  assert.doesNotThrow(() => validateProjectNavigationContract(fixture.contract, root))
  assert.doesNotThrow(() => validateNavigationImplementation(fixture))
})

test('门禁拒绝三 Tab 基线，避免 N1.1 提前切换或漏注册狗狗 Tab', () => {
  const fixture = createFixture()
  fixture.appConfig.tabBar.list.splice(2, 1)

  assert.throws(
    () => validateNavigationImplementation(fixture),
    /app\.json 必须注册首页、记录、狗狗、我的四个真实 Tab/
  )
})

test('门禁拒绝把中央记餐动作加入选中项或 selected 状态', () => {
  const fixture = createFixture()
  fixture.sources.customTabBarJs = fixture.sources.customTabBarJs.replace(
    "const items = [",
    "const items = [{ value: 'start-shared-meal', label: '记一顿', path: '/start-shared-meal' },"
  )

  assert.throws(
    () => validateNavigationImplementation(fixture),
    /自定义 TabBar 必须与 app\.json 的四个真实目的地逐项一致/
  )
})

test('门禁拒绝“我的”继续读取或渲染狗狗档案', () => {
  const fixture = createFixture()
  fixture.sources.profileJs = "const dogService = require('../../../services/dogService')\nPage({ data: { dogs: [] } })"
  fixture.sources.profileWxml = '<view wx:for="{{dogs}}">{{item.name}}</view>'

  assert.throws(
    () => validateNavigationImplementation(fixture),
    /“我的”页面不得继续读取 dogService/
  )
})

test('门禁拒绝删除旧深链或把兼容页重新暴露为一级入口', () => {
  const fixture = createFixture()
  const legacyPath = fixture.contract.legacyDeepLinks[0].path
  fixture.appConfig.pages = fixture.appConfig.pages.filter((page) => page !== legacyPath)

  assert.throws(
    () => validateNavigationImplementation(fixture),
    new RegExp(`旧兼容路由已删除：${legacyPath.replaceAll('/', '\\/')}`)
  )

  const exposed = createFixture()
  exposed.sources.profileWxml = `<navigator url="/${legacyPath}">旧入口</navigator>`
  assert.throws(
    () => validateNavigationImplementation(exposed),
    new RegExp(`旧兼容路由仍被一级页面暴露：${legacyPath.replaceAll('/', '\\/')}`)
  )
})

test('门禁拒绝首页、记录或中央动作绕过统一记餐入口', () => {
  const fixture = createFixture()
  fixture.sources.recordsJs = "function onCreateMeal() { wx.navigateTo({ url: '/subpackages/shared-meal/dog-select/index' }) }"

  assert.throws(
    () => validateNavigationImplementation(fixture),
    /pages\/records\/index 未复用 sharedMealEntryService\.startSharedMeal\(\)/
  )
})
