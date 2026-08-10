'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const contractRelativePath = 'contracts/navigation/project-navigation-migration-v1.json'
const targetTabs = [
  { id: 'home', label: '首页', pagePath: 'pages/home/index', position: 0 },
  { id: 'records', label: '记录', pagePath: 'pages/records/index', position: 1 },
  { id: 'dogs', label: '爱宠', pagePath: 'pages/dogs/index', position: 3 },
  { id: 'profile', label: '我的', pagePath: 'pages/profile/index/index', position: 4 }
]
const centralAction = {
  id: 'start-shared-meal',
  label: '记一顿',
  position: 2,
  isTab: false,
  hasSelectedState: false,
  entryService: 'services/sharedMealEntryService.js',
  currentFlowEntryPath: 'subpackages/shared-meal/dog-select/index',
  callers: [
    'pages/home/index',
    'pages/records/index',
    'custom-tab-bar/index'
  ]
}
const requiredInvariants = [
  'target-tab-paths-are-unique',
  'central-action-is-not-a-tab',
  'all-central-action-callers-use-one-entry-service',
  'task-pages-do-not-register-as-tabs',
  'legacy-deep-links-remain-registered',
  'legacy-pages-are-not-primary-entries',
  'pages-do-not-access-cloud-database-directly',
  'ui-recomposition-does-not-copy-domain-rules'
]

function readJson(relativePath, projectRoot = root) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'))
}

function readSource(relativePath, projectRoot = root) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function registeredRoutes(appConfig) {
  return [
    ...(appConfig.pages || []),
    ...(appConfig.subpackages || []).flatMap((subpackage) => (
      (subpackage.pages || []).map((page) => `${subpackage.root}/${page}`)
    ))
  ]
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message)
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateProjectNavigationContract(contract, projectRoot = root) {
  assertCondition(
    contract && contract.contract === 'projectNavigationMigration/v1',
    '项目导航迁移契约版本无效'
  )
  assertCondition(contract.status === 'frozen-target', '项目导航迁移契约必须处于 frozen-target 状态')
  assertCondition(
    contract.sourceOfTruth && fs.existsSync(path.join(projectRoot, contract.sourceOfTruth)),
    '项目导航迁移契约缺少有效的权威来源文档'
  )

  const target = contract.target || {}
  assertCondition(sameJson(target.tabBar, targetTabs), '项目导航目标必须是首页、记录、爱宠、我的四个目的地')
  assertCondition(sameJson(target.centralAction, centralAction), '中央记餐动作契约已被篡改')
  assertCondition(sameJson(target.registrationOrder, targetTabs.map((item) => item.pagePath)), '目标页面注册顺序不一致')

  const tabIds = (target.tabBar || []).map((item) => item.id)
  const tabPaths = (target.tabBar || []).map((item) => item.pagePath)
  assertCondition(new Set(tabIds).size === tabIds.length, '目标 Tab 标识必须唯一')
  assertCondition(new Set(tabPaths).size === tabPaths.length, '目标 Tab 路径必须唯一')
  assertCondition(target.centralAction && target.centralAction.isTab === false, '中央动作不能注册为 Tab')
  assertCondition(target.centralAction && target.centralAction.hasSelectedState === false, '中央动作不能拥有选中态')
  assertCondition(
    sameJson(contract.invariants, requiredInvariants),
    '项目导航迁移不变量清单不完整或顺序不一致'
  )

  const canonicalPages = (contract.pages || [])
    .filter((page) => page.canonicalId)
    .map((page) => ({ id: page.canonicalId, path: page.path }))
  const expectedCanonicalPages = targetTabs.map((item) => ({ id: item.id, path: item.pagePath }))
  assertCondition(sameJson(canonicalPages, expectedCanonicalPages), 'canonical 页面清单与目标 Tab 不一致')

  assertCondition(Array.isArray(contract.legacyDeepLinks) && contract.legacyDeepLinks.length > 0, '旧深链清单不能为空')
  contract.legacyDeepLinks.forEach((item) => {
    assertCondition(item && item.path && item.handling, '旧深链必须声明路径和处理方式')
  })
}

