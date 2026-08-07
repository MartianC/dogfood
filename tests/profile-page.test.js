const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadProfilePage({ authState = 'guest', user = null } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages/profile/index/index.js'), 'utf8')
  let definition
  const context = {
    Page(page) {
      definition = page
    },
    getApp() {
      return { globalData: { authReady: Promise.resolve() } }
    },
    require(request) {
      if (request === '../../../services/authService') {
        return {
          getAuthState: () => authState,
          getCurrentUser: () => user
        }
      }
      if (request === '../../../utils/assets') return { defaultDogAvatar: '/assets/dogs/dog-head-profile.svg' }
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    Promise
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: 'pages/profile/index/index.js' })
  return definition
}

test('我的页面只同步账号状态，不请求狗狗档案', async () => {
  const user = { nickname: '小明', avatarUrl: '/assets/users/xiaoming.jpg' }
  const definition = loadProfilePage({
    authState: 'logged-in',
    user
  })
  let viewData
  let selected
  await definition.onShow.call({
    getTabBar: () => ({ setData(data) { selected = data.selected } }),
    setData(data) { viewData = data }
  })

  assert.equal(selected, 'profile')
  assert.equal(viewData.authState, 'logged-in')
  assert.equal(viewData.user, user)
})

test('我的页面只保留账号卡，不暴露狗狗或旧兼容入口', () => {
  const root = path.join(__dirname, '..', 'pages/profile/index')
  const js = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))

  assert.doesNotMatch(js, /dogService|onLogin|onAddDog|onEditDog|onHistory|onCustomRecipes/)
  assert.doesNotMatch(wxml, /dogs|dog-profile|empty-state|ui-button|历史清单|自定义食谱/)
  assert.deepEqual(Object.keys(json.usingComponents).sort(), ['ui-card', 'ui-tag'])
  assert.match(wxml, /profile-card/)
  assert.match(wxml, /ui-card/)
  assert.match(wxml, /ui-tag/)
})
