const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

test('记录 schema、三条查询索引和仅云函数访问规则固定', () => {
  const result = spawnSync(process.execPath, ['scripts/check-shared-meal-record-contract.js'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /checks passed/)
})
