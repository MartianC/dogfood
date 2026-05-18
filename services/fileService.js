async function getTempUrl(fileId) {
  if (!fileId) return ''
  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.getTempFileURL) {
    const result = await wx.cloud.getTempFileURL({ fileList: [fileId] })
    return result.fileList && result.fileList[0] ? result.fileList[0].tempFileURL : ''
  }
  return fileId
}

module.exports = {
  getTempUrl
}
