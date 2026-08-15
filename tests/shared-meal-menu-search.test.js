const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cloudbase = require('../services/adapters/cloudbase')
const mock = require('../services/adapters/mock')
const humanRecipeService = require('../subpackages/shared-meal/services/humanRecipeService')
const storage = require('../utils/storage')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  restoreDraft,
  resetDraft,
  saveDraft,
  saveDogSelectionDraft
} = require('../subpackages/shared-meal/services/sharedMealDraftService')
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

test('菜单页只走受控服务查询已发布菜谱并按安全状态展示原料分组', () => {
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
  assert.match(template, /wx:for="{{recipes}}"/)
  assert.match(template, /item\.allowedIngredientText/)
  assert.match(template, /item\.blockedIngredientText/)
  assert.match(source, /canSearchIngredient\(component\)/)
  assert.doesNotMatch(template, /item\.sourceText|component\.blockedReason|component\.canSelect/)
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

test('canonical 菜单页按四态一致执行搜索展示与自动来源加入规则', () => {
  const canonical = loadPageModule('subpackages/shared-meal/menu-search/index.js')
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
        components: [{
          conceptId: `concept-${policyStatus}`,
          variantId: `variant-${policyStatus}`,
          policyStatus,
          dataVersions: { policyVersion: 'policy-v1' }
        }]
      }]
    }
    const searchComponent = canonical.moduleExports
      .prepareRecipeForSearchDisplay(recipe)
      .ingredients[0].components[0]
    const sourceSelections = canonical.moduleExports
      .collectMenuSourceSelections([recipe])
      .sourceIngredientSelections

    assert.equal(searchComponent.canSelect, allowed, `${policyStatus} 搜索展示资格`)
    assert.equal(sourceSelections.length, allowed ? 1 : 0, `${policyStatus} 自动来源加入资格`)
  })
})

