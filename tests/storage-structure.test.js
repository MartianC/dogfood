const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

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

test('小程序配置包含四个新主 Tab、记录页和旧兼容路由', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))

  assert.deepEqual(
    appJson.tabBar.list.map((item) => item.text),
    ['首页', '记录', '狗狗', '我的']
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

test('TabBar 通过 TDesign 自定义组件保留四个主路由和中央记一顿动作', () => {
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
  assert.equal(tabBarJson.usingComponents['t-fab'], 'tdesign-miniprogram/fab/fab')
  assert.match(tabBarWxml, /theme="normal"/)
  assert.match(tabBarWxml, /shape="normal"/)
  assert.match(tabBarWxml, /bordered="\{\{true\}\}"/)
  assert.match(tabBarWxml, /safe-area-inset-bottom="\{\{true\}\}"/)
  assert.match(tabBarWxml, /class="app-tab-bar" style="\{\{tabBarContainerStyle\}\}"/)
  assert.doesNotMatch(tabBarWxml, /theme="tag"|shape="round"/)
  assert.match(tabBarWxml, /data-action-id="start-shared-meal"/)
  assert.match(tabBarWxml, /aria-label="记一顿"/)
  assert.match(tabBarWxml, /class="app-tab-bar__fab-label"/)
  assert.doesNotMatch(tabBarWxml, /class="app-tab-bar__safe-area"/)
  assert.match(tabBarWxml, /bind:click="onStartSharedMeal"/)
  assert.match(tabBarJs, /--td-tab-bar-height: 88rpx/)
  assert.match(tabBarJs, /--td-font-body-large: 22rpx \/ 32rpx/)
  assert.match(tabBarJs, /--td-tab-bar-border-color: #d8e1da/)
  assert.match(tabBarJs, /flex: 0 0 calc\(\(100% - 142rpx\) \/ 4\)/)
  assert.match(tabBarJs, /margin: 12rpx 0/)
  assert.match(tabBarJs, /tabBarGapStyle: 'flex: 0 0 142rpx; width: 142rpx/)
  assert.match(tabBarJs, /position: absolute/)
  assert.match(tabBarJs, /bottom: calc\(64rpx \+ var\(--df-tab-bar-safe-area-bottom\)\)/)
  assert.match(tabBarJs, /getWindowInfo\(\)/)
  assert.match(tabBarJs, /screenHeight - info\.safeArea\.bottom/)
  assert.match(tabBarJs, /safeAreaBottomPx \* 750 \/ windowWidth/)
  assert.match(tabBarJs, /height: \$\{112 \+ safeAreaBottom\}rpx/)
  assert.match(tabBarJs, /tabBarContainerStyle: getTabBarContainerStyle\(\)/)
  assert.match(tabBarJs, /resize\(\)\s*\{[\s\S]*tabBarContainerStyle: getTabBarContainerStyle\(\)/)
  assert.match(tabBarJs, /sharedMealEntryService\.startSharedMeal\(\)/)
  assert.match(tabBarJs, /value: 'dogs'/)
  assert.match(tabBarJs, /width: 96rpx/)
  assert.match(tabBarJs, /height: 96rpx/)
  assert.match(tabBarJs, /pointer-events: auto/)
  assert.match(tabBarJs, /fabButtonProps:\s*\{[^}]*style:/s)
  assert.match(tabBarJs, /--td-button-primary-bg-color:\s*#25684a/)
  assert.match(tabBarJs, /--td-button-primary-active-bg-color:\s*#1d523a/)
  assert.match(tabBarJs, /--td-button-primary-bg-color: var\(--df-color-primary\)/)
  assert.match(tabBarWxss, /width:\s*100%/)
  assert.match(tabBarWxss, /:host\s*\{[\s\S]*?background-color:\s*var\(--df-color-surface\);/)
  assert.match(tabBarWxss, /\.app-tab-bar\s*\{[\s\S]*?margin:\s*0;/)
  assert.match(tabBarWxss, /\.app-tab-bar\s*\{[\s\S]*?position:\s*relative;/)
  assert.match(tabBarWxss, /\.app-tab-bar\s*\{[\s\S]*?height:\s*112rpx;/)
  assert.match(tabBarWxss, /\.app-tab-bar__fab-label\s*\{[\s\S]*?position:\s*absolute;/)
  assert.doesNotMatch(tabBarWxss, /\.app-tab-bar__fab-label\s*\{[\s\S]*?position:\s*fixed;/)
  assert.doesNotMatch(tabBarWxss, /--td-tab-bar-round-shadow/)
  assert.match(tabBarWxss, /width:\s*40rpx/)
  assert.match(tabBarWxss, /margin-bottom:\s*4rpx/)
  assert.match(tabBarWxss, /var\(--df-tab-bar-safe-area-bottom\)/)
  assert.match(tabBarWxss, /:host\s*\{[\s\S]*?overflow:\s*visible;/)
  assert.match(tabBarJs, /wx\.switchTab/)

  const appWxss = fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')
  assert.match(appWxss, /\.page\.with-tab-bar\s*\{[\s\S]*?padding-bottom: calc\(132rpx \+ env\(safe-area-inset-bottom\)\);/)

  const routes = Array.from(tabBarJs.matchAll(/path:\s*'([^']+)'/g), (match) => match[1])
  assert.deepEqual(routes, appJson.tabBar.list.map((item) => `/${item.pagePath}`))
})

test('TabBar 在有无底部安全区的机型中保持稳定容器几何', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'custom-tab-bar/index.js'), 'utf8')
  const getContainerStyle = (windowInfo) => {
    let definition = null
    vm.runInNewContext(source, {
      Component(options) {
        definition = options
      },
      Number,
      Math,
      require() {
        return { startSharedMeal() {} }
      },
      wx: {
        getWindowInfo() {
          return windowInfo
        },
        getSystemInfoSync() {
          return windowInfo
        }
      }
    })
    return definition.data.tabBarContainerStyle
  }

  assert.equal(
    getContainerStyle({ windowWidth: 390, screenHeight: 844, safeArea: { bottom: 810 } }),
    '--df-tab-bar-safe-area-bottom: 65rpx;height: 177rpx'
  )
  assert.equal(
    getContainerStyle({ windowWidth: 360, screenHeight: 800, safeArea: { bottom: 800 } }),
    '--df-tab-bar-safe-area-bottom: 0rpx;height: 112rpx'
  )
})

test('四个 Tab 页面在显示时同步 TDesign 选中态', () => {
  const expected = {
    'pages/home/index.js': 'home',
    'pages/records/index.js': 'records',
    'pages/dogs/index.js': 'dogs',
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
  assert.match(buttonWxss, /\.ui-button--warning-outline\s*\{/)
  assert.match(buttonWxss, /ui-button--pressed\.ui-button--warning-outline/)
  assert.match(buttonWxss, /\.ui-button--xlarge\s*\{[^}]*min-height:\s*max\(96rpx, 48px\)/s)
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

test('狗狗档案卡片只展示派生阶段并为旧档案保留待完善状态', () => {
  const root = path.join(__dirname, '..')
  const sources = fs.readFileSync(path.join(root, 'components/dog-card/index.js'), 'utf8')
  const templates = fs.readFileSync(path.join(root, 'components/dog-card/index.wxml'), 'utf8')

  assert.doesNotMatch(sources, /ageStageLabels/)
  assert.doesNotMatch(templates, /ageStageLabels|\.ageStage/)
  assert.match(templates, /lifeStageLabel/)
  assert.match(templates, /档案待完善/)
})
