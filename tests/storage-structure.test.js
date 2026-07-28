const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const mealPlanService = require('../services/mealPlanService')
const dogService = require('../services/dogService')

test('清单保存失败时进入本地待同步队列并可重试', async () => {
  const memory = new Map()
  const failingAdapter = {
    async saveMealPlan() {
      throw new Error('network down')
    }
  }
  const okAdapter = {
    async saveMealPlan(payload) {
      return { ...payload, id: 'plan_saved' }
    }
  }

  mealPlanService.__setStorageForTest(memory)
  mealPlanService.__setAdapterForTest(failingAdapter)

  const result = await mealPlanService.savePlan({ recipeName: '低脂鳕鱼饭', totalItems: [] })
  assert.equal(result.syncStatus, 'pending')
  assert.equal(memory.get('pendingMealPlans').length, 1)

  mealPlanService.__setAdapterForTest(okAdapter)
  const synced = await mealPlanService.syncPendingPlans()
  assert.equal(synced.syncedCount, 1)
  assert.deepEqual(memory.get('pendingMealPlans'), [])
})

test('小程序配置包含三个新主 Tab、记录页和旧兼容路由', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))

  assert.deepEqual(
    appJson.tabBar.list.map((item) => item.text),
    ['首页', '记录', '我的']
  )
  assert.ok(appJson.pages.includes('pages/home/index'))
  assert.ok(appJson.pages.includes('pages/records/index'))
  assert.ok(appJson.pages.includes('pages/recipes/list/index'))
  assert.ok(appJson.pages.includes('pages/plan/index/index'))
  assert.ok(appJson.pages.includes('pages/profile/index/index'))

  const roots = appJson.subpackages.map((item) => item.root)
  assert.deepEqual(roots, [
    'subpackages/dog-profile',
    'subpackages/plan-extra',
    'subpackages/custom-recipe',
    'subpackages/shared-meal'
  ])
  const sharedMealPackage = appJson.subpackages.find(
    (item) => item.root === 'subpackages/shared-meal'
  )
  assert.deepEqual(sharedMealPackage.pages, [
    'menu-search/index',
    'dog-select/index',
    'dog-select/menu-search/index',
    'compose/index',
    'record-detail/index'
  ])
})

test('TabBar 使用本地图标资源', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))

  appJson.tabBar.list.forEach((item) => {
    assert.match(item.iconPath, /^assets\/tabbar\/.+\.png$/)
    assert.match(item.selectedIconPath, /^assets\/tabbar\/.+-active\.png$/)

    ;[item.iconPath, item.selectedIconPath].forEach((iconPath) => {
      const fullPath = path.join(__dirname, '..', iconPath)
      assert.ok(fs.existsSync(fullPath), `${iconPath} 不存在`)
      assert.ok(fs.statSync(fullPath).size > 0, `${iconPath} 是空文件`)
      assert.ok(fs.statSync(fullPath).size < 40 * 1024, `${iconPath} 超过小程序 tabBar 建议大小`)
    })
  })
})

test('TabBar 通过 TDesign 自定义组件保留三个主路由', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  const tabBarRoot = path.join(__dirname, '..', 'custom-tab-bar')
  const tabBarJson = JSON.parse(fs.readFileSync(path.join(tabBarRoot, 'index.json'), 'utf8'))
  const tabBarWxml = fs.readFileSync(path.join(tabBarRoot, 'index.wxml'), 'utf8')
  const tabBarJs = fs.readFileSync(path.join(tabBarRoot, 'index.js'), 'utf8')
  const tabBarWxss = fs.readFileSync(path.join(tabBarRoot, 'index.wxss'), 'utf8')

  assert.equal(appJson.tabBar.custom, true)
  assert.equal(Object.hasOwn(appJson, 'style'), false)
  assert.equal(tabBarJson.usingComponents['t-tab-bar'], 'tdesign-miniprogram/tab-bar/tab-bar')
  assert.equal(tabBarJson.usingComponents['t-tab-bar-item'], 'tdesign-miniprogram/tab-bar-item/tab-bar-item')
  assert.match(tabBarWxml, /theme="tag"/)
  assert.match(tabBarWxml, /shape="round"/)
  assert.match(tabBarJs, /--td-tab-bar-height: 80rpx/)
  assert.match(tabBarJs, /--td-font-body-large: 28rpx \/ 40rpx/)
  assert.match(tabBarWxss, /width:\s*100%/)
  assert.match(tabBarWxss, /width:\s*32rpx/)
  assert.match(tabBarWxss, /margin-bottom:\s*4rpx/)
  assert.match(tabBarWxss, /margin:\s*0 auto 56rpx/)
  assert.match(tabBarJs, /wx\.switchTab/)

  const routes = Array.from(tabBarJs.matchAll(/path:\s*'([^']+)'/g), (match) => match[1])
  assert.deepEqual(routes, appJson.tabBar.list.map((item) => `/${item.pagePath}`))
})

