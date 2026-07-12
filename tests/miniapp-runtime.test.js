const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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

test('app.js 不直接 require JSON 数据文件', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')

  assert.doesNotMatch(appSource, /require\(['"].*\.json['"]\)/)
  assert.match(appSource, /require\(['"]\.\/data\/recipes['"]\)/)
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

test('小程序图片兜底资源存在', () => {
  const expected = [
    'assets/recipes/chicken-pumpkin.jpg',
    'assets/recipes/fish-rice.jpg',
    'assets/recipes/beef-broccoli.jpg',
    'assets/recipes/dog-food-bowl.jpg',
    'assets/dogs/default-dog.jpg',
    'assets/dogs/default-dog-alt.jpg'
  ]

  expected.forEach((assetPath) => {
    const fullPath = path.join(__dirname, '..', assetPath)
    assert.ok(fs.existsSync(fullPath), `${assetPath} 不存在`)
    assert.ok(fs.statSync(fullPath).size > 0, `${assetPath} 是空文件`)
  })
})

test('小程序图片资源不超过 200K', () => {
  const roots = ['assets']
  const imageFiles = []

  function collectImages(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        collectImages(entryPath)
        return
      }
      if (/\.(png|jpe?g|gif|webp)$/i.test(entry.name)) {
        imageFiles.push(entryPath)
      }
    })
  }

  roots.forEach((root) => collectImages(path.join(__dirname, '..', root)))
  imageFiles.forEach((file) => {
    const relativePath = path.relative(path.join(__dirname, '..'), file)
    assert.ok(fs.statSync(file).size <= 200 * 1024, `${relativePath} 超过 200K`)
  })
})

test('分包服务文件显式进入开发者工具打包清单', () => {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'project.config.json'), 'utf8'))
  const includes = new Set((projectConfig.packOptions && projectConfig.packOptions.include || []).map((item) => item.value))
  const requiredServiceFiles = [
    'subpackages/custom-recipe/services/customRecipeService.js',
    'subpackages/custom-recipe/services/ingredientAdvice.js',
    'subpackages/custom-recipe/services/recipeAdviceService.js',
    'subpackages/dog-profile/services/fileService.js',
    'subpackages/plan-extra/services/customRecipeService.js',
    'subpackages/plan-extra/services/planCalculatorService.js'
  ]

  requiredServiceFiles.forEach((servicePath) => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', servicePath)), `${servicePath} 不存在`)
    assert.ok(includes.has(servicePath), `${servicePath} 未加入 packOptions.include`)
  })
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

test('食谱设计页提供搜索入口、卡片食材列表和营养占位', () => {
  const pageRoot = path.join(__dirname, '..', 'subpackages', 'custom-recipe', 'edit')
  const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const ingredientListWxml = fs.readFileSync(path.join(__dirname, '..', 'components/vendor/recipe-ingredient-list/index.wxml'), 'utf8')
  const ingredientListWxss = fs.readFileSync(path.join(__dirname, '..', 'components/vendor/recipe-ingredient-list/index.wxss'), 'utf8')
  const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))

  assert.equal(config.navigationBarTitleText, '食谱设计')
  assert.match(wxml, /wx:elif="{{!ingredients\.length}}"/)
  assert.match(wxml, /还没有添加食材/)
  assert.match(wxml, /搜索食材并填写克重后，营养汇总会自动更新/)
  assert.match(wxml, /新增食材/)
  assert.match(wxml, /营养汇总/)
  assert.match(wxml, /营养汇总（占位）/)
  assert.match(js, /onAddIngredient/)
  assert.match(js, /ingredientService\.searchIngredients/)
  assert.match(js, /ingredientWorkbench\.updateIngredientAmount/)
  assert.match(js, /ingredientWorkbench\.addIngredient/)
  assert.match(wxml, /recipe-ingredient-search/)
  assert.match(wxml, /recipe-ingredient-list/)
  assert.match(wxml, /recipe-ingredient-popup/)
  assert.match(wxml, /action-icon="cart-filled"/)
  assert.match(wxml, /action-icon="delete-1-filled"/)
  assert.match(wxml, /搜索结果/)
  assert.match(wxml, /无结果/)
  assert.match(wxml, /搜索失败/)
  assert.match(wxml, /wx:else/)
  assert.match(wxml, /<scroll-view class="recipe-design-ingredient-scroll" scroll-y enable-flex>/)
  assert.match(wxml, /recipe-design-summary-floating/)
  assert.match(wxml, /bottom-action recipe-design-save-action/)
  assert.match(wxml, /保存食谱/)
  assert.doesNotMatch(wxml, /食谱名称|dog-target-selector|检查并生成建议|保存草稿/)
  assert.match(ingredientListWxml, /item\.ratioPercent/)
  assert.match(ingredientListWxml, /t-class="recipe-ingredient-list__group"/)
  assert.match(ingredientListWxml, /t-class="recipe-ingredient-list__input"/)
  assert.match(ingredientListWxml, /align="right"/)
  assert.match(ingredientListWxml, /borderless/)
  assert.match(ingredientListWxss, /--td-cell-vertical-padding: 16rpx/)
  assert.match(ingredientListWxss, /margin: 0;/)
  assert.equal(config.usingComponents['recipe-empty'], '../../../components/vendor/recipe-empty/index')
})
