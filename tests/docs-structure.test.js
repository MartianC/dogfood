const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.join(__dirname, '..')

test('产品文档和设计稿集中存放在 docs 目录', () => {
  const rootDocFiles = fs.readdirSync(rootDir).filter((file) => /\.(md|html)$/i.test(file))
  assert.deepEqual(rootDocFiles, ['.impeccable.md', 'AGENTS.md', 'CLAUDE.md'])

  const expectedDocs = [
    'README.md',
    '基础功能.md',
    '小程序架构设计.md',
    '微信小程序设计文档.md',
    '微信开发者工具代码质量扫描修复记录.md',
    '狗饭小程序完整界面稿-批量制作版.html',
    '狗饭小程序设计审核.md'
  ]

  expectedDocs.forEach((file) => {
    assert.ok(fs.existsSync(path.join(rootDir, 'docs', file)), `docs/${file} 不存在`)
  })
})

test('docs 目录不进入小程序运行包', () => {
  const projectConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'project.config.json'), 'utf8'))
  const ignoredFolders = (projectConfig.packOptions.ignore || [])
    .filter((item) => item.type === 'folder')
    .map((item) => item.value)

  assert.ok(ignoredFolders.includes('docs'))
})

test('HTML 设计稿使用 docs 内设计资产', () => {
  const htmlPath = path.join(rootDir, 'docs', '狗饭小程序完整界面稿-批量制作版.html')
  const html = fs.readFileSync(htmlPath, 'utf8')
  const imageRefs = Array.from(html.matchAll(/src="(design-assets\/[^"]+)"/g)).map((match) => match[1])

  assert.ok(imageRefs.length > 0)
  assert.doesNotMatch(html, /\.design-assets\//)

  imageRefs.forEach((ref) => {
    const assetPath = path.join(rootDir, 'docs', ref)
    assert.ok(fs.existsSync(assetPath), `${ref} 不存在`)
    assert.ok(fs.statSync(assetPath).size > 0, `${ref} 是空文件`)
  })
})
