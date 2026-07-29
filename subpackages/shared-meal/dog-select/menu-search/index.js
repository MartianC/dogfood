function canonicalMenuSearchUrl(options = {}) {
  const draftId = String(options.draftId || '')
  const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : ''
  return `/subpackages/shared-meal/menu-search/index${query}`
}

Page({
  onLoad(options = {}) {
    wx.redirectTo({ url: canonicalMenuSearchUrl(options) })
  }
})

module.exports = {
  canonicalMenuSearchUrl
}
