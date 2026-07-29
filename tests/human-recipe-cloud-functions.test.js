const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createSearchHumanRecipes
} = require('../cloudfunctions/searchHumanRecipes/index')
const {
  createGetHumanRecipe
} = require('../cloudfunctions/getHumanRecipe/index')
const mock = require('../services/adapters/mock')

const MAX_SEARCH_RESPONSE_BYTES = 256 * 1024

function matches(document, condition) {
  if (condition && condition.$and) return condition.$and.every((item) => matches(document, item))
  if (condition && condition.$or) return condition.$or.some((item) => matches(document, item))
  return Object.entries(condition || {}).every(([key, expected]) => {
    if (expected && expected.$gt !== undefined) return String(document[key]) > String(expected.$gt)
    if (expected && expected.$regex !== undefined) {
      return new RegExp(expected.$regex, expected.$options).test(String(document[key] || ''))
    }
    return document[key] === expected
  })
}

function createDatabase(fixtures) {
  const calls = []
  const database = {
    command: {
      gt(value) { return { $gt: value } },
      or(conditions) { return { $or: conditions } },
      and(conditions) { return { $and: conditions } }
    },
    RegExp({ regexp, options }) {
      return { $regex: regexp, $options: options }
    },
    collection(name) {
      calls.push({ name })
      let condition = {}
      const orders = []
      let maximum = Infinity
      const query = {
        where(value) {
          condition = value
          calls[calls.length - 1].condition = value
          return query
        },
        orderBy(field, direction) {
          orders.push([field, direction])
          return query
        },
        limit(value) {
          maximum = value
          return query
        },
        async get() {
          const rows = (fixtures[name] || []).filter((item) => matches(item, condition))
          rows.sort((left, right) => {
            for (const [field, direction] of orders) {
              const compared = String(left[field] || '').localeCompare(String(right[field] || ''))
              if (compared) return direction === 'desc' ? -compared : compared
            }
            return 0
          })
          return { data: rows.slice(0, maximum) }
        }
      }
      return query
    }
  }
  return { database, calls }
}

const fixtures = {
  data_releases: [
    {
      _id: 'active-v2',
      status: 'active',
      recipe_version: 'recipe-v2',
      generated_at: '2026-07-26T00:00:00Z'
    },
    {
      _id: 'staging-v3',
      status: 'staging',
      recipe_version: 'recipe-v3',
      generated_at: '2026-07-27T00:00:00Z'
    }
  ],
  human_recipes: [
    {
      _id: 'recipe-a',
      recipe_version: 'recipe-v2',
      status: 'ready',
      sortKey: 'a',
      title: 'A 菜',
      search_text: 'a 菜 番茄',
      internalOnly: '不得泄漏',
      ingredients: [{
        position: 0,
        raw_name: '番茄',
        amount_raw: '2 个',
        mapping_status: 'matched',
        mapping_rule: 'internal-rule',
        internalOnly: '不得泄漏',
        components: [{
          display_name_zh: '番茄（生）',
          policy_status: 'allowed',
          internalOnly: '不得泄漏'
        }]
      }]
    },
    {
      _id: 'recipe-b',
      recipe_version: 'recipe-v2',
      status: 'ready',
      sortKey: 'b',
      title: 'B 菜',
      search_text: 'b 菜 胡萝卜',
      ingredients: [{ position: 0, raw_name: '胡萝卜', components: [] }]
    },
    {
      _id: 'recipe-c',
      recipe_version: 'recipe-v2',
      status: 'ready',
      sortKey: 'b',
      title: 'C 菜',
      search_text: 'c 菜 南瓜',
      ingredients: [{ position: 0, raw_name: '南瓜', components: [] }]
    },
    {
      _id: 'recipe-staging',
      recipe_version: 'recipe-v3',
      status: 'ready',
      sortKey: '0',
      title: '暂存菜谱',
      search_text: '暂存',
      ingredients: []
    }
  ]
}

