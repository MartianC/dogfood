const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const ingredientService = require('../subpackages/custom-recipe/services/ingredientService')

function loadPageDefinition() {
  const file = path.join(root, 'subpackages/custom-recipe/ingredient-search/index.js')
  const previousPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = previousPage
  return definition
}

function createPageInstance(definition) {
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch)
      if (typeof callback === 'function') callback()
    }
  }
  Object.entries(definition).forEach(([key, value]) => {
    if (typeof value === 'function') instance[key] = (...args) => value.apply(instance, args)
  })
  return instance
}

function ingredient(index, prefix = '食材') {
  return {
    id: `${prefix}-${index}`,
    foodId: `${prefix}-${index}`,
    conceptId: `concept-${prefix}-${index}`,
    variantId: `variant-${prefix}-${index}`,
    name: `${prefix}${index}`,
    category: 'other',
    policyStatus: 'allowed'
  }
}

test('食材页首屏读取 20 条，触底后再追加下一页', async () => {
  const originalLoadPage = ingredientService.loadIngredientPage
  const calls = []
  ingredientService.loadIngredientPage = async ({ keyword = '', offset, limit }) => {
    calls.push({ keyword, offset, limit })
    return offset === 0
      ? { items: Array.from({ length: 20 }, (_, index) => ingredient(index)), hasMore: true }
      : { items: Array.from({ length: 5 }, (_, index) => ingredient(index + 20)), hasMore: false }
  }

  try {
    const page = createPageInstance(loadPageDefinition())

    await page.loadCatalogIngredients()
    assert.equal(page.data.catalogIngredients.length, 20)
    await page.onReachBottom()

    assert.equal(page.data.catalogIngredients.length, 25)
    assert.equal(page.data.catalogHasMore, false)
    assert.deepEqual(calls, [
      { keyword: '', offset: 0, limit: 20 },
      { keyword: '', offset: 20, limit: 20 }
    ])
  } finally {
    ingredientService.loadIngredientPage = originalLoadPage
  }
})

test('搜索结果独立分页，不足 20 条时停止且不追加无关项', async () => {
  const originalLoadPage = ingredientService.loadIngredientPage
  const calls = []
  ingredientService.loadIngredientPage = async ({ keyword = '', offset, limit }) => {
    calls.push({ keyword, offset, limit })
    if (keyword === '南瓜') {
      return {
        items: [ingredient(1, '南瓜'), ingredient(2, '南瓜')],
        hasMore: false
      }
    }
    return offset === 0
      ? { items: Array.from({ length: 20 }, (_, index) => ingredient(index, '鸡肉')), hasMore: true }
      : { items: Array.from({ length: 3 }, (_, index) => ingredient(index + 20, '鸡肉')), hasMore: false }
  }

  try {
    const page = createPageInstance(loadPageDefinition())

    await page.onSearchChange({ detail: { value: '鸡肉' } })
    await page.onReachBottom()
    assert.equal(page.data.searchResults.length, 23)
    assert.ok(page.data.searchResults.every((item) => item.name.includes('鸡肉')))

    await page.onSearchChange({ detail: { value: '南瓜' } })
    await page.onReachBottom()
    assert.deepEqual(page.data.searchResults.map((item) => item.name), ['南瓜1', '南瓜2'])
    assert.deepEqual(calls, [
      { keyword: '鸡肉', offset: 0, limit: 20 },
      { keyword: '鸡肉', offset: 20, limit: 20 },
      { keyword: '南瓜', offset: 0, limit: 20 }
    ])
  } finally {
    ingredientService.loadIngredientPage = originalLoadPage
  }
})
