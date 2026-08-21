const profileConfig = require('../config/profile')

function createFallbackResult(fallbackImage, error = null) {
  return {
    imageUrl: fallbackImage,
    source: 'fallback',
    error
  }
}

function getCloudApi() {
  if (typeof wx === 'undefined' || !wx.cloud) return null
  return wx.cloud
}

async function resolveFeedbackQrImage({
  fileId = profileConfig.feedbackQrFileId,
  fallbackImage = profileConfig.feedbackQrFallbackImage,
  cloud = getCloudApi()
} = {}) {
  if (!fileId) {
    return createFallbackResult(fallbackImage)
  }

  if (!cloud || typeof cloud.getTempFileURL !== 'function') {
    return createFallbackResult(fallbackImage, new Error('CloudBase 云存储不可用'))
  }

  try {
    const result = await cloud.getTempFileURL({ fileList: [fileId] })
    const file = result && Array.isArray(result.fileList) ? result.fileList[0] : null
    const imageUrl = file && file.tempFileURL ? file.tempFileURL : ''
    if (!imageUrl || (file && file.status !== undefined && Number(file.status) !== 0)) {
      return createFallbackResult(
        fallbackImage,
        new Error(file && file.errMsg ? file.errMsg : '二维码文件不存在')
      )
    }
    return {
      imageUrl,
      source: 'cloud',
      error: null
    }
  } catch (error) {
    return createFallbackResult(fallbackImage, error)
  }
}

function getFeedbackQrFallbackImage() {
  return profileConfig.feedbackQrFallbackImage
}

module.exports = {
  getFeedbackQrFallbackImage,
  resolveFeedbackQrImage
}
