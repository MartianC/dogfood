const test = require('node:test')
const assert = require('node:assert/strict')

const {
  MENU_SEARCH_SESSION_VERSION,
  createMenuSearchSession,
  changeMenuSearchKeyword,
  mergeMenuSearchPage,
  selectMenuRecipe,
  deselectMenuRecipe,
  toggleExpandedMenuRecipe,
  canConfirmMenuSelection,
  serializeMenuSearchSession,
  restoreMenuSearchSession
} = require('../subpackages/shared-meal/services/menuSearchSessionService')

test('搜索会话以稳定的空状态开始', () => {
  assert.deepEqual(createMenuSearchSession(), {
    version: MENU_SEARCH_SESSION_VERSION,
    keyword: '',
    recipes: [],
    nextCursor: null,
    expandedRecipeId: null,
    selectedRecipeIds: []
  })
})

test('切换关键词清空当前结果和展开项，但保留跨搜索选择', () => {
  const previous = createMenuSearchSession({
    keyword: '鲈鱼',
    recipes: [{ id: 'recipe-1', title: '清蒸鲈鱼' }],
    nextCursor: 'cursor-2',
    expandedRecipeId: 'recipe-1',
    selectedRecipeIds: ['recipe-1']
  })

  const next = changeMenuSearchKeyword(previous, ' 西兰花 ')

  assert.deepEqual(next, {
    version: MENU_SEARCH_SESSION_VERSION,
    keyword: '西兰花',
    recipes: [],
    nextCursor: null,
    expandedRecipeId: null,
    selectedRecipeIds: ['recipe-1']
  })
  assert.equal(previous.keyword, '鲈鱼')
  assert.equal(previous.recipes.length, 1)
})

test('合并下一页按 recipeId 去重并保持首次出现顺序', () => {
  const firstPage = mergeMenuSearchPage(createMenuSearchSession(), {
    items: [
      { id: 'recipe-1', title: '清蒸鲈鱼' },
      { id: 'recipe-2', title: '番茄炒蛋' }
    ],
    nextCursor: 'cursor-2'
  })
  const secondPage = mergeMenuSearchPage(firstPage, {
    items: [
      { id: 'recipe-2', title: '重复的番茄炒蛋' },
      { id: 'recipe-3', title: '蒜蓉西兰花' },
      { id: '', title: '缺少身份的菜谱' }
    ],
    nextCursor: null
  })

  assert.deepEqual(
    secondPage.recipes.map((recipe) => [recipe.id, recipe.title]),
    [
      ['recipe-1', '清蒸鲈鱼'],
      ['recipe-2', '番茄炒蛋'],
      ['recipe-3', '蒜蓉西兰花']
    ]
  )
  assert.equal(secondPage.nextCursor, null)
  assert.equal(firstPage.recipes.length, 2)
})

test('选择和取消菜谱保持顺序、幂等且不混入空身份', () => {
  const initial = createMenuSearchSession()
  const selected = selectMenuRecipe(
    selectMenuRecipe(
      selectMenuRecipe(initial, 'recipe-1'),
      'recipe-2'
    ),
    'recipe-1'
  )

  assert.deepEqual(selected.selectedRecipeIds, ['recipe-1', 'recipe-2'])
  assert.equal(canConfirmMenuSelection(selected), true)
  assert.deepEqual(selectMenuRecipe(selected, ''), selected)

  const partiallyDeselected = deselectMenuRecipe(selected, 'recipe-1')
  const unchanged = deselectMenuRecipe(partiallyDeselected, 'recipe-missing')
  const empty = deselectMenuRecipe(partiallyDeselected, 'recipe-2')

  assert.deepEqual(partiallyDeselected.selectedRecipeIds, ['recipe-2'])
  assert.deepEqual(unchanged, partiallyDeselected)
  assert.deepEqual(empty.selectedRecipeIds, [])
  assert.equal(canConfirmMenuSelection(empty), false)
})

test('展开项保持单选，同一道菜再次切换时收起', () => {
  const session = createMenuSearchSession({
    recipes: [
      { id: 'recipe-1', title: '清蒸鲈鱼' },
      { id: 'recipe-2', title: '番茄炒蛋' }
    ]
  })

  const firstExpanded = toggleExpandedMenuRecipe(session, 'recipe-1')
  const secondExpanded = toggleExpandedMenuRecipe(firstExpanded, 'recipe-2')
  const collapsed = toggleExpandedMenuRecipe(secondExpanded, 'recipe-2')

  assert.equal(firstExpanded.expandedRecipeId, 'recipe-1')
  assert.equal(secondExpanded.expandedRecipeId, 'recipe-2')
  assert.equal(collapsed.expandedRecipeId, null)
  assert.deepEqual(toggleExpandedMenuRecipe(collapsed, 'recipe-missing'), collapsed)
})

test('搜索会话序列化后可稳定恢复，非法状态安全降级', () => {
  const session = createMenuSearchSession({
    keyword: '鲈鱼',
    recipes: [
      { id: 'recipe-1', title: '清蒸鲈鱼' },
      { id: 'recipe-1', title: '重复菜谱' },
      { id: 'recipe-2', title: '香煎鲈鱼' }
    ],
    nextCursor: 'cursor-2',
    expandedRecipeId: 'recipe-2',
    selectedRecipeIds: ['recipe-2', 'recipe-2', '', 'recipe-1']
  })

  assert.deepEqual(
    restoreMenuSearchSession(serializeMenuSearchSession(session)),
    session
  )
  assert.deepEqual(
    restoreMenuSearchSession('{broken-json'),
    createMenuSearchSession()
  )
  assert.deepEqual(
    restoreMenuSearchSession(JSON.stringify({ version: 999, keyword: '旧状态' })),
    createMenuSearchSession()
  )
})

test('恢复时移除不存在的展开项，但保留当前结果外的已选菜谱', () => {
  const restored = restoreMenuSearchSession(JSON.stringify({
    version: MENU_SEARCH_SESSION_VERSION,
    keyword: '西兰花',
    recipes: [{ id: 'recipe-2', title: '蒜蓉西兰花' }],
    expandedRecipeId: 'recipe-1',
    selectedRecipeIds: ['recipe-1', 'recipe-2']
  }))

  assert.equal(restored.expandedRecipeId, null)
  assert.deepEqual(restored.selectedRecipeIds, ['recipe-1', 'recipe-2'])
  assert.equal(canConfirmMenuSelection(restored), true)
})
