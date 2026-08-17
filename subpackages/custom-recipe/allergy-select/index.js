const ingredientService = require('../services/ingredientService')
const dogService = require('../../../services/dogService')
const {
  createAllergyEntry,
  parseAllergyEntry,
  allergyDisplayItems
} = require('../../../services/dogIngredientPolicy')

const PAGE_SIZE = 20
const ALL_TAB = 'all'
const SELECTED_TAB = 'selected'

function decodeSelected(value) {
  try {
    const selected = JSON.parse(decodeURIComponent(String(value || '[]')))
    return Array.isArray(selected) ? selected : []
  } catch (error) {
    return []
  }
}

function selectionKey(value) {
  const parsed = parseAllergyEntry(value)
  return parsed.conceptId || parsed.name
}

function decorateIngredients(items = [], selectedEntries = []) {
  const selectedKeys = new Set(selectedEntries.map(selectionKey))
  return items.map((item) => ({
    ...item,
    selected: selectedKeys.has(String(item.conceptId || item.name || ''))
  }))
}

function appendUnique(current = [], next = []) {
  const seen = new Set(current.map((item) => item.conceptId || item.id || item.name))
  return current.concat(next.filter((item) => {
    const key = item.conceptId || item.id || item.name
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }))
}

function createTabItems(selectedCount = 0) {
  return [
    { value: ALL_TAB, label: '全部食材' },
    { value: SELECTED_TAB, label: `已选（${selectedCount}）` }
  ]
}

function selectionPatch(selectedEntries = [], ingredients = []) {
  return {
    selectedEntries,
    selectedItems: allergyDisplayItems(selectedEntries),
    tabItems: createTabItems(selectedEntries.length),
    ingredients: decorateIngredients(ingredients, selectedEntries)
  }
}

Page({
  data: {
    selectedEntries: [],
    selectedItems: [],
    activeTab: ALL_TAB,
    tabItems: createTabItems(0),
    dogId: '',
    searchValue: '',
    ingredients: [],
    loading: false,
    loadingMore: false,
    error: false,
    hasMore: false,
    confirming: false
  },

  onLoad(options = {}) {
    const selectedEntries = decodeSelected(options.selected)
    this.openerEventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null
    if (this.openerEventChannel && typeof this.openerEventChannel.on === 'function') {
      this.openerEventChannel.on('allergySelectionInit', ({ dogId, allergens }) => {
        const next = Array.isArray(allergens) ? allergens : []
        this.setData({
          dogId: String(dogId || ''),
          activeTab: next.length ? SELECTED_TAB : ALL_TAB,
          ...selectionPatch(next, this.data.ingredients)
        })
      })
    }
    this.setData({
      activeTab: selectedEntries.length ? SELECTED_TAB : ALL_TAB,
      ...selectionPatch(selectedEntries, this.data.ingredients)
    })
    return this.loadIngredients('', false)
  },

  onTabChange(event) {
    const value = String(event.detail.value || '')
    if (value !== ALL_TAB && value !== SELECTED_TAB) return
    this.setData({ activeTab: value })
  },

  onShowAll() {
    this.setData({ activeTab: ALL_TAB })
  },

  async loadIngredients(keyword = '', append = false) {
    const offset = append ? this.data.ingredients.length : 0
    this.setData(append
      ? { loadingMore: true, error: false }
      : { loading: true, error: false, ingredients: [] })
    try {
      const page = await ingredientService.loadIngredientPage({ keyword, offset, limit: PAGE_SIZE })
      const next = decorateIngredients(page.items, this.data.selectedEntries)
      this.setData({
        ingredients: append ? appendUnique(this.data.ingredients, next) : next,
        loading: false,
        loadingMore: false,
        hasMore: page.hasMore
      })
      return true
    } catch (error) {
      this.setData({ loading: false, loadingMore: false, error: true, hasMore: false })
      return false
    }
  },

  onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    this.setData({ searchValue })
    return this.loadIngredients(searchValue.trim(), false)
  },

  onSearchAction() {
    this.setData({ searchValue: '' })
    return this.loadIngredients('', false)
  },

  onRetry() {
    return this.loadIngredients(this.data.searchValue.trim(), false)
  },

  onReachBottom() {
    if (this.data.activeTab !== ALL_TAB) return Promise.resolve(false)
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return Promise.resolve(false)
    return this.loadIngredients(this.data.searchValue.trim(), true)
  },

  onToggleIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const ingredient = this.data.ingredients[index]
    if (!ingredient) return
    const entry = createAllergyEntry(ingredient)
    const key = selectionKey(entry)
    const exists = this.data.selectedEntries.some((item) => selectionKey(item) === key)
    const selectedEntries = exists
      ? this.data.selectedEntries.filter((item) => selectionKey(item) !== key)
      : this.data.selectedEntries.concat(entry)
    this.setData(selectionPatch(selectedEntries, this.data.ingredients))
  },

  onRemoveSelected(event) {
    const entry = String(event.currentTarget.dataset.entry || '')
    if (!entry) return
    const selectedEntries = this.data.selectedEntries.filter((item) => String(item) !== entry)
    this.setData(selectionPatch(selectedEntries, this.data.ingredients))
  },

  onClearSelected() {
    if (!this.data.selectedEntries.length) return
    wx.showModal({
      title: '清空过敏食材？',
      content: '清空后仍需点击“确认选择”才会保存。',
      confirmText: '清空',
      success: ({ confirm }) => {
        if (!confirm) return
        this.setData(selectionPatch([], this.data.ingredients))
      }
    })
  },

  async onConfirm() {
    if (this.data.confirming) return
    if (!this.data.dogId) {
      wx.showToast({ title: '请先保存狗狗档案', icon: 'none' })
      return
    }
    this.setData({ confirming: true })
    try {
      await dogService.updateDogAllergens(this.data.dogId, this.data.selectedEntries)
      if (this.openerEventChannel && typeof this.openerEventChannel.emit === 'function') {
        this.openerEventChannel.emit('allergensSelected', { allergens: this.data.selectedEntries })
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      wx.navigateBack()
    } catch (error) {
      this.setData({ confirming: false })
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' })
    }
  }
})

module.exports = {
  decodeSelected,
  selectionKey,
  decorateIngredients,
  createTabItems,
  selectionPatch
}
