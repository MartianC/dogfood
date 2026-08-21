const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveFeedbackQrImage } = require('../services/feedbackQrService')

test('未配置 CloudBase fileID 时使用本地回退二维码', async () => {
  const result = await resolveFeedbackQrImage({
    fileId: '',
    fallbackImage: '/assets/profile/feedback-qr-fallback.webp'
  })

  assert.deepEqual(result, {
    imageUrl: '/assets/profile/feedback-qr-fallback.webp',
    source: 'fallback',
    error: null
  })
})

test('通过 CloudBase fileID 换取二维码临时链接', async () => {
  const calls = []
  const result = await resolveFeedbackQrImage({
    fileId: 'cloud://env.bucket/profile/feedback-qr.png',
    cloud: {
      async getTempFileURL(options) {
        calls.push(options)
        return {
          fileList: [{
            fileID: options.fileList[0],
            tempFileURL: 'https://storage.example.com/feedback-qr.png'
          }]
        }
      }
    }
  })

  assert.deepEqual(calls, [{ fileList: ['cloud://env.bucket/profile/feedback-qr.png'] }])
  assert.equal(result.imageUrl, 'https://storage.example.com/feedback-qr.png')
  assert.equal(result.source, 'cloud')
  assert.equal(result.error, null)
})

test('CloudBase 文件不可用时使用本地回退二维码并保留错误状态', async () => {
  const result = await resolveFeedbackQrImage({
    fileId: 'cloud://env.bucket/profile/feedback-qr.png',
    fallbackImage: '/assets/profile/feedback-qr-fallback.webp',
    cloud: {
      async getTempFileURL() {
        return {
          fileList: [{ status: 404, errMsg: 'file not found' }]
        }
      }
    }
  })

  assert.equal(result.imageUrl, '/assets/profile/feedback-qr-fallback.webp')
  assert.equal(result.source, 'fallback')
  assert.equal(result.error.message, 'file not found')
})
