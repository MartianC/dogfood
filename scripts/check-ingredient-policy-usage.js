#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const astScanner = String.raw`
const fs = require('node:fs')
const acorn = require('internal/deps/acorn/acorn/dist/acorn')
const sources = JSON.parse(fs.readFileSync(0, 'utf8'))
const violations = []

function isPolicyName(value) {
  return value === 'policyStatus' || value === 'policy_status'
}

function containsPolicyReference(node) {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'Identifier' && isPolicyName(node.name)) return true
  if (node.type === 'MemberExpression') {
    const propertyName = node.computed
      ? node.property && node.property.value
      : node.property && node.property.name
    if (isPolicyName(propertyName)) return true
  }
  if (node.type === 'Literal' || node.type === 'TemplateElement') return false
  return Object.values(node).some((value) => (
    Array.isArray(value)
      ? value.some(containsPolicyReference)
      : containsPolicyReference(value)
  ))
}

function isBlockedLiteral(node) {
  return node && node.type === 'Literal' && node.value === 'blocked'
}

function visit(node, file) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => visit(item, file))
    return
  }
  if (
    node.type === 'BinaryExpression'
    && ['===', '!==', '==', '!='].includes(node.operator)
    && (
      (isBlockedLiteral(node.left) && containsPolicyReference(node.right))
      || (isBlockedLiteral(node.right) && containsPolicyReference(node.left))
    )
  ) {
    violations.push({ file, line: node.loc.start.line, column: node.loc.start.column + 1 })
  }
  Object.values(node).forEach((value) => visit(value, file))
}

for (const [file, source] of Object.entries(sources)) {
  try {
    visit(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true }), file)
  } catch (error) {
    process.stderr.write(JSON.stringify({ parseError: { file, message: error.message } }))
    process.exit(2)
  }
}
process.stdout.write(JSON.stringify(violations))
`

function collectJavaScriptFiles(directory) {
  const files = []
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target)
    })
  }
  visit(directory)
  return files
}

function projectTargets() {
  const files = collectJavaScriptFiles(path.join(root, 'subpackages/shared-meal'))
  fs.readdirSync(path.join(root, 'services'), { withFileTypes: true }).forEach((entry) => {
    if (entry.isFile() && /^sharedMeal.*\.js$/.test(entry.name)) {
      files.push(path.join(root, 'services', entry.name))
    }
  })
  files.push(
    path.join(root, 'cloudfunctions/sharedMealRecord/index.js'),
    path.join(root, 'cloudfunctions/sharedMealRecord/ingredientOperationRules.js'),
    path.join(root, 'utils/ingredientOperationRules.js')
  )
  return files
}

function scan(files) {
  const sources = Object.fromEntries(files.map((file) => [
    path.relative(root, file),
    fs.readFileSync(file, 'utf8')
  ]))
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', astScanner], {
    cwd: root,
    input: JSON.stringify(sources),
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(`食材策略静态扫描失败：${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function main() {
  const fixtureIndex = process.argv.indexOf('--fixture')
  const fixtureRoot = fixtureIndex >= 0
    ? path.resolve(root, process.argv[fixtureIndex + 1] || '')
    : null
  if (fixtureIndex >= 0 && !process.argv[fixtureIndex + 1]) throw new Error('缺少 fixture 路径')
  const files = fixtureRoot ? collectJavaScriptFiles(fixtureRoot) : projectTargets()
  const allowedRuleModules = new Set(
    files
      .filter((file) => path.basename(file) === 'ingredientOperationRules.js')
      .map((file) => path.relative(root, file))
  )
  const violations = scan(files).filter((item) => !allowedRuleModules.has(item.file))
  if (violations.length) {
    const details = violations.map((item) => `${item.file}:${item.line}:${item.column}`).join('\n')
    throw new Error(`发现散落的食材策略 blocked 直接比较：\n${details}`)
  }
  console.log('Ingredient policy usage checks passed.')
}

if (require.main === module) main()

module.exports = { scan }
