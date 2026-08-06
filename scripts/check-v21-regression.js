#!/usr/bin/env node

const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const checks = [
  ['npm test', [ 'test' ]],
  ['UI 系统门禁', [ 'run', 'check:ui' ]],
  ['主包边界门禁', [ 'run', 'check:main-package' ]],
  ['项目导航门禁', [ 'run', 'check:project-navigation' ]],
  ['共享本餐导航门禁', [ 'run', 'check:shared-meal-navigation' ]],
  ['共享本餐记录合同门禁', [ 'run', 'check:shared-meal-record' ]],
  ['体重合同门禁', [ 'run', 'check:weight-contract' ]],
  ['护理合同门禁', [ 'run', 'check:care-record-contract' ]],
  ['代码质量静态检查', [ 'run', 'check:code-quality' ]],
  ['Git 差异空白检查', null]
]

function runCheck(label, command, args) {
  const result = spawnSync(command, args || [], {
    cwd: root,
    stdio: 'inherit'
  })
  if (result.error) {
    console.error(`${label}执行失败：${result.error.message}`)
    return false
  }
  if (result.status !== 0) {
    console.error(`${label}未通过，退出码：${result.status}`)
    return false
  }
  return true
}

function main() {
  for (const [label, args] of checks) {
    const passed = args
      ? runCheck(label, npmCommand, args)
      : runCheck(label, 'git', ['diff', '--check'])
    if (!passed) process.exit(1)
  }
  console.log('V2.1 次要能力本地回归门禁通过。')
}

if (require.main === module) main()

module.exports = { checks, runCheck }
