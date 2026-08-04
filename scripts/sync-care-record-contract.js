const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'contracts/care/careRecordContract.js')
const targetPath = path.join(root, 'cloudfunctions/careRecord/careRecordContract.js')
const header = '// 此文件由 scripts/sync-care-record-contract.js 自动生成，请修改 contracts/care/careRecordContract.js 后同步。\n\n'

function render() {
  return header + fs.readFileSync(sourcePath, 'utf8')
}

function sync({ check = false } = {}) {
  const expected = render()
  const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : ''
  if (check) {
    if (actual !== expected) throw new Error('careRecord 云函数合同副本与根合同不一致，请先运行同步脚本')
    return false
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  if (actual === expected) return false
  fs.writeFileSync(targetPath, expected)
  return true
}

if (require.main === module) {
  const changed = sync({ check: process.argv.includes('--check') })
  console.log(changed ? 'Care record contract synced.' : 'Care record contract is up to date.')
}

module.exports = { sync, render, sourcePath, targetPath }
