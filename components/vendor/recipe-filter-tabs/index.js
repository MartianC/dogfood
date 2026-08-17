Component({
  properties: {
    value: { type: String, value: '' },
    items: { type: Array, value: [] }
  },

  methods: {
    onChange(event) {
      this.triggerEvent('change', { value: String(event.detail.value || '') })
    }
  }
})
