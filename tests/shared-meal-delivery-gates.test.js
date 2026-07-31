const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const {
  validateGateContract,
} = require('../scripts/check-shared-meal-navigation-gate')
const {
  collectSharedMealFigmaEvidenceErrors,
} = require('../scripts/check-ui-system')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

test('导航门禁覆盖共享本餐五组真实业务证据', () => {
  const contract = readJson('contracts/shared-meal/navigation-migration-gate-v1.json')
  assert.doesNotThrow(() => validateGateContract(contract, root))

  const incomplete = structuredClone(contract)
  delete incomplete.evidenceGroups.explicitDraftRecovery
  assert.throws(
    () => validateGateContract(incomplete, root),
    /缺少导航迁移证据组：explicitDraftRecovery/,
  )
})

test('导航门禁拒绝用手写完成布尔值代替测试或契约', () => {
  const contract = readJson('contracts/shared-meal/navigation-migration-gate-v1.json')
  const invalid = structuredClone(contract)
  invalid.evidenceGroups.multiMenu = [{ completed: true }]

  assert.throws(
    () => validateGateContract(invalid, root),
    /证据必须引用 test 或 contractChecker/,
  )
})

test('四个 Figma 工作包包含来源、确认、映射和视觉验收证据', () => {
  const evidence = readJson('docs/ui/shared-meal-figma-implementation-evidence.json')
  assert.deepEqual(collectSharedMealFigmaEvidenceErrors(evidence, root), [])
})

test('Figma 工作包缺少确认或截图验收时门禁失败', () => {
  const evidence = readJson('docs/ui/shared-meal-figma-implementation-evidence.json')
  const invalid = structuredClone(evidence)
  invalid.workPackages.menuSearch.confirmation.status = 'pending'
  delete invalid.workPackages.recordListAndDetail.visualValidation.screenshotEvidence

  const errors = collectSharedMealFigmaEvidenceErrors(invalid, root)
  assert.ok(errors.some((message) => /menuSearch.*用户确认状态必须为 confirmed/.test(message)))
  assert.ok(errors.some((message) => /recordListAndDetail.*缺少截图比对证据/.test(message)))
})
