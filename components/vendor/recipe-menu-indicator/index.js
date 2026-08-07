const ICON_ASSETS = Object.freeze({
  'add-circle:primary': '/assets/icons/tdesign/add-circle-primary.svg',
  'minus-circle:warning': '/assets/icons/tdesign/minus-circle-warning.svg',
  'close:primary': '/assets/icons/tdesign/close-primary.svg'
})

function resolveIconAsset(icon, tone) {
  return ICON_ASSETS[`${icon}:${tone}`] || `/assets/icons/tdesign/${icon}.svg`
}

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

  data: {
    iconSrc: '/assets/icons/tdesign/chevron-right.svg'
  },

  observers: {
    'icon, tone'(icon, tone) {
      this.setData({ iconSrc: resolveIconAsset(icon, tone) })
    }
  },

  methods: {
    onCheckboxChange(event) {
      if (this.data.disabled) return
      this.triggerEvent('change', { checked: Boolean(event.detail.checked) })
    }
  }
})
