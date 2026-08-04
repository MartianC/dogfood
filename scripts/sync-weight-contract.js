#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'services/weightContract.js')
const target = path.join(root, 'cloudfunctions/weightRecord/weightContract.js')
const banner = '// 此文件由 scripts/sync-weight-contract.js 自动生成，请修改 services/weightContract.js 后重新同步。\n'

function expectedContent() {
  return banner + fs.readFileSync(source, 'utf8')
}

function checkGeneratedFile() {
  return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === expectedContent()
}

function syncGeneratedFile() {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const content = expectedContent()
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) return false
  fs.writeFileSync(target, content)
  return true
}

function main() {
  const checkOnly = process.argv.slice(2).includes('--check')
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--check')
  if (unknown.length) throw new Error(`未知参数：${unknown.join(', ')}`)
  if (checkOnly) {
    if (!checkGeneratedFile()) {
      process.stderr.write('weightRecord 云函数合同副本未同步。\n')
      process.exitCode = 1
      return
    }
    process.stdout.write('weightRecord 云函数合同副本已同步。\n')
    return
  }
  process.stdout.write(syncGeneratedFile()
    ? '已同步 weightRecord 云函数合同副本。\n'
    : 'weightRecord 云函数合同副本无需更新。\n')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`同步 weightRecord 云函数合同失败：${error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = {
  checkGeneratedFile,
  syncGeneratedFile,
  expectedContent
}
