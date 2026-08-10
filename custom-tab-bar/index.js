const sharedMealEntryService = require('../services/sharedMealEntryService')
const tabBarMutedColor = '#6f7b73'

function getWindowInfo() {
  try {
    return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (error) {
    return null
  }
}

function getTabBarContainerStyle() {
  const info = getWindowInfo()
  const safeAreaBottomPx = info && info.safeArea && Number.isFinite(info.screenHeight) && Number.isFinite(info.safeArea.bottom)
    ? Math.max(0, info.screenHeight - info.safeArea.bottom)
    : info && info.safeAreaInsets && Number.isFinite(info.safeAreaInsets.bottom)
      ? Math.max(0, info.safeAreaInsets.bottom)
      : 0
  const windowWidth = info && (info.windowWidth || info.screenWidth) || 375
  const safeAreaBottom = Math.round(safeAreaBottomPx * 750 / windowWidth)
  return [
    `--df-tab-bar-safe-area-bottom: ${safeAreaBottom}rpx`,
    `--td-tab-bar-color: ${tabBarMutedColor}`,
    `height: ${112 + safeAreaBottom}rpx`
  ].join(';')
}

const items = [
  { value: 'home', label: '首页', iconPath: '/assets/tabbar/home.svg', selectedIconPath: '/assets/tabbar/home-active.svg', path: '/pages/home/index' },
  { value: 'records', label: '记录', iconPath: '/assets/tabbar/records.svg', selectedIconPath: '/assets/tabbar/records-active.svg', path: '/pages/records/index' },
  { value: 'dogs', label: '爱宠', iconPath: '/assets/tabbar/dogs.svg', selectedIconPath: '/assets/tabbar/dogs-active.svg', path: '/pages/dogs/index' },
  { value: 'profile', label: '我的', iconPath: '/assets/tabbar/profile.svg', selectedIconPath: '/assets/tabbar/profile-active.svg', path: '/pages/profile/index/index' }
]

const tabBarStyle = [
  '--td-tab-bar-bg-color: #ffffff',
  '--td-tab-bar-border-color: #d8e1da',
  '--td-tab-bar-active-color: #25684a',
  `--td-tab-bar-color: ${tabBarMutedColor}`,
  '--td-tab-bar-hover-bg-color: #eef3ef',
  '--td-font-body-large: 22rpx / 32rpx PingFang SC, Microsoft YaHei, Arial Regular',
  '--td-tab-bar-height: 88rpx',
  'box-sizing: border-box'
].join(';')

const tabItemStyle = [
  tabBarStyle,
  'flex: 0 0 calc((100% - 142rpx) / 4)',
  'padding: 0',
  'margin: 12rpx 0'
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
    tabBarContainerStyle: getTabBarContainerStyle(),
    tabBarStyle,
    tabItemStyle,
    tabBarGapStyle: 'flex: 0 0 142rpx; width: 142rpx; pointer-events: none',
    fabButtonProps: {
      theme: 'primary',
      shape: 'circle',
      size: 'large',
      style: fabButtonStyle
    },
    fabStyle: [
      'position: absolute',
      'left: calc(50% - 48rpx)',
      'bottom: calc(64rpx + var(--df-tab-bar-safe-area-bottom))',
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

  lifetimes: {
    attached() {
      this.setData({ tabBarContainerStyle: getTabBarContainerStyle() })
    }
  },

  pageLifetimes: {
    resize() {
      this.setData({ tabBarContainerStyle: getTabBarContainerStyle() })
    }
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
