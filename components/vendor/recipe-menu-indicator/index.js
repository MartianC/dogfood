Component({
  properties: {
    kind: { type: String, value: 'checkbox' },
    checked: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    icon: { type: String, value: 'chevron-right' },
    text: { type: String, value: '' }
  },

  methods: {
    onCheckboxChange(event) {
      if (this.data.disabled) return
      this.triggerEvent('change', { checked: Boolean(event.detail.checked) })
    }
  }
})
