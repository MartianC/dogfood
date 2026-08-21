const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function readPage(extension) {
  return fs.readFileSync(path.join(root, 'pages/profile/avatar-edit', `index.${extension}`), 'utf8')
}

function loadPageDefinition() {
  const file = path.join(root, 'pages/profile/avatar-edit/index.js')
  let definition
  const previousPage = global.Page
  global.Page = (config) => { definition = config }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = previousPage
  return definition
}

test('头像编辑页提供拖动、双指缩放、滑杆缩放和压缩导出', () => {
  const wxml = readPage('wxml')
  const js = readPage('js')
  const json = JSON.parse(readPage('json'))

  assert.equal(json.navigationBarTitleText, '编辑头像')
  assert.match(wxml, /bindtouchstart="onTouchStart"/)
  assert.match(wxml, /bindtouchmove="onTouchMove"/)
  assert.match(wxml, /bindchange="onScaleChange"/)
  assert.match(wxml, /bind:tap="onConfirm"/)
  assert.match(js, /canvasToTempFilePath/)
  assert.match(js, /destWidth:\s*OUTPUT_SIZE/)
  assert.match(js, /destHeight:\s*OUTPUT_SIZE/)
  assert.match(js, /fileType:\s*'jpg'/)
  assert.match(js, /quality:\s*OUTPUT_QUALITY/)
  assert.match(js, /avatarEdited/)
})

test('头像编辑页缩放时以裁剪框中心为锚点并限制缩放范围', () => {
  const definition = loadPageDefinition()
  const context = {
    data: { canvasSize: 300, processing: false },
    transform: {
      baseScale: 1,
      scale: 1,
      x: -20,
      y: -10
    },
    imageInfo: { width: 340, height: 320 },
    setData(patch) { Object.assign(this.data, patch) },
    drawCanvas() {},
    getScaleBounds: definition.getScaleBounds,
    clampTransform: definition.clampTransform
  }

  definition.onScaleChange.call(context, { detail: { value: 350 } })
  assert.equal(context.data.scalePercent, 350)
  assert.equal(context.transform.scale, 3.5)
  assert.equal(context.transform.x, -445)
  assert.equal(context.transform.y, -410)

  definition.onScaleChange.call(context, { detail: { value: 20 } })
  assert.equal(context.data.scalePercent, 100)
  assert.equal(context.transform.scale, 1)
})
