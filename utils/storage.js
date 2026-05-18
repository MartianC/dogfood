const memoryStore = {}

function hasWxStorage() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function'
}

function getSync(key, fallback = null) {
  if (hasWxStorage()) {
    const value = wx.getStorageSync(key)
    return value === '' || value === undefined ? fallback : value
  }
  return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : fallback
}

function setSync(key, value) {
  if (hasWxStorage()) {
    wx.setStorageSync(key, value)
    return value
  }
  memoryStore[key] = value
  return value
}

function removeSync(key) {
  if (hasWxStorage()) {
    wx.removeStorageSync(key)
    return
  }
  delete memoryStore[key]
}

function getCache(key, maxAgeMs) {
  const cache = getSync(key)
  if (!cache || !cache.updatedAt) return null
  if (maxAgeMs && Date.now() - new Date(cache.updatedAt).getTime() > maxAgeMs) return null
  return cache
}

function setCache(key, items) {
  return setSync(key, { items, updatedAt: new Date().toISOString() })
}

module.exports = {
  getSync,
  setSync,
  removeSync,
  getCache,
  setCache
}
