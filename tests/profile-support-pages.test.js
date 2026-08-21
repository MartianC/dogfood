const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function loadFeedbackPage({
  feedbackQrImage = 'https://example.com/feedback-qr.png',
  feedbackQrSource = 'cloud'
} = {}) {
  const source = fs.readFileSync(path.join(root, 'pages/profile/feedback/index.js'), 'utf8')
  let definition
  const previewCalls = []
  const context = {
    Page(page) {
      definition = page
    },
    require(request) {
      if (request === '../../../services/feedbackQrService') {
        return {
          getFeedbackQrFallbackImage: () => '/assets/profile/feedback-qr-fallback.jpg',
          resolveFeedbackQrImage: async () => ({
            imageUrl: feedbackQrImage,
            source: feedbackQrSource,
            error: null
          })
        }
      }
      throw new Error(`测试未提供依赖：${request}`)
    },
    wx: {
      previewImage(options) {
        previewCalls.push(options)
      }
    },
    module: { exports: {} },
    exports: {},
    Promise
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, {
    filename: 'pages/profile/feedback/index.js'
  })
  return { definition, previewCalls }
}

test('反馈二维码配置集中在单一入口，并注册相关页面', () => {
  const config = require('../config/profile')
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  assert.match(config.feedbackQrFileId, /^cloud:\/\//)
  assert.equal(config.feedbackQrFallbackImage, '/assets/profile/feedback-qr-fallback.jpg')
  assert.ok(fs.existsSync(path.join(root, 'assets/profile/feedback-qr-fallback.jpg')))
  assert.ok(appConfig.pages.includes('pages/profile/help/index'))
  assert.ok(appConfig.pages.includes('pages/profile/privacy/index'))
  assert.ok(appConfig.pages.includes('pages/profile/feedback/index'))
})

test('反馈二维码页使用配置图片并支持点击预览', () => {
  const { definition, previewCalls } = loadFeedbackPage({
    feedbackQrImage: 'https://example.com/feedback-qr.png'
  })
  let state = {
    ...definition.data,
    feedbackQrImage: 'https://example.com/feedback-qr.png',
    qrLoading: false
  }

  definition.onPreviewQr.call({
    data: state
  })

  assert.equal(previewCalls.length, 1)
  assert.equal(previewCalls[0].current, 'https://example.com/feedback-qr.png')
  assert.equal(previewCalls[0].urls[0], 'https://example.com/feedback-qr.png')

  definition.onQrError.call({
    data: state,
    setData(next) {
      state = { ...state, ...next }
    }
  })
  assert.equal(state.feedbackQrImage, '/assets/profile/feedback-qr-fallback.jpg')
  assert.equal(state.qrUsingFallback, true)
  assert.equal(state.qrLoadError, false)

  definition.onQrError.call({
    data: state,
    setData(next) {
      state = { ...state, ...next }
    }
  })
  assert.equal(state.qrLoadError, true)
})
