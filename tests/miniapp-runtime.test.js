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
