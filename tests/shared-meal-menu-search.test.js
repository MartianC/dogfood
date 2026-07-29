const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cloudbase = require('../services/adapters/cloudbase')
const mock = require('../services/adapters/mock')
const humanRecipeService = require('../subpackages/shared-meal/services/humanRecipeService')
const {
  selectMenuRecipe
} = require('../subpackages/shared-meal/services/menuSearchSessionService')

function loadPageModule(relativePath) {
  const file = path.join(root, relativePath)
  const previousPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(file)]
  const moduleExports = require(file)
  global.Page = previousPage
  return { definition, moduleExports }
}

function createPageInstance(definition) {
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      Object.entries(patch).forEach(([key, value]) => {
        this.data[key] = value
      })
    }
  }
  Object.entries(definition).forEach(([key, value]) => {
    if (typeof value === 'function') {
      instance[key] = (...args) => value.apply(instance, args)
    }
  })
  return instance
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function assertNoOrphanConditionalBranches(template) {
  const frames = [{ lastConditional: null }]
  const tagPattern = /<(\/?)([a-z][\w-]*)([^>]*?)(\/?)>/gi

  for (const match of template.matchAll(tagPattern)) {
    const [, closing, tagName, attributes, selfClosing] = match
    if (closing) {
      frames.pop()
      continue
    }

    const parent = frames[frames.length - 1]
    const branch = /\bwx:if\b/.test(attributes)
      ? 'if'
      : /\bwx:elif\b/.test(attributes)
        ? 'elif'
        : /\bwx:else\b/.test(attributes)
          ? 'else'
          : ''

    if (
      (branch === 'elif' || branch === 'else')
      && (!parent.lastConditional || parent.lastConditional.tagName !== tagName)
    ) {
      throw new Error(`${tagName} 的 wx:${branch} 前没有同级同标签的 wx:if`)
    }

    parent.lastConditional = branch === 'if' || branch === 'elif'
      ? { tagName }
      : null

    if (!selfClosing) {
      frames.push({ lastConditional: null })
    }
  }
}

test('CloudBase adapter 的搜索和详情最终调用对应云函数', async () => {
  const originalWx = global.wx
  const calls = []
  global.wx = {
    cloud: {
      async callFunction(payload) {
        calls.push(payload)
        return { result: { ok: true } }
      }
    }
  }
  try {
    await cloudbase.searchHumanRecipes({ query: '番茄', limit: 8, cursor: 'cursor' })
    await cloudbase.getHumanRecipe('recipe-1')
    assert.deepEqual(calls, [
      {
        name: 'searchHumanRecipes',
        data: { query: '番茄', limit: 8, cursor: 'cursor' }
      },
      {
        name: 'getHumanRecipe',
        data: { recipeId: 'recipe-1' }
      }
    ])
  } finally {
    global.wx = originalWx
  }
})

test('humanRecipeService 对四态和未映射项生成一致的可选展示模型', async () => {
  humanRecipeService.__setAdapterForTest({
    async getHumanRecipe() {
      return {
        contract: 'getHumanRecipe/v1',
        recipeVersion: 'recipe-v2',
        recipe: {
          id: 'recipe-1',
          title: '番茄洋葱汤',
          ingredients: [
            ...['allowed', 'conditional', 'unknown', 'blocked'].map((status, index) => ({
              position: index,
              raw_name: `原料${index}`,
              mapping_status: 'matched',
              components: [{
                concept_id: `concept-${index}`,
                variant_id: `variant-${index}`,
                food_id: `food-${index}`,
                display_name_zh: `目录原料${index}`,
                policy_status: status,
                blockedReason: status === 'blocked' ? '犬只不可食用。' : null
              }]
            })),
            {
              position: 4,
              raw_name: '一撮盐',
              mapping_status: 'unmatched'
            }
          ]
        }
      }
    }
  })

  const recipe = await humanRecipeService.getHumanRecipe('recipe-1')

  assert.deepEqual(
    recipe.ingredients.slice(0, 4).map((item) => item.components[0].canSelect),
    [true, true, true, false]
  )
  assert.equal(recipe.ingredients[3].components[0].blockedReason, '犬只不可食用。')
  assert.deepEqual(recipe.ingredients[4], {
    position: 4,
    sourceText: '一撮盐',
    amountText: '',
    mappingStatus: 'unmatched',
    components: []
  })
})

test('Mock adapter 提供与云端一致的搜索和详情契约', async () => {
  const search = await mock.searchHumanRecipes({ query: '番茄', limit: 1 })
  assert.equal(search.contract, 'searchHumanRecipes/v1')
  assert.equal(search.items.length, 1)
  const detail = await mock.getHumanRecipe(search.items[0].id)
  assert.equal(detail.contract, 'getHumanRecipe/v1')
  assert.ok(detail.recipe.ingredients.length > 0)
})

