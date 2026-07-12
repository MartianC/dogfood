Component({
  properties: {
    value: { type: String, value: '' },
    loading: { type: Boolean, value: false }
  },

  methods: {
    onChange(event) {
      this.triggerEvent('change', { value: event.detail.value })
    }
  }
})
