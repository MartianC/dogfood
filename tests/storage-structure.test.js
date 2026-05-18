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

test('小程序配置包含四个 Tab 和关键分包路由', () => {
  const appJsonPath = path.join(__dirname, '..', 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))

  assert.deepEqual(
    appJson.tabBar.list.map((item) => item.text),
    ['首页', '食谱', '清单', '我的']
  )
  assert.ok(appJson.pages.includes('pages/home/index'))
  assert.ok(appJson.pages.includes('pages/recipes/list/index'))
  assert.ok(appJson.pages.includes('pages/plan/index/index'))
  assert.ok(appJson.pages.includes('pages/profile/index/index'))

  const roots = appJson.subpackages.map((item) => item.root)
  assert.deepEqual(roots, ['subpackages/dog-profile', 'subpackages/plan-extra', 'subpackages/custom-recipe'])
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
