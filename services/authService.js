const env = require('../config/env')
const storage = require('../utils/storage')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
const { isDogsCacheValid } = require('./dogProfileContract')
const dataInvalidationService = require('./dataInvalidationService')

let authState = 'guest'
let currentUser = null

function setAuth(user, dogs) {
  currentUser = user || null
  if (!user) {
    authState = 'guest'
    return authState
  }
  authState = dogs && dogs.length > 0 ? 'has-profile' : 'logged-in'
  return authState
}

async function initAuth() {
  const token = storage.getSync('access_token')
  if (!token) {
    setAuth(null, [])
    return { authState, user: null, dogs: [] }
  }
  currentUser = storage.getSync('currentUser', env.mockUser)
  const dogsCache = storage.getCache('dogsCache')
  // 缓存是首屏展示快照，不替代服务端事实；版本或过期时交给后续刷新读取。
  const dogs = isDogsCacheValid(dogsCache)
    ? dogsCache.items
    : []
  setAuth(currentUser, dogs)
  return { authState, user: currentUser, dogs }
}

async function login() {
  try {
    const result = await adapter.login()
    storage.setSync('access_token', result.token)
    storage.setSync('currentUser', result.user)
    const dogService = require('./dogService')
    const dogs = await dogService.listDogs()
    setAuth(result.user, dogs)
    dataInvalidationService.markDirty()
    return true
  } catch (error) {
    if (typeof wx !== 'undefined') {
      wx.showToast({ title: '登录失败，可以稍后再试', icon: 'none' })
    }
    return false
  }
}

async function updateCurrentUserProfile(profile = {}) {
  if (!currentUser) return null
  const nextProfile = {
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : currentUser.avatarUrl || '',
    nickname: typeof profile.nickname === 'string'
      ? profile.nickname.trim().slice(0, 20)
      : currentUser.nickname || ''
  }
  const localUser = { ...currentUser, ...nextProfile }
  currentUser = localUser
  storage.setSync('currentUser', localUser)

  try {
    const remoteUser = await adapter.updateUserProfile(nextProfile)
    currentUser = { ...localUser, ...(remoteUser || {}) }
    storage.setSync('currentUser', currentUser)
  } catch (error) {
    // 本机缓存仍可使用；远端同步失败不应撤销用户刚选择的头像。
  }
  return currentUser
}

function logout() {
  storage.removeSync('access_token')
  storage.removeSync('currentUser')
  storage.removeSync('dogsCache')
  setAuth(null, [])
  dataInvalidationService.markDirty()
}

function refreshState(dogs) {
  const user = storage.getSync('currentUser', currentUser)
  setAuth(user, dogs)
}

function getAuthState() {
  return authState
}

function getCurrentUser() {
  return currentUser
}

module.exports = {
  initAuth,
  login,
  updateCurrentUserProfile,
  logout,
  refreshState,
  getAuthState,
  getCurrentUser
}
