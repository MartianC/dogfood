const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const customRecipeService = require('../services/customRecipeService')

function resetRecipeState() {
  storage.removeSync('customRecipeDraft')
  storage.removeSync('customRecipeLibrary')
  storage.removeSync('mockCustomRecipes')
}

test.beforeEach(resetRecipeState)

test('创建食谱时拒绝空名称', () => {
  assert.throws(
    () => customRecipeService.createDraft({ title: '   ' }),
    /请填写食谱名称/
  )
  assert.deepEqual(customRecipeService.listRecipes(), [])
})

test('创建食谱会规范化名称并保存为空食材草稿', () => {
  const recipe = customRecipeService.createDraft({
    title: '  阿福的一周主食  ',
    targetDogId: 'dog_1',
    targetDogName: '阿福'
  })

  assert.match(recipe.id, /^draft_/)
  assert.equal(recipe.title, '阿福的一周主食')
  assert.equal(recipe.status, 'draft')
  assert.deepEqual(recipe.ingredients, [])
  assert.deepEqual(recipe.targetDogIds, ['dog_1'])
  assert.equal(customRecipeService.getDraft().id, recipe.id)
  assert.deepEqual(customRecipeService.listRecipes().map((item) => item.id), [recipe.id])
})

test('保存同一食谱会更新列表且不会产生重复项', () => {
  const first = customRecipeService.createDraft({ title: '第一份' })
  const second = customRecipeService.createDraft({ title: '第二份' })

  customRecipeService.saveDraft({ ...first, title: '第一份已修改' })

  const recipes = customRecipeService.listRecipes()
  assert.equal(recipes.length, 2)
  assert.equal(recipes.filter((item) => item.id === first.id).length, 1)
  assert.equal(recipes.find((item) => item.id === first.id).title, '第一份已修改')
  assert.ok(recipes.some((item) => item.id === second.id))
})

test('食谱列表按最近编辑时间倒序排列', () => {
  storage.setSync('customRecipeLibrary', [
    { id: 'older', title: '较早', updatedAt: '2026-07-10T08:00:00.000Z' },
    { id: 'newer', title: '最近', updatedAt: '2026-07-11T08:00:00.000Z' }
  ])

  assert.deepEqual(customRecipeService.listRecipes().map((item) => item.id), ['newer', 'older'])
})

test('首次持久化会把本地草稿 ID 替换为持久化 ID', async () => {
  const draft = customRecipeService.createDraft({ title: '首次保存' })
  const checkedDraft = {
    ...draft,
    ingredients: [{ name: '鸡胸肉', category: 'meat', perMealAmountGram: 100 }],
    status: 'checked'
  }
  customRecipeService.saveDraft(checkedDraft)

  const saved = await customRecipeService.save(checkedDraft)
  customRecipeService.saveDraft({ ...checkedDraft, id: saved.id })

  assert.notEqual(saved.id, draft.id)
  assert.doesNotMatch(saved.id, /^draft_/)
  assert.deepEqual(customRecipeService.listRecipes().map((item) => item.id), [saved.id])
})