test('三个 Tab 页面在显示时同步 TDesign 选中态', () => {
  const expected = {
    'pages/home/index.js': 'home',
    'pages/records/index.js': 'records',
    'pages/profile/index/index.js': 'profile'
  }

  Object.entries(expected).forEach(([file, selected]) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const wxml = fs.readFileSync(path.join(__dirname, '..', file.replace(/\.js$/, '.wxml')), 'utf8')
    assert.match(source, new RegExp(`getTabBar\\(\\).*selected: '${selected}'`, 's'), `${file} 未同步 ${selected}`)
    assert.match(wxml, /class="[^"]*page[^"]*with-tab-bar[^"]*"/, `${file} 未预留自定义 TabBar 空间`)
  })
})

test('按钮按下态统一使用项目主题色', () => {
  const root = path.join(__dirname, '..')
  const buttonWxml = fs.readFileSync(path.join(root, 'components/ui/ui-button/index.wxml'), 'utf8')
  const buttonWxss = fs.readFileSync(path.join(root, 'components/ui/ui-button/index.wxss'), 'utf8')
  const vendorStyles = [
    'components/vendor/recipe-create-popup/index.wxss',
    'components/vendor/recipe-fab/index.wxss',
    'components/vendor/recipe-empty/index.wxss'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')

  assert.match(buttonWxml, /hover-class="ui-button--pressed"/)
  assert.match(buttonWxss, /ui-button--pressed\.ui-button--primary/)
  assert.match(buttonWxss, /ui-button--pressed\.ui-button--ghost/)
  assert.match(vendorStyles, /--td-brand-color-active:\s*var\(--df-color-primary-pressed\)/)
  assert.match(vendorStyles, /--td-button-primary-active-bg-color:\s*var\(--df-color-primary-pressed\)/)
  assert.match(vendorStyles, /--td-button-light-active-bg-color:\s*var\(--df-color-primary-soft-pressed\)/)
})

test('食谱详情页只保留选择制作周期按钮', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/recipes/detail/index.wxml'), 'utf8')
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/recipes/detail/index.js'), 'utf8')

  assert.match(wxml, /选择制作周期/)
  assert.doesNotMatch(wxml, /查看其他食谱|先看看其他食谱/)
  assert.doesNotMatch(js, /onBrowseMore/)
})

test('狗狗档案标准化保留头像字段', () => {
  const dog = dogService.normalizeDog({
    name: '布丁',
    ageStage: 'adult',
    weightKg: 12,
    dailyMeals: 2,
    avatarUrl: '/assets/dogs/default-dog.jpg'
  })

  assert.equal(dog.avatarUrl, '/assets/dogs/default-dog.jpg')
})

test('档案列表和卡片只展示派生阶段并为旧档案保留待完善状态', () => {
  const root = path.join(__dirname, '..')
  const sources = [
    'pages/profile/index/index.js',
    'components/dog-card/index.js'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
  const templates = [
    'pages/profile/index/index.wxml',
    'components/dog-card/index.wxml'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')

  assert.doesNotMatch(sources, /ageStageLabels/)
  assert.doesNotMatch(templates, /ageStageLabels|\.ageStage/)
  assert.match(templates, /lifeStageLabel/)
  assert.match(templates, /档案待完善/)
})
