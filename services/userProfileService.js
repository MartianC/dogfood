function saveFileByManager(filePath) {
  return new Promise((resolve, reject) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || typeof manager.saveFile !== 'function') {
      resolve(filePath)
      return
    }
    manager.saveFile({
      tempFilePath: filePath,
      success: (result) => resolve(result.savedFilePath || filePath),
      fail: reject
    })
  })
}

function saveLocalAvatar(tempFilePath) {
  if (typeof wx === 'undefined') return Promise.resolve(tempFilePath)
  if (typeof wx.saveFile !== 'function') {
    return saveFileByManager(tempFilePath)
  }
  return new Promise((resolve, reject) => {
    wx.saveFile({
      tempFilePath,
      success: (result) => resolve(result.savedFilePath || tempFilePath),
      fail: reject
    })
  })
}

function safePathPart(value) {
  return String(value || 'current-user').replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function saveAvatar(tempFilePath, userId) {
  if (!tempFilePath) throw new Error('未获取到头像文件')
  if (
    typeof wx !== 'undefined'
    && wx.cloud
    && typeof wx.cloud.uploadFile === 'function'
  ) {
    try {
      const result = await wx.cloud.uploadFile({
        cloudPath: `user-avatars/${safePathPart(userId)}/avatar`,
        filePath: tempFilePath
      })
      if (result && result.fileID) return result.fileID
    } catch (error) {
      // 云存储不可用时仍保留本机头像，避免头像选择流程整体失败。
    }
  }
  return saveLocalAvatar(tempFilePath)
}

module.exports = {
  saveAvatar
}
