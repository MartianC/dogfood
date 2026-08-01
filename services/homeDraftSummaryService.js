const storage = require('../utils/storage')

const SHARED_MEAL_DRAFT_STORAGE_KEY = 'sharedMealDraft/v1'
const SHARED_MEAL_DRAFT_SCHEMA_VERSION = 1

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return String(value == null ? '' : value).trim()
}

function getDraftSummary() {
  const draft = storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  if (
    !isObject(draft)
    || draft.schemaVersion !== SHARED_MEAL_DRAFT_SCHEMA_VERSION
    || !text(draft.id)
    || !isObject(draft.dog)
    || !text(draft.dog.id)
    || !Array.isArray(draft.humanMenus)
    || !draft.humanMenus.length
  ) return null

  const humanMenus = draft.humanMenus
    .filter((menu) => isObject(menu) && text(menu.title))
    .map((menu) => ({ title: text(menu.title) }))
  if (!humanMenus.length) return null

  return {
    id: text(draft.id),
    dog: {
      id: text(draft.dog.id),
      name: text(draft.dog.name, '狗狗')
    },
    humanMenus,
    mealTime: draft.mealTime || null,
    updatedAt: draft.updatedAt || draft.lastEditedAt || draft.createdAt || null
  }
}

module.exports = {
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  SHARED_MEAL_DRAFT_SCHEMA_VERSION,
  getDraftSummary
}
