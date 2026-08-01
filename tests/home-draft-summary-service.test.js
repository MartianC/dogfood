const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  getDraftSummary
} = require('../services/homeDraftSummaryService')

test.afterEach(() => {
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
})

test('首页草稿摘要只保留可展示的身份和菜单信息', () => {
  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, {
    schemaVersion: 1,
    id: 'draft-1',
    dog: { id: 'dog-1', name: '布丁', healthNotes: '不应进入摘要' },
    humanMenus: [
      { title: '鸡肉饭', ingredients: ['不应进入摘要'] },
      { title: '' },
      null
    ],
    mealTime: '2026-08-02T04:00:00.000Z',
    note: '不应进入摘要'
  })

  assert.deepEqual(getDraftSummary(), {
    id: 'draft-1',
    dog: { id: 'dog-1', name: '布丁' },
    humanMenus: [{ title: '鸡肉饭' }],
    mealTime: '2026-08-02T04:00:00.000Z',
    updatedAt: null
  })
})

test('首页不展示版本错误、空菜单或损坏档案的草稿', () => {
  const invalidDrafts = [
    { schemaVersion: 2, id: 'draft-1', dog: { id: 'dog-1' }, humanMenus: [{ title: '鸡肉饭' }] },
    { schemaVersion: 1, id: 'draft-2', dog: { id: 'dog-1' }, humanMenus: [] },
    { schemaVersion: 1, id: 'draft-3', dog: {}, humanMenus: [{ title: '鸡肉饭' }] }
  ]

  invalidDrafts.forEach((draft) => {
    storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, draft)
    assert.equal(getDraftSummary(), null)
  })
})
