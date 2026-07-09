#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)

function readFlag(name) {
  return args.includes(name)
}

function readValue(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1 || index === args.length - 1) return fallback
  return args[index + 1]
}

function printHelp() {
  console.log(`Usage:
  node scripts/figma-tokens-to-wxss.js --input figma-variables.json --output styles/tokens.wxss [options]

Options:
  --prefix <name>        Token prefix, default: mp
  --frame-width <px>     Figma frame width, default: 375
  --dry-run              Print generated WXSS without writing
  --force                Overwrite output when it already exists`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function normalizePrefix(value) {
  const normalized = String(value || 'mp')
    .trim()
    .replace(/^--/, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return normalized || 'mp'
}

function slug(value) {
  return String(value || 'token')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'token'
}

function trimNumber(value) {
  const fixed = Number(value.toFixed(3))
  return Number.isInteger(fixed) ? String(fixed) : String(fixed)
}

function pxToRpx(value, frameWidth) {
  return `${trimNumber((Number(value) * 750) / frameWidth)}rpx`
}

function figmaColorToCss(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const source = value.color && typeof value.color === 'object' ? value.color : value
  if (typeof source.r !== 'number' || typeof source.g !== 'number' || typeof source.b !== 'number') return ''
  const r = Math.round(source.r * 255)
  const g = Math.round(source.g * 255)
  const b = Math.round(source.b * 255)
  const alpha = typeof source.a === 'number' ? source.a : 1
  if (alpha < 1) return `rgba(${r}, ${g}, ${b}, ${trimNumber(alpha)})`
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

function inferType(raw) {
  const type = String(raw.type || raw.$type || raw.resolvedType || raw.variableResolvedDataType || '').toLowerCase()
  if (type.includes('color')) return 'color'
  if (type.includes('radius')) return 'radius'
  if (type.includes('space')) return 'spacing'
  if (type.includes('dimension') || type.includes('float')) return 'dimension'
  if (type.includes('font')) return 'font'
  if (type.includes('shadow') || type.includes('effect')) return 'shadow'
  if (type.includes('opacity')) return 'opacity'
  const name = String(raw.name || '')
  if (/color|colour|fill|bg|text/i.test(name)) return 'color'
  if (/radius|corner/i.test(name)) return 'radius'
  if (/space|spacing|gap|padding|margin/i.test(name)) return 'spacing'
  if (/font|size|text/i.test(name)) return 'font'
  return 'dimension'
}

function firstModeValue(raw) {
  if (raw.value !== undefined) return raw.value
  if (raw.$value !== undefined) return raw.$value
  if (raw.valuesByMode && typeof raw.valuesByMode === 'object') {
    const firstKey = Object.keys(raw.valuesByMode)[0]
    return raw.valuesByMode[firstKey]
  }
  return undefined
}

function normalizeValue(raw, type, frameWidth) {
  const value = firstModeValue(raw)
  if (type === 'color') return figmaColorToCss(value)
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') {
    if (type === 'opacity') return trimNumber(value)
    return pxToRpx(value, frameWidth)
  }
  if (typeof value === 'string') {
    const pxMatch = value.trim().match(/^(-?\\d+(?:\\.\\d+)?)px$/)
    if (pxMatch) return pxToRpx(Number(pxMatch[1]), frameWidth)
    return value
  }
  return JSON.stringify(value)
}

function normalizeTarget(raw, type, prefix) {
  const explicit = raw.target || raw.name && String(raw.name).startsWith('--') ? raw.target || raw.name : ''
  if (explicit) {
    const target = String(explicit)
    return target.startsWith('--') ? target.replace(/^--[^-]+-/, `--${prefix}-`) : target
  }
  const category = type === 'dimension' ? 'space' : type
  return `--${prefix}-${category}-${slug(raw.name || raw.id || 'token')}`
}

function normalizeToken(raw, prefix, frameWidth) {
  const type = inferType(raw)
  return {
    name: String(raw.name || raw.id || ''),
    type,
    mode: String(raw.mode || 'default'),
    value: normalizeValue(raw, type, frameWidth),
    target: normalizeTarget(raw, type, prefix),
    status: String(raw.status || 'mapped'),
  }
}

function extractTokens(input) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.tokens)) return input.tokens
  if (Array.isArray(input.variables)) return input.variables
  if (input.variables && typeof input.variables === 'object') {
    return Object.entries(input.variables).map(([id, variable]) => ({ id, ...variable }))
  }
  if (input.meta && input.meta.variables && typeof input.meta.variables === 'object') {
    return Object.entries(input.meta.variables).map(([id, variable]) => ({ id, ...variable }))
  }
  fail('输入 JSON 中未找到 tokens 或 variables。')
}

function buildWxss(tokens) {
  const mapped = tokens.filter((token) => token.status !== 'ignored' && token.target && token.value)
  if (!mapped.length) fail('没有可输出的 mapped token。')
  const lines = ['page {']
  for (const token of mapped) {
    lines.push(`  ${token.target}: ${token.value};`)
  }
  lines.push('}', '')
  return lines.join('\n')
}

if (readFlag('--help') || readFlag('-h')) {
  printHelp()
  process.exit(0)
}

const inputPath = readValue('--input', '')
const outputPath = readValue('--output', '')
const dryRun = readFlag('--dry-run')
const force = readFlag('--force')
const prefix = normalizePrefix(readValue('--prefix', 'mp'))
const frameWidth = Number(readValue('--frame-width', '375'))

if (!inputPath) fail('缺少 --input。')
if (!outputPath && !dryRun) fail('缺少 --output，或使用 --dry-run。')
if (!Number.isFinite(frameWidth) || frameWidth <= 0) fail('--frame-width 必须是正数。')
if (!fs.existsSync(inputPath)) fail(`输入文件不存在：${inputPath}`)

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const tokens = extractTokens(input).map((token) => normalizeToken(token, prefix, frameWidth))
const wxss = buildWxss(tokens)

if (dryRun) {
  process.stdout.write(wxss)
  process.exit(0)
}

if (fs.existsSync(outputPath) && !force) {
  fail(`输出文件已存在：${outputPath}。如需覆盖，使用 --force。`)
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, wxss)
console.log(`Generated ${outputPath}`)
