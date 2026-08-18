const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function loadFeedbackPage({ feedbackQrImage = '/assets/profile/feedback-qr-placeholder.svg' } = {}) {
  const source = fs.readFileSync(path.join(root, 'pages/profile/feedback/index.js'), 'utf8')
  let definition
  const previewCalls = []
  const context = {
    Page(page) {
      definition = page
    },
    require(request) {
      if (request === '../../../config/profile') return { feedbackQrImage }
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

  assert.equal(config.feedbackQrImage, '/assets/profile/feedback-qr-placeholder.svg')
  assert.ok(fs.existsSync(path.join(root, 'assets/profile/feedback-qr-placeholder.svg')))
  assert.ok(appConfig.pages.includes('pages/profile/help/index'))
  assert.ok(appConfig.pages.includes('pages/profile/privacy/index'))
  assert.ok(appConfig.pages.includes('pages/profile/feedback/index'))
})

test('反馈二维码页使用配置图片并支持点击预览', () => {
  const { definition, previewCalls } = loadFeedbackPage({
    feedbackQrImage: 'https://example.com/feedback-qr.png'
  })
  let state = { ...definition.data }

  definition.onPreviewQr.call({
    data: state
  })

  assert.equal(previewCalls.length, 1)
  assert.equal(previewCalls[0].current, 'https://example.com/feedback-qr.png')
  assert.equal(previewCalls[0].urls[0], 'https://example.com/feedback-qr.png')

  definition.onQrError.call({
    setData(next) {
      state = { ...state, ...next }
    }
  })
  assert.equal(state.qrLoadError, true)
})
