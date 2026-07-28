const items = [
  { value: 'home', label: '首页', iconPath: '/assets/tabbar/home.png', selectedIconPath: '/assets/tabbar/home-active.png', path: '/pages/home/index' },
  { value: 'records', label: '记录', iconPath: '/assets/tabbar/records.png', selectedIconPath: '/assets/tabbar/records-active.png', path: '/pages/records/index' },
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

Component({
  data: {
    selected: 'home',
    items,
    tabBarStyle
  },

  methods: {
    onChange(event) {
      const selected = event.detail.value
      const item = this.data.items.find((candidate) => candidate.value === selected)
      if (!item || item.value === this.data.selected) return
      this.setData({ selected })
      wx.switchTab({ url: item.path })
    }
  }
})
