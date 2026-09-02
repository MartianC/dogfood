const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('小程序运行时食谱数据通过 JS 模块加载', () => {
  const recipesModulePath = path.join(__dirname, '..', 'data', 'recipes.js')
  const recipes = require(recipesModulePath)

  assert.ok(Array.isArray(recipes))
  assert.ok(recipes.length >= 8 && recipes.length <= 10)
  recipes.forEach((recipe) => {
    assert.equal(typeof recipe.baseWeightKg, 'number')
    assert.equal(typeof recipe.baseServingTotalGram, 'number')
    assert.match(recipe.imageUrl, /^\/assets\/recipes\/.+\.jpg$/)
    assert.ok(fs.existsSync(path.join(__dirname, '..', recipe.imageUrl)), `${recipe.imageUrl} 不存在`)
    assert.ok(Array.isArray(recipe.ingredients))
    assert.ok(recipe.ingredients.length > 0)
  })
})

test('app.js 不在冷启动路径加载食谱数据文件', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')

  assert.doesNotMatch(appSource, /require\(['"].*\.json['"]\)/)
  assert.doesNotMatch(appSource, /data\/recipes|globalData\.recipes|\brecipes\s*,/)
  const recipeService = require('../services/bundledRecipeService')
  assert.ok(recipeService.findRecipeById('chicken-pumpkin'))
})

test('应用启动只完成认证快照，不在首屏路由期间启动远端后台任务', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
  let definition
  const context = {
    App(app) { definition = app },
    require(request) {
      if (request === './services/authService') {
        return {
          async initAuth() {
            return { authState: 'has-profile', user: { id: 'user-1' }, dogs: [{ id: 'dog-1' }] }
          }
        }
      }
      if (request === './config/env') return { useCloudBase: false }
      throw new Error(`测试未提供依赖：${request}`)
    },
    Date,
    Promise,
    Number,
    String,
    console
  }
  vm.runInNewContext(source, context, { filename: 'app.js' })

  const instance = {
    globalData: { ...definition.globalData }
  }
  const auth = await definition.initApp.call(instance)

  assert.equal(auth.authState, 'has-profile')
  assert.equal(instance.globalData.recordTimelineState, undefined)
  assert.equal(instance.globalData.recordTimelinePrefetch, undefined)
})

test('新用户冷启动直接进入 Onboarding，已有用户不被重定向', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
  let definition
  const navigations = []
  const context = {
    App(app) { definition = app },
    require(request) {
      if (request === './services/authService') {
        return {
          async initAuth() {
            return { authState: 'guest', user: null, dogs: [] }
          }
        }
      }
      if (request === './config/env') return { useCloudBase: false }
      throw new Error(`测试未提供依赖：${request}`)
    },
    wx: {
      redirectTo(options) { navigations.push(options.url) }
    },
    Date,
    Promise,
    Number,
    String,
    Boolean,
    console
  }
  vm.runInNewContext(source, context, { filename: 'app.js' })

  const instance = { ...definition, globalData: { ...definition.globalData } }
  definition.onLaunch.call(instance)
  await instance.globalData.authReady
  await Promise.resolve()

  assert.deepEqual(navigations, ['/pages/onboarding/index'])
  assert.equal(instance.globalData.startupRouteResolved, true)

  navigations.length = 0
  instance.globalData.startupRouteResolved = false
  instance.routeInitialPage.call(instance, {
    authState: 'has-profile',
    user: { id: 'user-1' },
    dogs: [{ id: 'dog-1' }]
  })
  assert.deepEqual(navigations, [])
})

