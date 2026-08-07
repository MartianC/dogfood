const authService = require('./authService')
const dogService = require('./dogService')

const SHARED_MEAL_FLOW_PATH = '/subpackages/shared-meal/dog-select/index'
const SHARED_MEAL_MENU_PATH = '/subpackages/shared-meal/menu-search/index'
const QUICK_CREATE_PATH = '/subpackages/dog-profile/dog-quick-create/index'

let activeEntry = null

function buildQuickCreateUrl() {
  return `${QUICK_CREATE_PATH}?redirect=${encodeURIComponent(SHARED_MEAL_FLOW_PATH)}`
}

function currentAuthReady() {
  if (typeof getApp !== 'function') return null
  const app = getApp()
  return app && app.globalData && app.globalData.authReady
}

function navigateTo(url) {
  if (typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
    throw new Error('当前环境无法打开记餐流程')
  }
  wx.navigateTo({ url })
}

async function runEntry() {
  const authReady = currentAuthReady()
  if (authReady && typeof authReady.then === 'function') await authReady

  if (authService.getAuthState() === 'guest') {
    const loggedIn = await authService.login()
    if (!loggedIn) return { status: 'login-failed', navigated: false }
  }

  const dogs = await dogService.listDogs()
  if (!dogs.length) {
    const url = buildQuickCreateUrl()
    navigateTo(url)
    return { status: 'profile-required', navigated: true, url }
  }

  // 单狗直接打开分包选菜页，由分包在加载后完成资格检查和草稿初始化。
  if (dogs.length === 1) {
    const url = `${SHARED_MEAL_MENU_PATH}?dogId=${encodeURIComponent(String(dogs[0].id || ''))}`
    navigateTo(url)
    return { status: 'menu-started', navigated: true, url }
  }

  navigateTo(SHARED_MEAL_FLOW_PATH)
  return {
    status: 'flow-started',
    navigated: true,
    url: SHARED_MEAL_FLOW_PATH
  }
}

function startSharedMeal() {
  if (activeEntry) return activeEntry
  activeEntry = runEntry().finally(() => {
    activeEntry = null
  })
  return activeEntry
}

module.exports = {
  SHARED_MEAL_FLOW_PATH,
  buildQuickCreateUrl,
  startSharedMeal
}
