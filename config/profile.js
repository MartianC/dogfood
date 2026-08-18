// 反馈二维码的 CloudBase fileID。首次配置并发布后，后台覆盖同一路径即可替换图片。
// 例如：cloud://环境ID.bucket/profile/feedback-qr.png
const feedbackQrFileId = 'cloud://cloud1-d4gm1emm8c33e9298.636c-cloud1-d4gm1emm8c33e9298-1452165356/feedback-qr.jpg'
const feedbackQrFallbackImage = '/assets/profile/feedback-qr-placeholder.svg'

module.exports = {
  feedbackQrFileId,
  feedbackQrFallbackImage
}
