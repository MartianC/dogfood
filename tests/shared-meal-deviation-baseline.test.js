const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const contractPath = path.join(root, 'contracts/shared-meal/deviation-closure-baseline-v1.json')
const planPath = path.join(root, 'docs/superpowers/plans/2026-07-28-shared-meal-deviation-closure.md')

function runCheck(contract, plan = fs.readFileSync(planPath, 'utf8')) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-meal-deviation-'))
  const fixtureContractPath = path.join(directory, 'contract.json')
  const fixturePlanPath = path.join(directory, 'plan.md')
  fs.writeFileSync(fixtureContractPath, `${JSON.stringify(contract, null, 2)}\n`)
  fs.writeFileSync(fixturePlanPath, plan)
  const result = spawnSync(process.execPath, [
    'scripts/check-shared-meal-deviation-baseline.js',
    '--contract', fixtureContractPath,
    '--plan', fixturePlanPath
  ], { cwd: root, encoding: 'utf8' })
  fs.rmSync(directory, { recursive: true, force: true })
  return result
}

test('偏差基线正向契约与计划看板通过', () => {
  const result = spawnSync(process.execPath, ['scripts/check-shared-meal-deviation-baseline.js'], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /checks passed/)
})

test('偏差基线拒绝开启自动初始克重', () => {
  const contract = require(contractPath)
  const result = runCheck({
    ...contract,
    scope: { ...contract.scope, automaticInitialAmount: true }
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /排除范围被篡改/)
})

test('偏差基线拒绝开启照片能力', () => {
  const contract = require(contractPath)
  const result = runCheck({
    ...contract,
    scope: { ...contract.scope, photoFeature: true }
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /排除范围被篡改/)
})

test('偏差基线拒绝在 Figma 设计未完成时勾选 UI 实现', () => {
  const contract = require(contractPath)
  const plan = fs.readFileSync(planPath, 'utf8')
    .replace('- [x] `D1.1` 冻结多菜搜索交互规格（Figma）', '- [ ] `D1.1` 冻结多菜搜索交互规格（Figma）')
    .replace('- [ ] `F1.2` 接入搜索分页', '- [x] `F1.2` 接入搜索分页')
  const result = runCheck(contract, plan)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Figma 门禁未通过.*D1\.1.*F1\.2/)
})
