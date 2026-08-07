'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const {
  iconStyles,
  iconTemplate,
  patchIconDirectory
} = require('../scripts/patch-tdesign-icons')

const iconAssets = [
  'add.svg',
  'add-circle-primary.svg',
  'check-circle-filled.svg',
  'chevron-down.svg',
  'chevron-left.svg',
  'chevron-left-double.svg',
  'chevron-right.svg',
  'chevron-right-double.svg',
  'chevron-up.svg',
  'close.svg',
  'close-circle-filled.svg',
  'close-primary.svg',
  'minus-circle-warning.svg',
  'search.svg'
]

test('当前使用的 TDesign 图标都有独立 SVG 资源', () => {
  for (const file of iconAssets) {
    const asset = path.join(root, 'assets', 'icons', 'tdesign', file)
    assert.ok(fs.existsSync(asset), `${file} 不存在`)
    assert.ok(fs.statSync(asset).size < 10 * 1024, `${file} 不应超过 10 K`)
  }
})

test('业务适配层不再直接引用 TDesign Icon', () => {
  const files = [
    'components/ui/ui-tag/index.json',
    'components/ui/ui-tag/index.wxml',
    'components/vendor/recipe-menu-indicator/index.json',
    'components/vendor/recipe-menu-indicator/index.wxml'
  ]
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(content, /tdesign-miniprogram\/icon|<t-icon\b/)
  }
})

test('TDesign Icon 补丁只渲染本地 SVG 并删除字体包', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-tdesign-icon-'))
  try {
    fs.writeFileSync(path.join(directory, 'tdesign-icon.woff'), 'font')
    assert.equal(patchIconDirectory(directory), true)
    assert.equal(fs.readFileSync(path.join(directory, 'icon.wxml'), 'utf8'), iconTemplate)
    assert.equal(fs.readFileSync(path.join(directory, 'icon.wxss'), 'utf8'), iconStyles)
    assert.doesNotMatch(iconStyles, /@font-face|\.woff/)
    assert.match(iconTemplate, /\/assets\/icons\/tdesign\//)
    assert.equal(fs.existsSync(path.join(directory, 'tdesign-icon.woff')), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('安装依赖后会自动应用 TDesign Icon 补丁', () => {
  const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageConfig.scripts.postinstall, 'npm run prepare:tdesign-icons')
  assert.equal(packageConfig.scripts['prepare:tdesign-icons'], 'node scripts/patch-tdesign-icons.js')
})
