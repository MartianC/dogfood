const env = require('../../../config/env')
const storage = require('../../../utils/storage')
const adapter = env.useCloudBase ? require('../../../services/adapters/cloudbase') : require('../../../services/adapters/mock')

function saveDraft(draft) {
  storage.setSync('customRecipeDraft', {
    ...draft,
    updatedAt: new Date().toISOString()
  })
}

function getDraft() {
  return storage.getSync('customRecipeDraft', null)
}

function clearDraft() {
  storage.removeSync('customRecipeDraft')
}

async function save(payload) {
  const saved = await adapter.saveCustomRecipe({
    status: payload.status || 'checked',
    ...payload
  })
  clearDraft()
  return saved
}

module.exports = {
  saveDraft,
  getDraft,
  clearDraft,
  save
}