test('搜索只解析 active recipe_version，并以 sortKey + _id 稳定游标批量返回原料', async () => {
  const { database, calls } = createDatabase(fixtures)
  const search = createSearchHumanRecipes(database)

  const first = await search({ limit: 2 })
  const second = await search({ limit: 2, cursor: first.nextCursor })

  assert.equal(first.contract, 'searchHumanRecipes/v1')
  assert.equal(first.recipeVersion, 'recipe-v2')
  assert.deepEqual(first.items.map((item) => item.id), ['recipe-a', 'recipe-b'])
  assert.deepEqual(
    Object.keys(first.items[0]).sort(),
    ['id', 'ingredientPreviewVersion', 'ingredients', 'title']
  )
  assert.equal(first.items[0].ingredientPreviewVersion, 1)
  assert.deepEqual(first.items[0].ingredients, [{
    position: 0,
    raw_name: '番茄',
    amount_raw: '2 个',
    mapping_status: 'matched',
    components: [{
      display_name_zh: '番茄（生）',
      policy_status: 'allowed'
    }]
  }])
  assert.doesNotMatch(JSON.stringify(first), /internalOnly|search_text|mapping_rule/)
  assert.deepEqual(second.items.map((item) => item.id), ['recipe-c'])
  assert.equal(second.nextCursor, null)
  assert.deepEqual(
    calls.filter((call) => call.name === 'data_releases').map((call) => call.condition),
    [{ status: 'active' }, { status: 'active' }]
  )
  assert.equal(calls.filter((call) => call.name === 'human_recipes').length, 2)
  assert.equal(calls.some((call) => call.name === 'canine_ingredient_policies'), false)
})

test('云端与 Mock 搜索摘要键集合一致且最大页响应不携带内部投影', async () => {
  const paddedFixtures = {
    data_releases: fixtures.data_releases,
    human_recipes: Array.from({ length: 21 }, (_, index) => ({
      ...fixtures.human_recipes[0],
      _id: `large-${String(index).padStart(2, '0')}`,
      sortKey: `large-${String(index).padStart(2, '0')}`,
      title: `大页菜谱 ${index}`,
      internalOnly: 'x'.repeat(300000),
      search_text: `大页菜谱 ${index}`,
      ingredients: [{
        ...fixtures.human_recipes[0].ingredients[0],
        mapping_rule: 'internal-rule',
        internalOnly: 'x'.repeat(10000)
      }]
    }))
  }
  const { database } = createDatabase(paddedFixtures)
  const cloudResult = await createSearchHumanRecipes(database)({ limit: 20 })
  const mockResult = await mock.searchHumanRecipes({ limit: 1 })

  assert.deepEqual(
    Object.keys(cloudResult.items[0]).sort(),
    Object.keys(mockResult.items[0]).sort()
  )
  assert.deepEqual(
    Object.keys(cloudResult.items[0].ingredients[0]).sort(),
    Object.keys(mockResult.items[0].ingredients[0]).sort()
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(cloudResult), 'utf8') <= MAX_SEARCH_RESPONSE_BYTES
  )
  assert.doesNotMatch(
    JSON.stringify(cloudResult),
    /internalOnly|search_text|mapping_rule/
  )
})

test('详情只读取 active 版本且一次返回完整来源有序原料', async () => {
  const { database, calls } = createDatabase(fixtures)
  const get = createGetHumanRecipe(database)

  const result = await get({ recipeId: 'recipe-b' })

  assert.equal(result.contract, 'getHumanRecipe/v1')
  assert.equal(result.recipeVersion, 'recipe-v2')
  assert.equal(result.recipe.id, 'recipe-b')
  assert.deepEqual(result.recipe.ingredients, fixtures.human_recipes[1].ingredients)
  assert.equal(result.recipe.search_text, 'b 菜 胡萝卜')
  assert.equal(calls.filter((call) => call.name === 'human_recipes').length, 1)
})

test('只有 staging 发布时明确拒绝查询且不回退', async () => {
  const { database, calls } = createDatabase({
    ...fixtures,
    data_releases: fixtures.data_releases.filter((item) => item.status === 'staging')
  })
  const search = createSearchHumanRecipes(database)

  await assert.rejects(() => search({}), /active/)
  assert.equal(calls.some((call) => call.name === 'human_recipes'), false)
})
