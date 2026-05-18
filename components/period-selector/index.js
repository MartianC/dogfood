Component({
  properties: {
    value: {
      type: Number,
      value: 7
    }
  },
  data: {
    options: [7, 15, 30]
  },
  methods: {
    onSelect(e) {
      this.triggerEvent('change', { periodDays: Number(e.currentTarget.dataset.value) })
    },
    onInput(e) {
      const value = Math.max(1, Math.min(30, Number(e.detail.value || 1)))
      this.triggerEvent('change', { periodDays: value })
    }
  }
})
