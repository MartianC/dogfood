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