test('01 Hero 页面让新用户进入建档，并让已有档案用户直接登录', async () => {
  const root = path.join(__dirname, '..')
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const pageRoot = path.join(root, 'pages/onboarding')
  const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const pageJson = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
  const navigations = []
  const tabNavigations = []
  let authState = 'guest'
  let loginCalls = 0
  let finishLogin

  assert.ok(appConfig.pages.includes('pages/onboarding/index'))
  assert.equal(pageJson.navigationStyle, 'custom')
  assert.equal(pageJson.usingComponents['ui-button'], '../../components/ui/ui-button/index')
  assert.match(pageWxml, /<text>先认识它，<\/text>\s*<text>再照顾好每一<\/text>\s*<text>顿。<\/text>/)
  assert.match(pageWxml, /4 步完成 · 约 1 分钟/)
  assert.match(pageWxml, /开始建立档案/)
  assert.match(pageWxml, /已有档案？[\s\S]*直接登录/)
  assert.match(pageWxml, /ariaLabel="已有档案，直接登录"/)
  assert.match(pageWxml, /src="\{\{onboardingHeroImage\}\}"[^>]*mode="aspectFill"/)
  assert.doesNotMatch(pageWxml, /onboarding-hero-art|DOGFOOD \/ 日常照护/)
  assert.match(pageWxml, /onboarding-hero-meta[\s\S]*onboarding-hero-action/)
  assert.match(pageWxss, /\.onboarding-hero-copy\s*\{[^}]*bottom:/)
  assert.match(pageWxss, /\.onboarding-hero-title\s*\{[^}]*max-width:\s*620rpx/)
  assert.doesNotMatch(pageWxss, /\.onboarding-hero-copy\s*\{[^}]*top:\s*47vh/)

  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (request === '../../utils/assets') {
        return { onboardingHeroImage: '/assets/onboarding/dog-profile-hero.webp' }
      }
      if (request === '../../services/authService') {
        return {
          getAuthState: () => authState,
          login: () => {
            loginCalls += 1
            return new Promise((resolve) => {
              finishLogin = (result) => {
                if (result) authState = 'has-profile'
                resolve(result)
              }
            })
          }
        }
      }
      throw new Error(`测试未提供依赖：${request}`)
    },
    wx: {
      navigateTo(options) { navigations.push(options.url) },
      switchTab(options) { tabNavigations.push(options.url) }
    }
  }
  vm.runInNewContext(pageJs, context, { filename: 'pages/onboarding/index.js' })
  definition.onStart()

  assert.deepEqual(navigations, ['/subpackages/dog-profile/dog-quick-create/index'])

  const page = {
    ...definition,
    data: { ...definition.data },
    setData(patch) { Object.assign(this.data, patch) }
  }
  const login = definition.onDirectLogin.call(page)
  const repeatedLogin = definition.onDirectLogin.call(page)
  assert.equal(loginCalls, 1)
  assert.equal(page.data.loginLoading, true)

  finishLogin(true)
  await Promise.all([login, repeatedLogin])
  assert.deepEqual(tabNavigations, ['/pages/home/index'])
  assert.equal(page.data.loginLoading, false)
})

test('app.json 启用组件按需注入', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'))

  assert.equal(appConfig.lazyCodeLoading, 'requiredComponents')
})

test('开发者工具按根目录配置构建 TDesign npm 包', () => {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'project.config.json'), 'utf8'))

  assert.equal(projectConfig.setting.packNpmManually, true)
  assert.deepEqual(projectConfig.setting.packNpmRelationList, [
    {
      packageJsonPath: './package.json',
      miniprogramNpmDistDir: './'
    }
  ])
})

test('首页运行时依赖的合同目录不会被开发者工具排除', () => {
  const projectRoot = path.join(__dirname, '..')
  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8'))
  const ignoredContractsFolder = (projectConfig.packOptions.ignore || []).some((item) => (
    item.type === 'folder' && item.value === 'contracts'
  ))

  assert.equal(ignoredContractsFolder, false)
  assert.ok(fs.existsSync(path.join(projectRoot, 'contracts/care/careRecordContract.js')))
})

test('小程序图片兜底资源存在', () => {
  const expected = [
    'assets/recipes/chicken-pumpkin.jpg',
    'assets/recipes/fish-rice.jpg',
    'assets/recipes/beef-broccoli.jpg',
    'assets/recipes/dog-food-bowl.jpg',
    'assets/dogs/dog-head-profile.svg',
    'assets/onboarding/dog-profile-hero.webp'
  ]

  expected.forEach((assetPath) => {
    const fullPath = path.join(__dirname, '..', assetPath)
    assert.ok(fs.existsSync(fullPath), `${assetPath} 不存在`)
    assert.ok(fs.statSync(fullPath).size > 0, `${assetPath} 是空文件`)
  })
})

