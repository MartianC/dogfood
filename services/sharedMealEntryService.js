const authService = require('./authService')
const dogService = require('./dogService')

const SHARED_MEAL_FLOW_PATH = '/subpackages/shared-meal/dog-select/index'
const SHARED_MEAL_MENU_PATH = '/subpackages/shared-meal/menu-search/index'
const QUICK_CREATE_PATH = '/subpackages/dog-profile/dog-quick-create/index'

let activeEntry = null

function buildFlowUrl(options = {}) {
  return options.skipHumanMenu
    ? `${SHARED_MEAL_FLOW_PATH}?skipHumanMenu=1`
    : SHARED_MEAL_FLOW_PATH
}

function buildQuickCreateUrl(options = {}) {
  return `${QUICK_CREATE_PATH}?redirect=${encodeURIComponent(buildFlowUrl(options))}`
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

async function runEntry(options = {}) {
  const authReady = currentAuthReady()
  if (authReady && typeof authReady.then === 'function') await authReady

  if (authService.getAuthState() === 'guest') {
    const loggedIn = await authService.login()
    if (!loggedIn) return { status: 'login-failed', navigated: false }
  }

  const dogs = await dogService.listDogs()
  if (!dogs.length) {
    const url = buildQuickCreateUrl(options)
    navigateTo(url)
    return { status: 'profile-required', navigated: true, url }
  }

  // 常规单狗入口直接选菜；跳过菜单时仍由选狗分包完成资格检查和空白草稿初始化。
  if (dogs.length === 1 && !options.skipHumanMenu) {
    const url = `${SHARED_MEAL_MENU_PATH}?dogId=${encodeURIComponent(String(dogs[0].id || ''))}`
    navigateTo(url)
    return { status: 'menu-started', navigated: true, url }
  }

  const url = buildFlowUrl(options)
  navigateTo(url)
  return {
    status: 'flow-started',
    navigated: true,
    url
  }
}

function startSharedMeal(options = {}) {
  if (activeEntry) return activeEntry
  activeEntry = runEntry(options).finally(() => {
    activeEntry = null
  })
  return activeEntry
}

module.exports = {
  SHARED_MEAL_FLOW_PATH,
  buildFlowUrl,
  buildQuickCreateUrl,
  startSharedMeal
}
