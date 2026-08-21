const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function loadAccountPage({
  authState = 'logged-in',
  user = { id: 'user-1', nickname: '小明', avatarUrl: '/assets/profile/user.jpg' },
  saveAvatar = async () => '/assets/profile/new-avatar.jpg',
  updateCurrentUserProfile = async (profile) => ({ ...user, ...profile }),
  login = async () => true
} = {}) {
  const source = fs.readFileSync(path.join(root, 'pages/profile/account/index.js'), 'utf8')
  let definition
  const calls = []
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
          updateCurrentUserProfile,
          login
        }
      }
      if (request === '../../../services/userProfileService') return { saveAvatar }
      if (request === '../../../utils/assets') {
        return { defaultUserAvatar: '/assets/profile/default-user-avatar.svg' }
      }
      throw new Error(`测试未提供依赖：${request}`)
    },
    wx: {
      showToast(options) {
        calls.push(['toast', options])
      },
      navigateBack(options) {
        calls.push(['back', options])
      }
    },
    module: { exports: {} },
    exports: {},
    Promise
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, {
    filename: 'pages/profile/account/index.js'
  })
  return { definition, calls }
}

test('账号二级页加载当前用户并允许游客发起登录', async () => {
  const user = { id: 'user-1', nickname: '小明', avatarUrl: '' }
  let loggedIn = false
  const { definition } = loadAccountPage({
    authState: 'guest',
    user: null,
    async login() {
      loggedIn = true
      return true
    }
  })
  let viewData

  await definition.onShow.call({
    setData(data) { viewData = data }
  })
  assert.equal(viewData.authState, 'guest')

  await definition.onLogin.call({
    onShow: async () => { loggedIn = true }
  })
  assert.equal(loggedIn, true)
})

test('账号二级页保存昵称和新头像，并返回我的页面', async () => {
  const user = { id: 'user-1', nickname: '小明', avatarUrl: '/assets/profile/user.jpg' }
  const calls = []
  const { definition, calls: wxCalls } = loadAccountPage({
    user,
    async saveAvatar(tempFilePath, userId) {
      calls.push(['avatar', tempFilePath, userId])
      return 'cloud://user-avatars/user-1/avatar'
    },
    async updateCurrentUserProfile(profile) {
      calls.push(['profile', profile])
      return { ...user, ...profile }
    }
  })
  let viewData = { ...definition.data, user, authState: 'logged-in', avatarTempFilePath: 'wxfile://tmp-avatar', avatarUrl: 'wxfile://tmp-avatar', nickname: '  新昵称  ' }

  await definition.onSave.call({
    data: viewData,
    setData(next) { viewData = { ...viewData, ...next } }
  })

  assert.equal(calls[0][0], 'avatar')
  assert.equal(calls[0][1], 'wxfile://tmp-avatar')
  assert.equal(calls[0][2], 'user-1')
  assert.equal(calls[1][0], 'profile')
  assert.equal(calls[1][1].avatarUrl, 'cloud://user-avatars/user-1/avatar')
  assert.equal(calls[1][1].nickname, '新昵称')
  assert.equal(viewData.saving, false)
  assert.equal(wxCalls[1][0], 'back')
  assert.equal(wxCalls[1][1].delta, 1)
})

test('账号二级页包含头像选择、昵称输入和保存入口', () => {
  const pageRoot = path.join(root, 'pages/profile/account')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  assert.ok(appConfig.pages.includes('pages/profile/account/index'))
  assert.deepEqual(Object.keys(json.usingComponents).sort(), ['ui-button', 'ui-card', 'ui-field'])
  assert.match(wxml, /openType="chooseAvatar"/)
  assert.match(wxml, /bind:chooseavatar="onChooseAvatar"/)
  assert.match(wxml, /bindinput="onNicknameInput"/)
  assert.match(wxml, /bind:tap="onSave"/)
})

test('账号头像选择后直接使用微信返回的裁剪结果', () => {
  const { definition } = loadAccountPage()
  const viewData = {
    ...definition.data,
    authState: 'logged-in',
    avatarUrl: '/assets/profile/old-avatar.jpg'
  }
  const context = {
    data: viewData,
    setData(patch) { Object.assign(viewData, patch) }
  }

  definition.onChooseAvatar.call(context, { detail: { avatarUrl: 'wxfile://wechat-avatar' } })
  assert.equal(viewData.avatarUrl, 'wxfile://wechat-avatar')
  assert.equal(viewData.avatarTempFilePath, 'wxfile://wechat-avatar')
})