test('小程序图片资源合计不超过 200K', () => {
  const roots = ['assets']
  const imageFiles = []

  function collectImages(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        collectImages(entryPath)
        return
      }
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name)) {
        imageFiles.push(entryPath)
      }
    })
  }

  roots.forEach((root) => collectImages(path.join(__dirname, '..', root)))
  const totalSize = imageFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
  assert.ok(totalSize <= 200 * 1024, `图片资源合计 ${(totalSize / 1024).toFixed(1)}K，超过 200K`)
})

test('分包服务文件显式进入开发者工具打包清单', () => {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'project.config.json'), 'utf8'))
  const includes = new Set((projectConfig.packOptions && projectConfig.packOptions.include || []).map((item) => item.value))
  const requiredServiceFiles = [
    'subpackages/custom-recipe/services/customRecipeService.js',
    'subpackages/custom-recipe/services/ingredientService.js',
    'subpackages/custom-recipe/services/ingredientAdvice.js',
    'subpackages/custom-recipe/services/recipeAdviceService.js',
    'subpackages/custom-recipe/services/nutritionAssessmentService.js',
    'subpackages/custom-recipe/services/nutritionDataService.js',
    'subpackages/custom-recipe/services/nutrientIngredientService.js',
    'subpackages/custom-recipe/services/energyRequirementService.js',
    'subpackages/custom-recipe/services/mealEnergyService.js',
    'subpackages/custom-recipe/services/mealAssessmentService.js',
    'subpackages/custom-recipe/services/runtimeDataReleaseService.js',
    'subpackages/custom-recipe/services/ingredientOperationRules.js',
    'subpackages/custom-recipe/services/sharedMealContract.js',
    'subpackages/custom-recipe/services/sharedMealDraftService.js',
    'subpackages/custom-recipe/services/draftAdapters.js',
    'subpackages/shared-meal/services/humanRecipeService.js',
    'subpackages/shared-meal/services/energyRequirementService.js',
    'subpackages/shared-meal/services/mealEnergyService.js',
    'subpackages/shared-meal/services/nutritionAssessmentService.js',
    'subpackages/shared-meal/services/mealAssessmentService.js',
    'subpackages/shared-meal/services/nutritionDataService.js',
    'subpackages/shared-meal/services/runtimeDataReleaseService.js',
    'subpackages/shared-meal/services/ingredientOperationRules.js',
    'subpackages/shared-meal/services/sharedMealContract.js',
    'subpackages/shared-meal/services/sharedMealDraftService.js',
    'subpackages/shared-meal/services/sharedMealDogEligibility.js',
    'subpackages/shared-meal/utils/ingredientMeasurementBasis.js',
    'subpackages/dog-profile/services/fileService.js',
    'subpackages/plan-extra/services/customRecipeService.js',
    'subpackages/plan-extra/services/planCalculatorService.js'
  ]

  requiredServiceFiles.forEach((servicePath) => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', servicePath)), `${servicePath} 不存在`)
    assert.ok(includes.has(servicePath), `${servicePath} 未加入 packOptions.include`)
  })
  assert.ok(
    (projectConfig.packOptions.ignore || []).some((item) => (
      item.type === 'folder' && item.value === 'shared-src'
    )),
    '共享源码目录必须排除出小程序代码包'
  )
})

test('自定义食谱分包建议服务不依赖主包专用算法文件', () => {
  const servicePath = path.join(__dirname, '..', 'subpackages/custom-recipe/services/recipeAdviceService.js')
  const serviceSource = fs.readFileSync(servicePath, 'utf8')

  assert.doesNotMatch(serviceSource, /\.\.\/\.\.\/\.\.\/utils\/ingredientAdvice/)
  assert.match(serviceSource, /require\(['"]\.\/ingredientAdvice['"]\)/)
})

test('狗狗档案卡片整卡可点击且不显示修改按钮', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'components/dog-card/index.wxml'), 'utf8')

  assert.match(wxml, /<view class="dog-card" bindtap="onEdit">/)
  assert.doesNotMatch(wxml, /<button/)
  assert.doesNotMatch(wxml, />修改</)
})

