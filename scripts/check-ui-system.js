#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const errors = []
const forbiddenClassNames = [
  'hero',
  'title',
  'subtitle',
  'section-title',
  'link',
  'card',
  'row',
  'tag',
  'button',
  'notice',
  'field',
  'input',
  'metric',
]
const forbiddenWxmlClassNames = forbiddenClassNames
const thirdPartyTags = [
  { library: 'TDesign', pattern: /<\s*t-[a-z0-9-]+/gi },
  { library: 'Vant', pattern: /<\s*van-[a-z0-9-]+/gi },
  { library: 'WeUI', pattern: /<\s*weui-[a-z0-9-]+/gi },
]
const allowedRawColorFiles = new Set([
  path.normalize('styles/tokens.wxss'),
])
const expectedSharedMealWorkPackages = {
  menuSearch: {
    designTaskId: 'D1.1',
    implementationTaskIds: ['F1.2', 'F1.3', 'F1.4', 'F1.5', 'F1.6', 'F1.7'],
    states: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D14'],
  },
  composeSources: {
    designTaskId: 'D2.1',
    implementationTaskIds: ['F2.2', 'F2.3', 'F2.4'],
    states: ['V01', 'V02', 'V03', 'V04', 'V05', 'V06'],
  },
  draftRecovery: {
    designTaskId: 'D3.1',
    implementationTaskIds: ['F3.2', 'F3.3'],
    states: ['R01', 'R02', 'R03', 'R04', 'R05'],
  },
  recordListAndDetail: {
    designTaskId: 'D4.1',
    implementationTaskIds: ['F4.3', 'F4.5', 'F4.6'],
    states: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'R01', 'R02', 'R03', 'R04'],
  },
}

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
    normalizedPath.startsWith(path.normalize('components/vendor/')) ||
    normalizedPath.startsWith(path.normalize('custom-tab-bar/'))
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

function collectSharedMealFigmaEvidenceErrors(evidence, projectRoot = root) {
  const findings = []
  const add = (message) => findings.push(`共享本餐 Figma 证据：${message}`)
  if (!evidence || evidence.contract !== 'sharedMealFigmaImplementationEvidence/v1') {
    add('契约版本无效')
    return findings
  }
  const packages = evidence.workPackages || {}
  for (const [name, expected] of Object.entries(expectedSharedMealWorkPackages)) {
    const item = packages[name]
    if (!item) {
      add(`${name} 缺少工作包`)
      continue
    }
    if (item.designTaskId !== expected.designTaskId
      || JSON.stringify(item.implementationTaskIds) !== JSON.stringify(expected.implementationTaskIds)) {
      add(`${name} 的任务范围不正确`)
    }
    const source = item.source || {}
    if (!source.fileKey || !source.pageNodeId || !Array.isArray(source.frameNodeIds) || source.frameNodeIds.length === 0) {
      add(`${name} 缺少 Figma file/page/frame node`)
    }
    if (!Number.isFinite(Number(source.frameWidthPx)) || Number(source.frameWidthPx) <= 0
      || !source.targetViewport || !Number.isFinite(Number(source.targetViewport.width))
      || !Number.isFinite(Number(source.targetViewport.height))) {
      add(`${name} 缺少有效的 frame 或目标 viewport 尺寸`)
    }
    if (!item.confirmation || item.confirmation.status !== 'confirmed') {
      add(`${name} 的用户确认状态必须为 confirmed`)
    }
    if (!item.confirmation || !item.confirmation.date || item.confirmation.confirmedBy !== 'user') {
      add(`${name} 缺少用户确认日期或确认人`)
    }
    if (!item.confirmation || !item.confirmation.notesMarker) {
      add(`${name} 缺少用户确认交接记录定位`)
    }
    if (!Array.isArray(item.tokenMap) || item.tokenMap.length === 0) {
      add(`${name} 缺少 token map`)
    } else {
      const tokenText = fs.readFileSync(path.join(projectRoot, 'styles/tokens.wxss'), 'utf8')
      item.tokenMap.forEach((mapping) => {
        if (!mapping.figma || !mapping.target || !tokenText.includes(`${mapping.target}:`)) {
          add(`${name} 存在无效 token map`)
        }
      })
    }
    if (!Array.isArray(item.componentMap) || item.componentMap.length === 0) {
      add(`${name} 缺少 component map`)
    } else {
      item.componentMap.forEach((mapping) => {
        if (!mapping.figma || !mapping.target || !fs.existsSync(path.join(projectRoot, mapping.target))) {
          add(`${name} 存在无效 component map`)
        }
      })
    }
    const validation = item.visualValidation || {}
    if (validation.status !== 'passed') add(`${name} 的视觉验收状态必须为 passed`)
    const screenshot = validation.screenshotEvidence
    if (!screenshot || screenshot.method !== 'wechat-devtools' || screenshot.result !== 'passed'
      || JSON.stringify(screenshot.comparedFrameNodeIds) !== JSON.stringify(source.frameNodeIds)) {
      add(`${name} 缺少截图比对证据`)
    }
    if (JSON.stringify(validation.states) !== JSON.stringify(expected.states)) {
      add(`${name} 的视觉验收状态覆盖不完整`)
    }
    if (Array.isArray(source.frameNodeIds) && source.frameNodeIds.length !== expected.states.length) {
      add(`${name} 的 frame 与验收状态无法一一对应`)
    }
    if (!validation.date || validation.artifactPolicy !== 'reviewed-then-deleted') {
      add(`${name} 缺少视觉验收日期或临时截图清理策略`)
    }
    if (!validation.implementationNotesSection) {
      add(`${name} 缺少设计交接文档定位`)
    }
  }
  const extraPackages = Object.keys(packages).filter((name) => !expectedSharedMealWorkPackages[name])
  if (extraPackages.length) add(`包含计划外工作包：${extraPackages.join(', ')}`)
  return [...new Set(findings)].sort()
}

function validateSharedMealFigmaEvidence() {
  const rel = 'docs/ui/shared-meal-figma-implementation-evidence.json'
  const evidence = readJsonIfExists(rel)
  if (!evidence) {
    report(rel + ': 缺少共享本餐四个 UI 工作包的机器证据')
    return
  }
  collectSharedMealFigmaEvidenceErrors(evidence, root).forEach(report)
  const notesPath = path.join(root, 'docs/ui/figma-implementation-notes.md')
  const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : ''
  Object.entries(evidence.workPackages || {}).forEach(([name, item]) => {
    const markers = [
      item.confirmation && item.confirmation.notesMarker,
      item.visualValidation && item.visualValidation.implementationNotesSection,
    ].filter(Boolean)
    if (markers.some((marker) => !notes.includes(marker))) {
      report(`共享本餐 Figma 证据：${name} 的设计交接章节不存在`)
    }
  })
}

function main() {
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
validateSharedMealFigmaEvidence()

const uniqueErrors = [...new Set(errors)].sort()

if (uniqueErrors.length) {
  console.error(uniqueErrors.map((item) => '- ' + item).join('\n'))
  process.exit(1)
}

console.log('UI system checks passed.')
}

if (require.main === module) main()

module.exports = { collectSharedMealFigmaEvidenceErrors }
