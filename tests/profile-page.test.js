const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadProfilePage({
  authState = 'guest',
  user = null,
  saveAvatar = async (avatarUrl) => avatarUrl,
  updateCurrentUserProfile = async (profile) => ({ ...user, ...profile })
} = {}) {
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
          getCurrentUser: () => user,
          updateCurrentUserProfile
        }
      }
      if (request === '../../../services/userProfileService') return { saveAvatar }
      if (request === '../../../utils/assets') {
        return { defaultUserAvatar: '/assets/profile/default-user-avatar.svg' }
      }
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    Promise,
    wx: { showToast() {} }
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
  assert.equal(viewData.displayNickname, '小明')
})

test('我的页面将旧品牌默认昵称显示为爪饭用户', async () => {
  const definition = loadProfilePage({
    authState: 'logged-in',
    user: { nickname: '狗饭用户', avatarUrl: '' }
  })
  let viewData

  await definition.onShow.call({
    setData(data) { viewData = data }
  })

  assert.equal(viewData.displayNickname, '爪饭用户')
})

test('微信头像加载失败时回退到默认用户 SVG', () => {
  const definition = loadProfilePage()
  let viewData

  definition.onAvatarError.call({
    setData(data) { viewData = data }
  })

  assert.equal(viewData.avatarUrl, '')
})

test('我的页面按使用帮助、账号与数据、关于爪饭分组，不暴露狗狗或旧兼容入口', () => {
  const root = path.join(__dirname, '..', 'pages/profile/index')
  const js = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))

  assert.doesNotMatch(js, /dogService|onLogin|onAddDog|onEditDog|onHistory|onCustomRecipes/)
  assert.doesNotMatch(wxml, /dogs|dog-profile|empty-state|历史清单|自定义食谱/)
  assert.deepEqual(Object.keys(json.usingComponents).sort(), ['ui-button', 'ui-card', 'ui-tag'])
  assert.match(wxml, /profile-card/)
  assert.match(wxml, /ui-card/)
  assert.match(wxml, /ui-tag/)
  assert.doesNotMatch(wxml, /openType="chooseAvatar"|bind:chooseavatar/)
  assert.match(wxml, /defaultUserAvatar/)
  assert.match(wxml, /bind:error="onAvatarError"/)
  assert.match(wxml, /url="\/pages\/profile\/account\/index"/)
  assert.match(wxml, /profile-account-entry__chevron/)
  assert.match(wxml, /使用帮助/)
  assert.match(wxml, /账号与数据/)
  assert.match(wxml, /关于爪饭/)
  assert.match(wxml, /如何开始记录第一顿/)
  assert.match(wxml, /本餐评估说明/)
  assert.match(wxml, /隐私与数据说明/)
  assert.match(wxml, /交流与反馈/)
  assert.match(wxml, /url="\/pages\/profile\/feedback\/index"/)
  assert.match(wxml, /分享爪饭/)
  assert.match(wxml, /openType="share"/)
  assert.ok(wxml.indexOf('分享爪饭') < wxml.indexOf('交流与反馈'))
  assert.match(js, /onShareAppMessage/)
  assert.match(js, /path: '\/pages\/home\/index'/)
  assert.ok(wxml.indexOf('使用帮助') < wxml.indexOf('账号与数据'))
  assert.ok(wxml.indexOf('账号与数据') < wxml.indexOf('关于爪饭'))
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/profile/default-user-avatar.svg')))
})
