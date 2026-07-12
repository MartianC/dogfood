Component({
  properties: {
    items: { type: Array, value: [] },
    mode: { type: String, value: 'edit' },
    actionIcon: { type: String, value: 'delete-1-filled' }
  },

  methods: {
    onAmountInput(event) {
      this.triggerEvent('amountchange', {
        value: event.detail.value,
        index: event.currentTarget.dataset.index
      })
    },

    onCellClick(event) {
      if (this.data.mode !== 'search') return
      const item = this.data.items[Number(event.currentTarget.dataset.index)]
      this.triggerEvent('select', { ingredient: item })
    },

    onActionTap(event) {
      const index = Number(event.currentTarget.dataset.index)
      if (this.data.mode === 'edit') {
        this.triggerEvent('remove', { index })
        return
      }
      this.triggerEvent('select', { ingredient: this.data.items[index] })
    }
  }
})