test('食谱 Tab 呈现我的食谱数据态、空态和新建弹层入口', () => {
  const pageRoot = path.join(__dirname, '..', 'pages', 'recipes', 'list')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
  const popupWxss = fs.readFileSync(path.join(__dirname, '..', 'components', 'vendor', 'recipe-create-popup', 'index.wxss'), 'utf8')

  assert.equal(config.navigationBarTitleText, '我的食谱')
  assert.match(wxml, /记录常做的搭配，随时调整食材和份量/)
  assert.match(wxml, /wx:if="{{recipes\.length}}"/)
  assert.match(wxml, /recipe-library-card/)
  assert.match(wxml, /recipe-empty/)
  assert.match(wxml, /recipe-fab/)
  assert.match(wxml, /recipe-create-popup/)
  assert.match(js, /onCreateConfirm/)
  assert.match(js, /customRecipeService\.createDraft/)
  assert.doesNotMatch(js, /require\(['"].*subpackages\//)
  assert.doesNotMatch(wxml, /筛选方式|自定义筛选|搜索食材或食谱名称/)
  assert.equal(config.usingComponents['recipe-create-popup'], '../../../components/vendor/recipe-create-popup/index')
  assert.doesNotMatch(popupWxss, /env\(safe-area-inset-bottom\)/)
})

test('食谱设计页通过独立页面添加食材，并保留卡片食材列表和本餐评估', () => {
  const pageRoot = path.join(__dirname, '..', 'subpackages', 'custom-recipe', 'edit')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const ingredientListWxml = fs.readFileSync(path.join(__dirname, '..', 'components/vendor/recipe-ingredient-list/index.wxml'), 'utf8')
  const ingredientListWxss = fs.readFileSync(path.join(__dirname, '..', 'components/vendor/recipe-ingredient-list/index.wxss'), 'utf8')
  const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))

  assert.equal(config.navigationBarTitleText, '食谱设计')
  assert.match(wxml, /wx:if="{{!ingredients\.length}}"/)
  assert.match(wxml, /还没有添加食材/)
  assert.match(wxml, /搜索食材并填写克重后，本餐评估会自动更新/)
  assert.match(wxml, /新增食材/)
  assert.match(wxml, /nutrition-assessment/)
  assert.doesNotMatch(wxml, /营养汇总（占位）/)
  assert.match(js, /onAddIngredient/)
  assert.match(js, /wx\.navigateTo/)
  assert.match(js, /\/subpackages\/custom-recipe\/ingredient-search\/index/)
  assert.match(js, /ingredientWorkbench\.updateIngredientAmount/)
  assert.match(js, /nutritionDataService\.loadMealAssessmentData/)
  assert.match(js, /mealAssessmentService\.buildMealAssessment/)
  assert.match(js, /onNutritionProfileChange/)
  assert.match(wxml, /recipe-ingredient-list/)
  assert.doesNotMatch(wxml, /recipe-ingredient-search/)
  assert.doesNotMatch(wxml, /recipe-ingredient-popup/)
  assert.match(wxml, /action-icon="\/assets\/icons\/recipe-delete-1-filled\.svg"/)
  assert.doesNotMatch(wxml, /搜索结果|常用与最近|没有找到/)
  assert.match(wxml, /wx:else/)
  assert.match(wxml, /<scroll-view class="recipe-design-ingredient-scroll" scroll-y enable-flex>/)
  assert.match(wxml, /recipe-design-summary-floating/)
  assert.match(wxml, /bottom-action recipe-design-save-action/)
  assert.match(wxml, /保存食谱/)
  assert.doesNotMatch(wxml, /食谱名称|dog-target-selector|检查并生成建议|保存草稿/)
  assert.match(ingredientListWxml, /item\.ratioPercent/)
  assert.match(ingredientListWxml, /t-class="recipe-ingredient-list__group"/)
  assert.match(ingredientListWxml, /t-class="recipe-ingredient-list__input"/)
  assert.match(ingredientListWxml, /recipe-ingredient-list__action-icon/)
  assert.match(ingredientListWxml, /<image class="recipe-ingredient-list__action-icon"/)
  assert.doesNotMatch(ingredientListWxml, /<t-icon/)
  assert.match(wxml, /action-icon="\/assets\/icons\/recipe-delete-1-filled\.svg"/)
  for (const assetPath of ['assets/icons/recipe-cart-filled.svg', 'assets/icons/recipe-delete-1-filled.svg']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', assetPath)), `${assetPath} 不存在`)
  }
  assert.match(ingredientListWxml, /align="right"/)
  assert.match(ingredientListWxml, /borderless/)
  assert.match(ingredientListWxss, /--td-cell-vertical-padding: 16rpx/)
  assert.match(ingredientListWxss, /margin: 0;/)
  assert.equal(config.usingComponents['recipe-empty'], '../../../components/vendor/recipe-empty/index')
  assert.equal(config.usingComponents['nutrition-assessment'], '../../../components/nutrition-assessment/index')
})

test('搜索食材是独立页面，默认、结果和无结果状态互斥', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'))
  const customRecipePackage = appConfig.subpackages.find((item) => item.root === 'subpackages/custom-recipe')
  const pageRoot = path.join(__dirname, '..', 'subpackages', 'custom-recipe', 'ingredient-search')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
  const searchRoot = path.join(__dirname, '..', 'components/vendor/recipe-ingredient-search')
  const searchJs = fs.readFileSync(path.join(searchRoot, 'index.js'), 'utf8')
  const searchWxml = fs.readFileSync(path.join(searchRoot, 'index.wxml'), 'utf8')
  const tagWxss = fs.readFileSync(path.join(__dirname, '..', 'components/ui/ui-tag/index.wxss'), 'utf8')

  assert.ok(customRecipePackage.pages.includes('ingredient-search/index'))
  assert.equal(config.navigationBarTitleText, '搜索食材')
  assert.match(searchJs, /placeholder: \{ type: String, value: '搜索食材，如“鸡胸肉”' \}/)
  assert.match(searchWxml, /placeholder="{{placeholder}}"/)
  assert.match(searchWxml, /action="{{actionText}}"/)
  assert.match(searchWxml, /bind:action-click="onActionClick"/)
  assert.match(wxml, /wx:if="{{!hasSearchQuery}}"/)
  assert.match(wxml, /常用与最近/)
  assert.match(wxml, /食材列表/)
  assert.match(wxml, /items="{{catalogIngredients}}"/)
  assert.match(wxml, /<ui-tag variant="good" size="large">/)
  assert.match(wxml, /wx:elif="{{searchResults\.length}}"/)
  assert.match(wxml, /搜索结果/)
  assert.match(wxml, /wx:else/)
  assert.match(wxml, /没有找到“{{searchValue}}”/)
  assert.match(wxml, /试试更短的关键词，或检查名称是否正确/)
  assert.match(wxml, /recipe-ingredient-list/)
  assert.match(wxml, /recipe-ingredient-popup/)
  assert.match(wxml, /action-icon="\/assets\/icons\/recipe-cart-filled\.svg"/)
  assert.match(js, /ingredientService\.loadIngredientPage/)
  assert.match(js, /onReachBottom\(\)/)
  assert.match(js, /INGREDIENT_PAGE_SIZE = 20/)
  assert.match(js, /ingredientWorkbench\.addIngredient/)
  assert.match(js, /draftAdapters\.saveIngredients/)
  assert.match(js, /require\(['"]\.\.\/services\/draftAdapters['"]\)/)
  assert.doesNotMatch(js, /require\(['"]\.\.\/\.\.\/\.\.\/services\/draftAdapters/)
  assert.match(js, /getOpenerEventChannel/)
  assert.match(js, /wx\.navigateBack/)
  assert.match(wxss, /padding: 36rpx 32rpx 48rpx/)
  assert.match(wxss, /\.ingredient-search-quick-option\s*{[^}]*flex: 0 0 auto;/s)
  assert.match(tagWxss, /\.ui-tag--large\s*{[^}]*white-space: nowrap;/s)
  assert.equal(config.usingComponents['recipe-ingredient-search'], '../../../components/vendor/recipe-ingredient-search/index')
  assert.equal(config.usingComponents['recipe-ingredient-list'], '../../../components/vendor/recipe-ingredient-list/index')
  assert.equal(config.usingComponents['recipe-ingredient-popup'], '../../../components/vendor/recipe-ingredient-popup/index')
})

test('只被自定义食谱使用的食材搜索服务不进入主包', () => {
  const root = path.join(__dirname, '..')
  const mainPackageService = path.join(root, 'services', 'ingredientService.js')
  const subpackageService = path.join(
    root,
    'subpackages',
    'custom-recipe',
    'services',
    'ingredientService.js'
  )
  const searchPage = fs.readFileSync(
    path.join(root, 'subpackages', 'custom-recipe', 'ingredient-search', 'index.js'),
    'utf8'
  )

  assert.equal(fs.existsSync(mainPackageService), false)
  assert.equal(fs.existsSync(subpackageService), true)
  assert.match(searchPage, /require\(['"]\.\.\/services\/ingredientService['"]\)/)
})

test('营养食材模式复用搜索页且不改变普通搜索默认态', () => {
  const pageRoot = path.join(__dirname, '..', 'subpackages', 'custom-recipe', 'ingredient-search')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const editJs = fs.readFileSync(
    path.join(__dirname, '..', 'subpackages', 'custom-recipe', 'edit', 'index.js'),
    'utf8'
  )

  assert.match(js, /options\.mode === 'nutrient'/)
  assert.match(js, /decodeURIComponent/)
  assert.match(js, /nutrientIngredientService/)
  assert.match(wxml, /wx:if="{{isNutrientMode}}"/)
  assert.match(wxml, /{{nutrientGapText}}/)
  assert.match(wxml, /按{{nutrientName}}含量排序/)
  assert.match(wxml, /wx:if="{{!isNutrientMode}}"/)
  assert.match(wxml, /常用与最近/)
  assert.doesNotMatch(wxml, /食材分类/)
  assert.match(wxss, /\.ingredient-search-gap-summary/)
  assert.match(editJs, /mode=nutrient/)
  assert.match(editJs, /gapDisplayValue/)
})

test('营养评估组件提供双标准、档案切换、建议入口和进阶表格', () => {
  const root = path.join(__dirname, '..', 'components', 'nutrition-assessment')
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  const service = fs.readFileSync(path.join(
    __dirname,
    '..',
    'subpackages/custom-recipe/services/nutritionAssessmentService.js'
  ), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))

  assert.match(wxml, /国标评估/)
  assert.match(wxml, /FEDIAF 评估/)
  assert.match(wxml, /需要补充/)
  assert.ok(
    wxml.indexOf('wx:for="{{item.highItems}}"') < wxml.indexOf('wx:for="{{item.lowItems}}"'),
    '需要控制的红色元素应排在需要补充的黄色元素之前'
  )
  assert.match(wxml, /bind:tap="onLowAction"/)
  assert.match(service, /挑选富含\$\{item\.name\}的食物/)
  assert.match(wxml, /主要来源/)
  assert.match(wxml, /全部元素对照/)
  assert.match(wxml, /profileSelectorVisible/)
  assert.match(wxss, /border-left: 6rpx solid var\(--df-color-status-low\)/)
  assert.equal(config.usingComponents['ui-button'], '../ui/ui-button/index')
  assert.ok(Object.values(config.usingComponents).every((value) => !value.includes('tdesign-miniprogram')))
})

test('营养评估通过顶部点击和顶部下滑收起，详情不显示收起按钮', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'nutrition-assessment', 'index.wxml'),
    'utf8'
  )

  assert.match(wxml, /class="nutrition-assessment__expanded-backdrop"[^>]*catchtap="onToggle"/)
  assert.match(wxml, /bindscroll="onExpandedScroll"/)
  assert.doesNotMatch(wxml, /nutrition-assessment__collapse/)
  assert.doesNotMatch(wxml, /&gt;/)
})
