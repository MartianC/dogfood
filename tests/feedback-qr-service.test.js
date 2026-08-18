const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveFeedbackQrImage } = require('../services/feedbackQrService')

test('未配置 CloudBase fileID 时使用占位图', async () => {
  const result = await resolveFeedbackQrImage({
    fileId: '',
    fallbackImage: '/assets/profile/feedback-qr-placeholder.svg'
  })

  assert.deepEqual(result, {
    imageUrl: '/assets/profile/feedback-qr-placeholder.svg',
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

test('CloudBase 文件不可用时返回错误状态，不显示旧二维码', async () => {
  const result = await resolveFeedbackQrImage({
    fileId: 'cloud://env.bucket/profile/feedback-qr.png',
    cloud: {
      async getTempFileURL() {
        return {
          fileList: [{ status: 404, errMsg: 'file not found' }]
        }
      }
    }
  })

  assert.equal(result.imageUrl, '')
  assert.equal(result.source, 'cloud')
  assert.equal(result.error.message, 'file not found')
})
