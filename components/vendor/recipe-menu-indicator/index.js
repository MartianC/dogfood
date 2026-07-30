Component({
  properties: {
    kind: { type: String, value: 'checkbox' },
    checked: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    icon: { type: String, value: 'chevron-right' },
    iconSize: { type: String, value: '32rpx' },
    tone: { type: String, value: 'default' },
    text: { type: String, value: '' }
  },

  methods: {
    onCheckboxChange(event) {
      if (this.data.disabled) return
      this.triggerEvent('change', { checked: Boolean(event.detail.checked) })
    }
  }
})