test('菜单链路不直接比较 blocked 且保留三个具名业务规则', () => {
  const sources = [
    fs.readFileSync(path.join(root, 'subpackages/shared-meal/menu-search/index.js'), 'utf8'),
    fs.readFileSync(
      path.join(root, 'subpackages/shared-meal/services/humanRecipeService.js'),
      'utf8'
    )
  ]
  const combined = sources.join('\n')

  assert.match(combined, /canSearchIngredient\(component\)/)
  assert.match(combined, /canAutoIncludeIngredient\(component\)/)
  assert.match(combined, /canAddIngredient\(/)
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

test('菜单卡的选择与展开目标独立，详情按菜谱缓存且多选不收起展开项', async () => {
  const detailDeferred = createDeferred()
  let detailCalls = 0
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes() {
      return {
        items: [
          { id: 'recipe-1', title: '番茄土豆炖牛肉', ingredients: [{ position: 0 }] },
          { id: 'recipe-2', title: '清蒸鲈鱼', ingredients: [{ position: 0 }] }
        ],
        nextCursor: null
      }
    },
    async getHumanRecipe(recipeId) {
      detailCalls += 1
      const recipe = await detailDeferred.promise
      return { recipe: { ...recipe, id: recipeId } }
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad()

    await page.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    assert.deepEqual(page.data.selectedRecipeIds, ['recipe-1'])
    assert.equal(page.data.expandedRecipeId, null)
    assert.equal(detailCalls, 0)

    const firstExpansion = page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    const repeatedExpansion = page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })

    assert.equal(detailCalls, 1)
    detailDeferred.resolve({
      title: '番茄土豆炖牛肉',
      ingredients: [
        {
          position: 0,
          raw_name: '牛肉',
          mapping_status: 'matched',
          components: [{ display_name_zh: '牛肉', policy_status: 'allowed' }]
        },
        {
          position: 1,
          raw_name: '洋葱',
          mapping_status: 'matched',
          components: [{ display_name_zh: '洋葱', policy_status: 'blocked' }]
        },
        {
          position: 2,
          raw_name: '一撮盐',
          mapping_status: 'unmatched',
          components: []
        }
      ]
    })
    await Promise.all([firstExpansion, repeatedExpansion])

    const expandedRecipe = page.data.recipes.find((recipe) => recipe.id === 'recipe-1')
    assert.equal(page.data.expandedRecipeId, 'recipe-1')
    assert.equal(expandedRecipe.isExpanded, true)
    assert.equal(expandedRecipe.allowedIngredientText, '牛肉')
    assert.equal(expandedRecipe.blockedIngredientText, '洋葱')
    assert.doesNotMatch(
      `${expandedRecipe.allowedIngredientText}${expandedRecipe.blockedIngredientText}`,
      /一撮盐/
    )

    await page.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-2' } }
    })
    assert.deepEqual(page.data.selectedRecipeIds, ['recipe-1', 'recipe-2'])
    assert.equal(page.data.expandedRecipeId, 'recipe-1')

    page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    await page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    assert.equal(detailCalls, 1)
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('搜索结果携带原料预览时展开立即显示且不再请求详情', async () => {
  let detailCalls = 0
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes() {
      return {
        items: [{
          id: 'recipe-preview',
          title: '素炒三丝',
          ingredientPreviewVersion: 1,
          ingredients: [
            {
              position: 0,
              raw_name: '胡萝卜',
              mapping_status: 'matched',
              components: [{
                canonical_name_zh: '胡萝卜',
                display_name_zh: '胡萝卜（生）',
                policy_status: 'allowed'
              }]
            },
            {
              position: 1,
              raw_name: '洋葱',
              mapping_status: 'matched',
              components: [{ display_name_zh: '洋葱', policy_status: 'blocked' }]
            }
          ]
        }],
        nextCursor: null
      }
    },
    async getHumanRecipe() {
      detailCalls += 1
      throw new Error('展开不应再请求完整详情')
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad()

    await page.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-preview' } }
    })

    const expandedRecipe = page.data.recipes[0]
    assert.equal(detailCalls, 0)
    assert.equal(expandedRecipe.detailLoading, false)
    assert.equal(expandedRecipe.allowedIngredientText, '胡萝卜')
    assert.equal(expandedRecipe.blockedIngredientText, '洋葱')
  } finally {
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('选择 1 至 3 道菜时摘要同步更新，确认后全部菜单写入草稿并合并跨菜来源', async () => {
  const recipes = ['recipe-1', 'recipe-2', 'recipe-3'].map((id, index) => ({
    id,
    title: `测试菜单${index + 1}`,
    ingredients: [{ position: 0, raw_name: '鸡胸肉' }]
  }))
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes() {
      return { items: recipes, nextCursor: null }
    },
    async getHumanRecipe(recipeId) {
      const recipe = recipes.find((item) => item.id === recipeId)
      return {
        recipeVersion: 'recipe-v1',
        recipe: {
          ...recipe,
          release_id: 'runtime-v1',
          recipe_version: 'recipe-v1',
          mapping_version: 'mapping-v1',
          compatible_catalog_version: 'catalog-v1',
          compatible_policy_version: 'policy-v1',
          base_release_id: 'nutrition-v1',
          ingredients: [{
            position: 0,
            raw_name: '鸡胸肉',
            mapping_status: 'matched',
            components: [{
              concept_id: 'concept-chicken',
              variant_id: 'variant-chicken',
              food_id: 'food-chicken',
              display_name_zh: '鸡胸肉',
              category_code: 'meat',
              policy_status: 'allowed'
            }]
          }]
        }
      }
    }
  })

  const originalWx = global.wx
  let navigatedUrl = ''
  global.wx = {
    navigateTo({ url }) { navigatedUrl = url }
  }
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  saveDogSelectionDraft({ id: 'dog-f1-4', name: '布丁' }, 'draft-f1-4')

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad({ draftId: 'draft-f1-4' })

    for (let index = 0; index < recipes.length; index += 1) {
      page.onToggleRecipeSelection({
        currentTarget: { dataset: { recipeId: recipes[index].id } }
      })
      assert.equal(page.data.selectedRecipes.length, index + 1)
    }

    page.onRemoveSelectedRecipe({ detail: { eventValue: 'recipe-3' } })
    assert.deepEqual(page.data.selectedRecipeIds, ['recipe-1', 'recipe-2'])
    page.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-3' } }
    })

    await page.onConfirm()

    const restored = restoreDraft('draft-f1-4')
    assert.equal(restored.status, 'restored')
    assert.deepEqual(restored.draft.humanMenus.map((item) => item.id), [
      'recipe-1',
      'recipe-2',
      'recipe-3'
    ])
    assert.equal(restored.draft.ingredients.length, 1)
    assert.equal(restored.draft.ingredients[0].sourceRefs.length, 3)
    assert.equal(
      navigatedUrl,
      '/subpackages/shared-meal/compose/index?draftId=draft-f1-4'
    )
  } finally {
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    global.wx = originalWx
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('菜单页使用紧凑卡片、独立选择与展开操作，并只在 vendor 适配层使用 TDesign', () => {
  const pageRoot = path.join(root, 'subpackages/shared-meal/menu-search')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
  const vendorRoot = path.join(root, 'components/vendor/recipe-menu-indicator')
  const vendorTemplate = fs.readFileSync(path.join(vendorRoot, 'index.wxml'), 'utf8')
  const vendorConfig = JSON.parse(fs.readFileSync(path.join(vendorRoot, 'index.json'), 'utf8'))
  const pageStyles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

  assert.match(template, /<ui-card\b/)
  assert.match(template, /catchtap="onToggleRecipeSelection"/)
  assert.match(template, /catchtap="onToggleRecipeExpansion"/)
  assert.doesNotMatch(template, /bindtap="onSelectRecipe"|onToggleComponent/)
  assert.doesNotMatch(template, /<t-[a-z-]+/)
  assert.equal(
    config.usingComponents['recipe-menu-indicator'],
    '../../../components/vendor/recipe-menu-indicator/index'
  )
  assert.equal(config.usingComponents['ui-card'], '../../../components/ui/ui-card/index')
  assert.match(template, /<ui-card padding="none">\s*<view class="shared-meal-menu-result-list">/s)
  assert.match(pageStyles, /\.shared-meal-menu-result-list\s*{[^}]*overflow:\s*hidden;[^}]*border-radius:\s*var\(--df-radius-lg\)/s)
  assert.match(pageStyles, /\.shared-meal-menu-result__detail\s*{[^}]*background:\s*var\(--df-color-surface-muted\)/s)
  assert.match(pageStyles, /\.shared-meal-menu-result__detail\s*{[^}]*padding:\s*var\(--df-space-3\) var\(--df-space-5\)/s)
  assert.match(pageStyles, /\.shared-meal-menu-detail-groups\s*{[^}]*gap:\s*var\(--df-space-1\)/s)
  assert.match(pageStyles, /\.shared-meal-menu-result__top\s*{[^}]*min-height:\s*108rpx/s)
  assert.match(pageStyles, /\.shared-meal-menu-selection-summary\s*{[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;/s)
  assert.match(pageStyles, /border-top:\s*1rpx solid var\(--df-color-line\)/)

  assert.match(vendorTemplate, /<t-checkbox\b/)
  assert.match(vendorTemplate, /<image\b/)
  assert.doesNotMatch(vendorTemplate, /<t-icon\b/)
  assert.match(vendorTemplate, /<t-loading\b/)
  assert.equal(vendorConfig.usingComponents['t-checkbox'], 'tdesign-miniprogram/checkbox/checkbox')
  assert.equal(vendorConfig.usingComponents['t-icon'], undefined)
  assert.equal(vendorConfig.usingComponents['t-loading'], 'tdesign-miniprogram/loading/loading')
})

test('展开详情只有可吃与不能吃分组，blocked 和未映射原料没有操作入口', () => {
  const template = fs.readFileSync(
    path.join(root, 'subpackages/shared-meal/menu-search/index.wxml'),
    'utf8'
  )

  assert.match(template, /狗狗可以吃/)
  assert.match(template, /狗狗不能吃/)
  assert.doesNotMatch(template, /未映射，仅保留来源文字|component\.blockedReason/)
  assert.doesNotMatch(template, /data-component-index|onToggleComponent/)
})

test('从 compose 返回后恢复关键词、已加载页、展开项和已选菜单且不重复搜索', async () => {
  const draftId = 'draft-f1-5-return'
  const calls = []
  const recipes = [
    { id: 'recipe-1', title: '清蒸鲈鱼' },
    { id: 'recipe-2', title: '香煎鲈鱼' }
  ].map((recipe) => ({
    ...recipe,
    ingredientPreviewVersion: 1,
    ingredients: [{
      position: 0,
      raw_name: '鲈鱼',
      mapping_status: 'matched',
      components: [{ display_name_zh: '鲈鱼', policy_status: 'allowed' }]
    }]
  }))
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes(options) {
      calls.push(options)
      if (!options.cursor) return { items: [recipes[0]], nextCursor: 'cursor-2' }
      return { items: [recipes[1]], nextCursor: null }
    }
  })
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  saveDogSelectionDraft({ id: 'dog-f1-5', name: '布丁' }, draftId)

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const firstPage = createPageInstance(definition)
    await firstPage.onLoad({ draftId })
    firstPage.setData({ searchValue: '鲈鱼' })
    await firstPage.searchRecipes('鲈鱼')
    await firstPage.onReachBottom()
    firstPage.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-1' } }
    })
    firstPage.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-2' } }
    })
    await firstPage.onToggleRecipeExpansion({
      currentTarget: { dataset: { recipeId: 'recipe-2' } }
    })
    firstPage.onHide()

    const callsBeforeRestore = calls.length
    const restoredPage = createPageInstance(definition)
    await restoredPage.onLoad({ draftId })

    assert.equal(calls.length, callsBeforeRestore)
    assert.equal(restoredPage.data.searchValue, '鲈鱼')
    assert.deepEqual(restoredPage.data.recipes.map((item) => item.id), [
      'recipe-1',
      'recipe-2'
    ])
    assert.equal(restoredPage.data.nextCursor, null)
    assert.equal(restoredPage.data.expandedRecipeId, 'recipe-2')
    assert.deepEqual(restoredPage.data.selectedRecipes, [
      { id: 'recipe-1', title: '清蒸鲈鱼' },
      { id: 'recipe-2', title: '香煎鲈鱼' }
    ])
  } finally {
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('中途退出保留菜单会话，只有明确 reset 草稿才一起清除', async () => {
  const draftId = 'draft-f1-5-exit'
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes() {
      return {
        items: [{ id: 'recipe-exit', title: '番茄炒蛋', ingredients: [] }],
        nextCursor: null
      }
    }
  })
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  saveDogSelectionDraft({ id: 'dog-f1-5', name: '布丁' }, draftId)

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad({ draftId })
    page.onToggleRecipeSelection({
      currentTarget: { dataset: { recipeId: 'recipe-exit' } }
    })
    page.onUnload()

    const stored = restoreDraft(draftId)
    assert.equal(stored.status, 'restored')
    assert.ok(stored.draft.menuSearchState)
    assert.equal(resetDraft(draftId), true)
    assert.equal(restoreDraft(draftId).status, 'empty')
  } finally {
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    humanRecipeService.__setAdapterForTest(mock)
  }
})

test('损坏的菜单会话安全降级为重新搜索且不影响有效草稿', async () => {
  const draftId = 'draft-f1-5-corrupt'
  let searchCalls = 0
  humanRecipeService.__setAdapterForTest({
    async searchHumanRecipes() {
      searchCalls += 1
      return {
        items: [{ id: 'recipe-fresh', title: '新鲜结果', ingredients: [] }],
        nextCursor: null
      }
    }
  })
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  const draft = saveDogSelectionDraft({ id: 'dog-f1-5', name: '布丁' }, draftId)
  saveDraft({
    ...draft,
    menuSearchState: {
      version: 1,
      session: '{broken-json',
      selectedRecipes: [{ id: 'forged', title: '损坏状态' }]
    }
  })

  try {
    const { definition } = loadPageModule('subpackages/shared-meal/menu-search/index.js')
    const page = createPageInstance(definition)
    await page.onLoad({ draftId })

    assert.equal(searchCalls, 1)
    assert.equal(page.data.searchValue, '')
    assert.deepEqual(page.data.recipes.map((item) => item.id), ['recipe-fresh'])
    assert.equal(restoreDraft(draftId).status, 'restored')
  } finally {
    storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
    humanRecipeService.__setAdapterForTest(mock)
  }
})
