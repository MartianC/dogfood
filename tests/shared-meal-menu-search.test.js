const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cloudbase = require('../services/adapters/cloudbase')
const mock = require('../services/adapters/mock')
const humanRecipeService = require('../subpackages/shared-meal/services/humanRecipeService')

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