test('菜单页只走受控服务查询已发布菜谱并展示全部来源原料', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const sharedMealPackage = appConfig.subpackages.find(
    (item) => item.root === 'subpackages/shared-meal'
  )
  assert.ok(sharedMealPackage.pages.includes('menu-search/index'))

  const pageRoot = path.join(root, 'subpackages/shared-meal/menu-search')
  const source = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const serviceSource = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/services/humanRecipeService.js'),
    'utf8'
  )
  const clientSources = [source, serviceSource].join('\n')

  assert.match(source, /humanRecipeService\.searchHumanRecipes/)
  assert.match(source, /humanRecipeService\.getHumanRecipe/)
  assert.doesNotMatch(clientSources, /wx\.cloud\.database|collection\(['"]human_recipes|canine_ingredient_policies/)
  assert.match(template, /wx:for="{{selectedRecipe\.ingredients}}"/)
  assert.match(template, /item\.sourceText/)
  assert.match(template, /component\.blockedReason/)
  assert.match(template, /component\.canSelect/)
  assert.doesNotMatch([source, template].join('\n'), /自定义菜名|自定义原料|狗狗需求推荐|为狗推荐/)
  assert.doesNotMatch(template, /<button\b/)
})

test('菜单页条件分支保持编译器可识别的连续 wx:if 链', () => {
  const template = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/menu-search/index.wxml'),
    'utf8'
  )

  assert.throws(
    () => assertNoOrphanConditionalBranches('<view><block wx:else></block></view>'),
    /wx:else 前没有/
  )
  assert.doesNotThrow(() => assertNoOrphanConditionalBranches(template))
})

test('两个菜单页面按四态分别使用搜索展示、自动来源加入和用户添加规则', () => {
  const canonical = loadPageModule('subpackages/shared-meal/menu-search/index.js')
  const legacy = loadPageModule('subpackages/shared-meal/dog-select/menu-search/index.js')
  const expected = {
    allowed: true,
    conditional: true,
    unknown: true,
    blocked: false
  }

  Object.entries(expected).forEach(([policyStatus, allowed]) => {
    const recipe = {
      id: `recipe-${policyStatus}`,
      ingredients: [{
        position: 0,
        components: [{ policyStatus, selected: false }]
      }]
    }
    const searchComponent = canonical.moduleExports
      .prepareRecipeForSearchDisplay(recipe)
      .ingredients[0].components[0]
    const sourceComponent = legacy.moduleExports
      .prepareRecipeForSourceSelection(recipe)
      .ingredients[0].components[0]

    assert.equal(searchComponent.canSelect, allowed, `${policyStatus} 搜索展示资格`)
    assert.equal(sourceComponent.canSelect, allowed, `${policyStatus} 来源展示资格`)
    assert.equal(sourceComponent.selected, allowed, `${policyStatus} 自动来源加入资格`)

    let canonicalPatch = null
    canonical.definition.onToggleComponent.call({
      data: { selectedRecipe: recipe },
      setData(patch) { canonicalPatch = patch }
    }, { currentTarget: { dataset: { ingredientIndex: 0, componentIndex: 0 } } })
    assert.equal(Boolean(canonicalPatch), allowed, `${policyStatus} 用户添加资格`)

    let sourcePatch = null
    legacy.definition.onToggleComponent.call({
      data: { selectedRecipe: recipe, selectedCount: 0 },
      setData(patch) { sourcePatch = patch }
    }, { currentTarget: { dataset: { ingredientIndex: 0, componentIndex: 0 } } })
    assert.equal(Boolean(sourcePatch), allowed, `${policyStatus} 来源页用户添加资格`)
  })
})

