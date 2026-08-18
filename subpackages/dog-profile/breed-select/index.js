const { breedOptions } = require('../data/options')

// 按拼音首字母把品种聚合成分组，分组内按中文名排序，分组按字母 A-Z 排序。
function buildGroups(options) {
  const map = new Map()
  options.forEach((option) => {
    const key = option.pinyinInitial || '#'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(option)
  })

  const groups = []
  Array.from(map.keys())
    .sort((a, b) => a.localeCompare(b))
    .forEach((index) => {
      const items = map
        .get(index)
        .slice()
        .sort((x, y) => x.label.localeCompare(y.label, 'zh'))
      groups.push({ index, items })
    })
  return groups
}

Page({
  data: {
    keyword: '',
    hasKeyword: false,
    filtered: [],
    groups: [],
    indexList: [],
    selectedValue: '',
    indexesHeight: 0
  },

  onLoad(query) {
    const selectedValue = decodeURIComponent((query && query.selected) || '')
    const groups = buildGroups(breedOptions)

    const win = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const rpx2px = win.windowWidth / 750
    const searchHeightPx = Math.round(96 * rpx2px) + 16

    this.setData({
      groups,
      indexList: groups.map((group) => group.index),
      selectedValue,
      indexesHeight: win.windowHeight - searchHeightPx
    })
  },

  onSearchChange(event) {
    const keyword = (event.detail.value || '').trim()
    const filtered = keyword
      ? breedOptions.filter((option) => option.label.indexOf(keyword) !== -1)
      : []
    this.setData({
      keyword,
      hasKeyword: keyword.length > 0,
      filtered
    })
  },

  onSelect(event) {
    const value = event.detail.value
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (channel && typeof channel.emit === 'function') {
      channel.emit('breedSelected', { value })
    }
    wx.navigateBack()
  }
})
