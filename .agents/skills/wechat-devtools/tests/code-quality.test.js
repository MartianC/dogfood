'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  ASSET_LIMIT_BYTES,
  createCodeQualityChecker
} = require('../scripts/check-code-quality')

function createProject(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-code-quality-'))
  const project = path.join(root, 'project')
  fs.mkdirSync(project, { recursive: true })
  const projectConfig = {
    appid: 'touristappid',
    projectname: 'fixture',
    miniprogramRoot: './miniprogram',
    setting: {
      minified: true,
      minifyWXML: true,
      minifyWXSS: true,
      ...(options.setting || {})
    }
  }
  const appConfig = {
    pages: ['pages/home/index'],
    subpackages: [{ root: 'subpackages/feature', pages: ['index'] }],
    lazyCodeLoading: 'requiredComponents',
    ...(options.appConfig || {})
  }
  write(project, 'project.config.json', JSON.stringify(projectConfig))
  write(project, 'miniprogram/app.json', JSON.stringify(appConfig))
  write(project, 'miniprogram/app.js', 'App({})\n')
  write(project, 'miniprogram/pages/home/index.js', 'Page({})\n')
  write(project, 'miniprogram/pages/home/index.json', '{}\n')
  write(project, 'miniprogram/subpackages/feature/index.js', `
require('../../services/top')
require('../../services/child')
Page({})
`)
  write(project, 'miniprogram/subpackages/feature/index.json', JSON.stringify({
    usingComponents: {
      fixture: '/components/fixture/index'
    }
  }))
  write(project, 'miniprogram/services/top.js', `
module.exports = require('./child')
`)
  write(project, 'miniprogram/services/child.js', 'module.exports = {}\n')
  write(project, 'miniprogram/services/component-child.js', 'module.exports = {}\n')
  write(project, 'miniprogram/components/fixture/index.json', '{"component":true}\n')
  write(project, 'miniprogram/components/fixture/index.js', `
require('../../services/component-child')
Component({})
`)
  return { root, project }
}

function write(project, relativePath, content) {
  const file = path.join(project, relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function getRule(report, name) {
  return report.rules.find((rule) => rule.name === name)
}

test('主包 JS 规则遵循官方直接父依赖语义', (t) => {
  const fixture = createProject()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))

  const checker = createCodeQualityChecker(fixture.project)

  assert.deepEqual(checker.findOtherPackageJavaScript(), ['services/top.js'])
  const rule = getRule(checker.run(), 'CONTAINS_OTHER_PKG_JS')
  assert.equal(rule.status, 'fail')
  assert.deepEqual(rule.details, ['services/top.js'])
})

test('压缩和按需注入配置逐项映射官方规则', (t) => {
  const fixture = createProject({
    setting: { minified: false, minifyWXML: false, minifyWXSS: false },
    appConfig: { lazyCodeLoading: 'disabled' }
  })
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))

  const report = createCodeQualityChecker(fixture.project).run()

  assert.equal(getRule(report, 'JS_COMPRESS_OPEN').status, 'fail')
  assert.equal(getRule(report, 'WXML_COMPRESS_OPEN').status, 'fail')
  assert.equal(getRule(report, 'WXSS_COMPRESS_OPEN').status, 'fail')
  assert.equal(getRule(report, 'LAZYCODE_LOADING_OPEN').status, 'fail')
})

test('大资源和 AppSecret 只输出文件路径，不输出敏感值', (t) => {
  const fixture = createProject()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  write(
    fixture.project,
    'miniprogram/assets/oversize.png',
    Buffer.alloc(ASSET_LIMIT_BYTES + 1)
  )
  const secret = '0123456789abcdef0123456789abcdef'
  write(fixture.project, 'miniprogram/config/private.js', `appSecret = '${secret}'\n`)

  const report = createCodeQualityChecker(fixture.project).run()
  const assetRule = getRule(report, 'IMAGE_AND_AUDIO_LIMIT')
  const secretRule = getRule(report, 'CONTAINS_APPSECRET')

  assert.equal(assetRule.status, 'fail')
  assert.match(assetRule.details[0], /assets\/oversize\.png/)
  assert.equal(secretRule.status, 'fail')
  assert.deepEqual(secretRule.details, ['config/private.js'])
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret))
})

test('不存在 project.config.json 时关闭检查并报错', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-code-quality-missing-'))
  try {
    assert.throws(
      () => createCodeQualityChecker(root),
      /缺少 project\.config\.json/
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
