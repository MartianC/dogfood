const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

function runFixture(name) {
  return spawnSync(process.execPath, [
    'scripts/check-ingredient-policy-usage.js',
    '--fixture',
    `tests/fixtures/ingredient-policy-usage/${name}`
  ], { cwd: root, encoding: 'utf8' })
}

test('食材策略静态门禁允许规则模块底层比较并忽略注释与字符串', () => {
  const result = runFixture('positive')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /checks passed/)
})

test('食材策略静态门禁拒绝业务模块直接比较 blocked', () => {
  const result = runFixture('negative')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /negative\/page\.js:2/)
})

test('当前共享本餐页面、服务和云函数通过食材策略静态门禁', () => {
  const result = spawnSync(process.execPath, ['scripts/check-ingredient-policy-usage.js'], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /checks passed/)
})
