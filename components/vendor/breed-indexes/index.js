Component({
  properties: {
    groups: { type: Array, value: [] },
    filtered: { type: Array, value: [] },
    hasKeyword: { type: Boolean, value: false },
    selectedValue: { type: String, value: '' },
    keyword: { type: String, value: '' },
    indexList: { type: Array, value: [] },
    height: { type: Number, value: 0 }
  },

  methods: {
    onSearchChange(event) {
      this.triggerEvent('search', { value: event.detail.value })
    },

    onSelect(event) {
      const value = event.currentTarget.dataset.value
      if (value) this.triggerEvent('select', { value })
    }
  }
})