test('菜单页面不直接比较 blocked 且保留三个具名业务规则', () => {
  const sources = [
    fs.readFileSync(path.join(root, 'subpackages/shared-meal/menu-search/index.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'subpackages/shared-meal/dog-select/menu-search/index.js'), 'utf8')
  ]
  const combined = sources.join('\n')

  assert.match(combined, /canSearchIngredient\(component\)/)
  assert.match(combined, /canAutoIncludeIngredient\(component\)/)
  assert.match(combined, /canAddIngredient\(component\)/)
  assert.doesNotMatch(
    combined,
    /component\.policyStatus\s*(?:===|!==)\s*['"]blocked['"]/
  )
})

test('菜单页消费 nextCursor 合并两页并在空游标时停止请求', async () => {
  const calls = []
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes(options) {
      calls.push(options)
      if (!options.cursor) {
        return {
          items: [
            { id: 'recipe-1', title: '清蒸鲈鱼' },
            { id: 'recipe-2', title: '番茄炒蛋' }
          ],
          nextCursor: 'cursor-2'
        }
      }
      return {
        items: [
          { id: 'recipe-2', title: '重复的番茄炒蛋' },
          { id: 'recipe-3', title: '蒜蓉西兰花' }
        ],
        nextCursor: null
      }
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)

    await page.onLoad()
    await page.onReachBottom()
    await page.onReachBottom()

    assert.deepEqual(calls, [
      { query: '', limit: 20, cursor: null },
      { query: '', limit: 20, cursor: 'cursor-2' }
    ])
    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), [
      'recipe-1',
      'recipe-2',
      'recipe-3'
    ])
    assert.equal(page.data.nextCursor, null)
    assert.equal(page.data.loading, false)
    assert.equal(page.data.loadingMore, false)
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('菜单页合并同关键词进行中的重复首屏请求', async () => {
  const firstPage = createDeferred()
  const calls = []
  humanRecipeService.__setAdapterForTest({
    searchHumanRecipes(options) {
      calls.push(options)
      return firstPage.promise
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)

    const firstRequest = page.searchRecipes('番茄')
    const duplicateRequest = page.searchRecipes('番茄')

    assert.equal(calls.length, 1)
    firstPage.resolve({
      items: [{ id: 'recipe-1', title: '番茄炒蛋' }],
      nextCursor: null
    })
    await Promise.all([firstRequest, duplicateRequest])

    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), ['recipe-1'])
    assert.equal(page.data.loading, false)
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('菜单页合并进行中的重复翻页请求', async () => {
  const nextPage = createDeferred()
  const calls = []
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes(options) {
      calls.push(options)
      if (!options.cursor) {
        return {
          items: [{ id: 'recipe-1', title: '清蒸鲈鱼' }],
          nextCursor: 'cursor-2'
        }
      }
      return nextPage.promise
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad()

    const firstRequest = page.onReachBottom()
    const duplicateRequest = page.onReachBottom()

    assert.equal(calls.length, 2)
    nextPage.resolve({
      items: [{ id: 'recipe-2', title: '番茄炒蛋' }],
      nextCursor: null
    })
    await Promise.all([firstRequest, duplicateRequest])

    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), [
      'recipe-1',
      'recipe-2'
    ])
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('菜单页忽略旧关键词和旧分页的迟到响应', async () => {
  const oldFirstPage = createDeferred()
  const oldNextPage = createDeferred()
  humanRecipeService.__setAdapterForTest({
    searchHumanRecipes(options) {
      if (options.query === '旧关键词' && !options.cursor) return oldFirstPage.promise
      if (options.query === '已有结果' && options.cursor) return oldNextPage.promise
      if (options.query === '已有结果') {
        return Promise.resolve({
          items: [{ id: 'recipe-old', title: '旧页菜谱' }],
          nextCursor: 'old-cursor'
        })
      }
      return Promise.resolve({
        items: [{ id: 'recipe-new', title: '新页菜谱' }],
        nextCursor: null
      })
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)

    const staleFirstRequest = page.searchRecipes('旧关键词')
    await page.searchRecipes('新关键词')
    oldFirstPage.resolve({
      items: [{ id: 'recipe-stale', title: '迟到首屏' }],
      nextCursor: null
    })
    await staleFirstRequest
    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), ['recipe-new'])

    await page.searchRecipes('已有结果')
    const staleNextRequest = page.onReachBottom()
    await page.searchRecipes('最终关键词')
    oldNextPage.resolve({
      items: [{ id: 'recipe-stale-next', title: '迟到下一页' }],
      nextCursor: null
    })
    await staleNextRequest

    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), ['recipe-new'])
    assert.equal(page.data.searchValue, '')
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('下一页失败保留已有结果和选择，并允许原游标重试', async () => {
  let nextPageAttempts = 0
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes(options) {
      if (!options.cursor) {
        return {
          items: [{ id: 'recipe-1', title: '清蒸鲈鱼' }],
          nextCursor: 'cursor-2'
        }
      }
      nextPageAttempts += 1
      if (nextPageAttempts === 1) throw new Error('临时网络失败')
      return {
        items: [{ id: 'recipe-2', title: '番茄炒蛋' }],
        nextCursor: null
      }
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad()
    page.menuSearchSession = selectMenuRecipe(page.menuSearchSession, 'recipe-1')
    page.data.selectedRecipeIds = page.menuSearchSession.selectedRecipeIds

    await page.onReachBottom()

    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), ['recipe-1'])
    assert.deepEqual(page.data.selectedRecipeIds, ['recipe-1'])
    assert.equal(page.data.nextCursor, 'cursor-2')
    assert.match(page.data.errorText, /更多菜谱加载失败/)
    assert.equal(page.data.loadingMore, false)

    await page.retryLoadMore()

    assert.equal(nextPageAttempts, 2)
    assert.deepEqual(page.data.recipes.map((recipe) => recipe.id), [
      'recipe-1',
      'recipe-2'
    ])
    assert.deepEqual(page.data.selectedRecipeIds, ['recipe-1'])
    assert.equal(page.data.errorText, '')
    assert.equal(page.data.nextCursor, null)
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})
