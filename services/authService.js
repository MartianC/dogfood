const env = require('../config/env')
const storage = require('../utils/storage')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
const DOGS_CACHE_SCHEMA_VERSION = 2

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
  const dogs = dogsCache && dogsCache.profileSchemaVersion === DOGS_CACHE_SCHEMA_VERSION
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
    return true
  } catch (error) {
    if (typeof wx !== 'undefined') {
      wx.showToast({ title: '登录失败，可以稍后再试', icon: 'none' })
    }
    return false
  }
}

function logout() {
  storage.removeSync('access_token')
  storage.removeSync('currentUser')
  setAuth(null, [])
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
  logout,
  refreshState,
  getAuthState,
  getCurrentUser
}