function extractObjectField(objectSource, fieldName) {
  const pattern = new RegExp(`${fieldName}\\s*:\\s*['"]([^'"]+)['"]`)
  const match = objectSource.match(pattern)
  return match ? match[1] : null
}

function extractTabItems(customTabBarSource) {
  const match = customTabBarSource.match(/(?:const|let|var)\s+items\s*=\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return Array.from(match[1].matchAll(/\{([\s\S]*?)\}/g), (item) => ({
    id: extractObjectField(item[1], 'value'),
    label: extractObjectField(item[1], 'label'),
    path: extractObjectField(item[1], 'path')
  }))
}

function loadNavigationSources(projectRoot = root) {
  return {
    customTabBarJs: readSource('custom-tab-bar/index.js', projectRoot),
    customTabBarWxml: readSource('custom-tab-bar/index.wxml', projectRoot),
    homeJs: readSource('pages/home/index.js', projectRoot),
    homeWxml: readSource('pages/home/index.wxml', projectRoot),
    recordsJs: readSource('pages/records/index.js', projectRoot),
    recordsWxml: readSource('pages/records/index.wxml', projectRoot),
    dogsJs: readSource('pages/dogs/index.js', projectRoot),
    profileJs: readSource('pages/profile/index/index.js', projectRoot),
    profileWxml: readSource('pages/profile/index/index.wxml', projectRoot)
  }
}

function sourceForCaller(caller, sources) {
  const sourceByCaller = {
    'pages/home/index': sources.homeJs,
    'pages/records/index': sources.recordsJs,
    'custom-tab-bar/index': sources.customTabBarJs
  }
  return sourceByCaller[caller]
}

function validateNavigationImplementation({ appConfig, contract, sources }) {
  validateProjectNavigationContract(contract)
  assertCondition(appConfig && appConfig.tabBar && Array.isArray(appConfig.tabBar.list), 'app.json 缺少 TabBar 列表')
  assertCondition(sources, '导航静态检查缺少页面或 TabBar 源码')

  const appTabs = appConfig.tabBar.list.map((item) => ({
    label: item.text,
    pagePath: item.pagePath
  }))
  const expectedAppTabs = targetTabs.map((item) => ({ label: item.label, pagePath: item.pagePath }))
  assertCondition(sameJson(appTabs, expectedAppTabs), 'app.json 必须注册首页、记录、爱宠、我的四个真实 Tab')

  const customItems = extractTabItems(sources.customTabBarJs)
  const expectedCustomItems = targetTabs.map((item) => ({
    id: item.id,
    label: item.label,
    path: `/${item.pagePath}`
  }))
  assertCondition(sameJson(customItems, expectedCustomItems), '自定义 TabBar 必须与 app.json 的四个真实目的地逐项一致')
  assertCondition(
    !customItems.some((item) => item.id === centralAction.id),
    '中央记餐动作不得出现在自定义 TabBar 的选中项列表中'
  )

  const selectedStatePattern = new RegExp(`selected\\s*[:=]\\s*['"]${centralAction.id}['"]`)
  assertCondition(!selectedStatePattern.test(sources.customTabBarJs), '中央记餐动作不得写入 TabBar selected 状态')
  assertCondition(
    sources.customTabBarWxml.includes(`data-action-id="${centralAction.id}"`),
    '自定义 TabBar 必须声明独立的中央记餐动作'
  )
  assertCondition(
    /bind(?::(?:tap|click)|tap|click)=["']onStartSharedMeal["']/.test(sources.customTabBarWxml),
    '中央记餐动作必须绑定统一记餐入口处理器'
  )
  assertCondition(
    sources.customTabBarJs.includes('onStartSharedMeal') &&
      /sharedMealEntryService\.startSharedMeal\s*\(\s*\)/.test(sources.customTabBarJs),
    '中央记餐动作必须调用统一记餐入口服务'
  )

  const callers = contract.target.centralAction.callers
  callers.forEach((caller) => {
    const source = sourceForCaller(caller, sources)
    assertCondition(source, `中央记餐调用方未提供源码：${caller}`)
    assertCondition(
      /sharedMealEntryService\.startSharedMeal\s*\(\s*\)/.test(source),
      `${caller} 未复用 sharedMealEntryService.startSharedMeal()`
    )
  })
  assertCondition(
    /bind(?::tap|tap)=["']on(?:CreateMeal|PrimaryTask)["']/.test(sources.homeWxml),
    '首页缺少统一记餐入口操作'
  )
  assertCondition(/bind(?::tap|tap)=["']onCreateMeal["']/.test(sources.recordsWxml), '记录空态缺少统一记餐入口操作')

  const directFlowPattern = new RegExp(centralAction.currentFlowEntryPath.replaceAll('/', '\\/'))
  const callerSources = callers.map((caller) => sourceForCaller(caller, sources)).join('\n')
  assertCondition(!directFlowPattern.test(callerSources), '首页、记录和中央动作不得直接复制记餐流程路径')

  const routes = registeredRoutes(appConfig)
  const targetPaths = contract.target.tabBar.map((item) => item.pagePath)
  targetPaths.forEach((targetPath) => {
    assertCondition(routes.includes(targetPath), `目标 Tab 页面未注册：${targetPath}`)
  })
  assertCondition(routes.includes('pages/dogs/index'), '狗狗 canonical 页面未注册')

  assertCondition(
    !/require\([^)]*services\/dogService["']?\)?/.test(sources.profileJs),
    '“我的”页面不得继续读取 dogService'
  )
  assertCondition(!/\bdogs\s*:/.test(sources.profileJs), '“我的”页面不得继续持有狗狗列表状态')
  assertCondition(!/on(?:Add|Edit)Dog\s*\(/.test(sources.profileJs), '“我的”页面不得继续提供狗狗档案编辑入口')
  assertCondition(!/wx:for=["']\{\{dogs\}\}/.test(sources.profileWxml), '“我的”页面不得继续渲染狗狗档案列表')

  const legacyPaths = contract.legacyDeepLinks.map((item) => item.path)
  const tabPaths = appConfig.tabBar.list.map((item) => item.pagePath)
  legacyPaths.forEach((legacyPath) => {
    assertCondition(routes.includes(legacyPath), `旧兼容路由已删除：${legacyPath}`)
    assertCondition(!tabPaths.includes(legacyPath), `旧兼容路由仍暴露为主 Tab：${legacyPath}`)
    assertCondition(
      !customItems.some((item) => item.path === `/${legacyPath}`),
      `旧兼容路由仍暴露在自定义 TabBar：${legacyPath}`
    )
  })

  const primarySources = [
    sources.homeJs,
    sources.homeWxml,
    sources.recordsJs,
    sources.recordsWxml,
    sources.dogsJs,
    sources.profileJs,
    sources.profileWxml,
    sources.customTabBarJs,
    sources.customTabBarWxml
  ].join('\n')
  legacyPaths.forEach((legacyPath) => {
    assertCondition(!primarySources.includes(legacyPath), `旧兼容路由仍被一级页面暴露：${legacyPath}`)
  })
}

function runProjectNavigationGate(projectRoot = root) {
  const contract = readJson(contractRelativePath, projectRoot)
  validateProjectNavigationContract(contract, projectRoot)
  validateNavigationImplementation({
    appConfig: readJson('app.json', projectRoot),
    contract,
    sources: loadNavigationSources(projectRoot)
  })
}

if (require.main === module) {
  try {
    runProjectNavigationGate()
    console.log('Project navigation migration gate passed.')
  } catch (error) {
    console.error(`Project navigation migration gate failed: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  extractTabItems,
  loadNavigationSources,
  registeredRoutes,
  runProjectNavigationGate,
  validateNavigationImplementation,
  validateProjectNavigationContract
}
