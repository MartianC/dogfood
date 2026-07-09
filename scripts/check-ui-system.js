#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = process.cwd()
const errors = []
const baselinePath = path.join(root, 'scripts/check-ui-baseline.json')
const shouldUpdateBaseline = process.argv.includes('--update-baseline')
const forbiddenClassNames = ['button', 'card', 'tag', 'notice', 'title', 'row', 'input']
const forbiddenWxmlClassNames = ['button', 'card', 'tag', 'notice', 'input']
const thirdPartyTags = [
  { library: 'TDesign', pattern: /<\s*t-[a-z0-9-]+/gi },
  { library: 'Vant', pattern: /<\s*van-[a-z0-9-]+/gi },
  { library: 'WeUI', pattern: /<\s*weui-[a-z0-9-]+/gi },
]
const allowedRawColorFiles = new Set([
  path.normalize('styles/tokens.wxss'),
])

function report(message) {
  errors.push(message)
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function uniqueMatches(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[0]))]
}

function canUseThirdPartyTags(normalizedPath) {
  return normalizedPath.startsWith(path.normalize('components/ui/')) ||
    normalizedPath.startsWith(path.normalize('components/vendor/'))
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'miniprogram_npm') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

function readJsonIfExists(rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (error) {
    report(rel + ': JSON 格式无效，' + error.message)
    return null
  }
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const issues = Array.isArray(data) ? data : data.issues
    return new Set(Array.isArray(issues) ? issues : [])
  } catch (error) {
    report('scripts/check-ui-baseline.json: JSON 格式无效，' + error.message)
    return new Set()
  }
}

function isMapped(item) {
  return !item.status || item.status === 'mapped'
}

function validateFigmaSourceManifest() {
  const rel = 'docs/ui/figma-source-manifest.json'
  const manifest = readJsonIfExists(rel)
  if (!manifest) return
  if (manifest.status === 'draft') return
  if (!manifest.fileKey) report(rel + ': 缺少 fileKey')
  if (!manifest.nodeId) report(rel + ': 缺少 nodeId')
  if (!Number.isFinite(Number(manifest.frameWidthPx)) || Number(manifest.frameWidthPx) <= 0) {
    report(rel + ': frameWidthPx 必须是正数')
  }
}

function validateFigmaTokenMap() {
  const rel = 'docs/ui/figma-token-map.json'
  const data = readJsonIfExists(rel)
  if (!data) return
  const tokens = Array.isArray(data) ? data : data.tokens
  if (!Array.isArray(tokens)) {
    report(rel + ': tokens 必须是数组')
    return
  }
  const tokenFile = path.join(root, 'styles/tokens.wxss')
  const tokenText = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : ''
  for (const [index, token] of tokens.entries()) {
    if (!token || typeof token !== 'object') {
      report(rel + ': tokens[' + index + '] 必须是对象')
      continue
    }
    if (!isMapped(token)) continue
    for (const field of ['name', 'type', 'target', 'value']) {
      if (token[field] === undefined || token[field] === '') {
        report(rel + ': tokens[' + index + '] 缺少 ' + field)
      }
    }
    if (token.target && !String(token.target).startsWith('--')) {
      report(rel + ': tokens[' + index + '] target 必须以 -- 开头')
    }
    if (tokenText && token.target && !tokenText.includes(String(token.target) + ':')) {
      report(rel + ': ' + token.target + ' 未写入 styles/tokens.wxss')
    }
  }
}

function validateFigmaComponentMap() {
  const rel = 'docs/ui/figma-component-map.json'
  const data = readJsonIfExists(rel)
  if (!data) return
  const mappings = Array.isArray(data)
    ? data
    : Array.isArray(data.mappings)
      ? data.mappings
      : Object.entries(data).map(([name, value]) => ({ name, ...value }))
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== 'object') {
      report(rel + ': mapping[' + index + '] 必须是对象')
      continue
    }
    if (!isMapped(mapping)) continue
    if (!mapping.target) {
      report(rel + ': mapping[' + index + '] 缺少 target')
      continue
    }
    if (!fs.existsSync(path.join(root, mapping.target))) {
      report(rel + ': ' + mapping.target + ' 不存在')
    }
  }
}

for (const file of walk(root)) {
  const rel = path.relative(root, file)
  const normalized = path.normalize(rel)
  if (!/\.(wxss|wxml)$/.test(rel)) continue
  const text = fs.readFileSync(file, 'utf8')

  if (rel.endsWith('.wxml') && !canUseThirdPartyTags(normalized)) {
    for (const { library, pattern } of thirdPartyTags) {
      pattern.lastIndex = 0
      const count = countMatches(text, pattern)
      if (count) {
        report(rel + ': 禁止页面或业务组件直接使用 ' + library + ' 标签 ' + count + ' 处，请先包装到 components/ui/* 或 components/vendor/*')
      }
    }
    const buttonCount = countMatches(text, /<\s*button\b/gi)
    if (buttonCount) {
      report(rel + ': 页面或业务组件不应直接实现基础按钮 ' + buttonCount + ' 处，请使用 ui-button 或组件库 wrapper')
    }
    for (const name of forbiddenWxmlClassNames) {
      const classRe = new RegExp('class\\s*=\\s*["\'][^"\']*(^|\\s)' + name + '(\\s|$)[^"\']*["\']', 'gi')
      const count = countMatches(text, classRe)
      if (count) {
        report(rel + ': WXML 不应继续使用基础类 ' + name + ' ' + count + ' 处，请迁移到 ui-* 组件')
      }
    }
  }

  if (rel.endsWith('.wxss') && !allowedRawColorFiles.has(normalized)) {
    const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g
    const rawColors = uniqueMatches(text, rawColorPattern)
    const count = countMatches(text, rawColorPattern)
    if (count) {
      report(rel + ': 避免直接写颜色 ' + rawColors.join(', ') + '，共 ' + count + ' 处，请先加到 styles/tokens.wxss')
    }
  }

  if (rel.endsWith('.wxss')) {
    for (const name of forbiddenClassNames) {
      const re = new RegExp('(^|\\n)\\s*\\.' + name + '(\\s|[.{:#,>+~])', 'g')
      const count = countMatches(text, re)
      if (count) {
        report(rel + ': 禁止新增全局泛名 .' + name + ' ' + count + ' 处，请使用 ui-* 或业务前缀')
      }
    }
  }
}

validateFigmaSourceManifest()
validateFigmaTokenMap()
validateFigmaComponentMap()

const uniqueErrors = [...new Set(errors)].sort()

if (shouldUpdateBaseline) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      description: '迁移期 UI 检查 baseline。只允许记录未迁移文件的既有问题，完成迁移后删除 issues。',
      issues: uniqueErrors,
    }, null, 2) + '\n',
  )
  console.log('UI baseline updated: ' + uniqueErrors.length + ' issue(s).')
  process.exit(0)
}

const baseline = readBaseline()
const unexpected = uniqueErrors.filter((item) => !baseline.has(item))

if (unexpected.length) {
  console.error(unexpected.map((item) => '- ' + item).join('\n'))
  process.exit(1)
}

const legacyCount = uniqueErrors.filter((item) => baseline.has(item)).length
console.log('UI system checks passed. Legacy baseline issue(s): ' + legacyCount + '.')
