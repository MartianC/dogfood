const sharedMealEntryService = require('../services/sharedMealEntryService')

const items = [
  { value: 'home', label: '首页', iconPath: '/assets/tabbar/home.png', selectedIconPath: '/assets/tabbar/home-active.png', path: '/pages/home/index' },
  { value: 'records', label: '记录', iconPath: '/assets/tabbar/records.png', selectedIconPath: '/assets/tabbar/records-active.png', path: '/pages/records/index' },
  { value: 'dogs', label: '狗狗', iconPath: '/assets/tabbar/dogs.png', selectedIconPath: '/assets/tabbar/dogs-active.png', path: '/pages/dogs/index' },
  { value: 'profile', label: '我的', iconPath: '/assets/tabbar/profile.png', selectedIconPath: '/assets/tabbar/profile-active.png', path: '/pages/profile/index/index' }
]

const tabBarStyle = [
  '--td-tab-bar-bg-color: #ffffff',
  '--td-tab-bar-border-color: transparent',
  '--td-tab-bar-active-bg: #e3f0e8',
  '--td-tab-bar-active-color: #25684a',
  '--td-tab-bar-color: #6f7b73',
  '--td-tab-bar-hover-bg-color: #eef3ef',
  '--td-font-body-large: 28rpx / 40rpx PingFang SC, Microsoft YaHei, Arial Regular',
  '--td-tab-bar-height: 80rpx'
].join(';')

const fabButtonStyle = [
  '--td-brand-color: #25684a',
  '--td-brand-color-active: #1d523a',
  '--td-button-primary-bg-color: #25684a',
  '--td-button-primary-border-color: #25684a',
  '--td-button-primary-active-bg-color: #1d523a',
  '--td-button-primary-active-border-color: #1d523a',
  '--td-button-primary-color: #ffffff'
].join(';')

Component({
  data: {
    selected: 'home',
    items,
    tabBarStyle,
    fabButtonProps: {
      theme: 'primary',
      shape: 'circle',
      size: 'large',
      style: fabButtonStyle
    },
    fabStyle: [
      'left: calc(50% - 48rpx)',
      'bottom: calc(64rpx + constant(safe-area-inset-bottom))',
      'bottom: calc(64rpx + env(safe-area-inset-bottom))',
      'width: 96rpx',
      'height: 96rpx',
      'box-sizing: border-box',
      'pointer-events: auto',
      '--td-brand-color: var(--df-color-primary)',
      '--td-brand-color-active: var(--df-color-primary-pressed)',
      '--td-button-primary-bg-color: var(--df-color-primary)',
      '--td-button-primary-border-color: var(--df-color-primary)',
      '--td-button-primary-active-bg-color: var(--df-color-primary-pressed)',
      '--td-button-primary-active-border-color: var(--df-color-primary-pressed)',
      '--td-button-primary-color: var(--df-color-on-primary)',
      'z-index: 2'
    ].join(';')
  },

  methods: {
    onChange(event) {
      const selected = event.detail.value
      const item = this.data.items.find((candidate) => candidate.value === selected)
      if (!item || item.value === this.data.selected) return
      this.setData({ selected })
      wx.switchTab({ url: item.path })
    },

    onStartSharedMeal() {
      return sharedMealEntryService.startSharedMeal()
    }
  }
})
