const env = require('../config/env')
const storage = require('../utils/storage')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')

function listRecipes() {
  return storage.getSync('customRecipeLibrary', [])
    .slice()
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
}

function createDraft(payload = {}) {
  const title = String(payload.title || '').trim()
  if (!title) throw new Error('请填写食谱名称')
  const timestamp = new Date().toISOString()
  const targetDogIds = payload.targetDogId ? [payload.targetDogId] : []
  const draft = {
    id: `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    status: 'draft',
    ingredients: [],
    createdAt: timestamp,
    ...payload,
    title,
    targetDogIds,
    updatedAt: timestamp
  }
  saveDraft(draft)
  return getDraft()
}

function saveDraft(draft) {
  const savedDraft = {
    ...draft,
    updatedAt: new Date().toISOString()
  }
  storage.setSync('customRecipeDraft', savedDraft)
  if (savedDraft.id) {
    const recipes = listRecipes().filter((recipe) => recipe.id !== savedDraft.id)
    storage.setSync('customRecipeLibrary', recipes.concat(savedDraft))
  }
  return savedDraft
}

function getDraft() {
  return storage.getSync('customRecipeDraft', null)
}

function clearDraft() {
  storage.removeSync('customRecipeDraft')
}

async function save(payload) {
  const localDraftId = /^draft_/.test(String(payload.id || '')) ? payload.id : ''
  const persistentPayload = { ...payload }
  if (localDraftId) delete persistentPayload.id
  const saved = await adapter.saveCustomRecipe({
    status: persistentPayload.status || 'checked',
    ...persistentPayload
  })
  if (localDraftId) {
    storage.setSync('customRecipeLibrary', listRecipes().filter((recipe) => recipe.id !== localDraftId))
  }
  clearDraft()
  return saved
}

module.exports = {
  listRecipes,
  createDraft,
  saveDraft,
  getDraft,
  clearDraft,
  save
}
