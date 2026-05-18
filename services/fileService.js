async function getTempUrl(fileId) {
  if (!fileId) return ''
  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.getTempFileURL) {
    const result = await wx.cloud.getTempFileURL({ fileList: [fileId] })
    return result.fileList && result.fileList[0] ? result.fileList[0].tempFileURL : ''
  }
  return fileId
}

function saveFileByManager(filePath) {
  return new Promise((resolve) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!manager || !manager.saveFile) {
      resolve(filePath)
      return
    }
    manager.saveFile({
      tempFilePath: filePath,
      success: (res) => resolve(res.savedFilePath || filePath),
      fail: () => resolve(filePath)
    })
  })
}

async function saveLocalImage(tempFilePath) {
  if (!tempFilePath) return ''
  if (typeof wx === 'undefined') return tempFilePath
  if (typeof wx.saveFile === 'function') {
    return new Promise((resolve) => {
      wx.saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath || tempFilePath),
        fail: async () => resolve(await saveFileByManager(tempFilePath))
      })
    })
  }
  return saveFileByManager(tempFilePath)
}

function chooseLocalImage() {
  if (typeof wx === 'undefined') return Promise.resolve('')
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => resolve(res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : ''),
        fail: reject
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => resolve(res.tempFilePaths && res.tempFilePaths[0] ? res.tempFilePaths[0] : ''),
      fail: reject
    })
  })
}

module.exports = {
  getTempUrl,
  saveLocalImage,
  chooseLocalImage
}
