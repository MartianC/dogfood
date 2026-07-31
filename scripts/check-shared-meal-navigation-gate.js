'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const expectedEvidence = {
  multiMenu: [
    ['test', 'tests/shared-meal-menu-search.test.js'],
    ['test', 'tests/shared-meal-menu-session.test.js'],
  ],
  sourceReselection: [
    ['test', 'tests/shared-meal-compose-sources.test.js'],
    ['test', 'tests/ingredient-measurement-basis.test.js'],
  ],
  explicitDraftRecovery: [
    ['test', 'tests/shared-meal-compose-entry.test.js'],
    ['test', 'tests/shared-meal-draft.test.js'],
  ],
  cloudRecordContract: [
    ['contractChecker', 'scripts/check-shared-meal-record-contract.js'],
    ['test', 'tests/shared-meal-record-contract.test.js'],
    ['test', 'tests/shared-meal-record-cloud-function.test.js'],
    ['test', 'tests/shared-meal-record-service.test.js'],
  ],
  recordPaginationAndDetail: [
    ['test', 'tests/shared-meal-record-month-state.test.js'],
    ['test', 'tests/shared-meal-record-calendar-model.test.js'],
    ['test', 'tests/shared-meal-record-page.test.js'],
    ['test', 'tests/shared-meal-record-detail-model.test.js'],
    ['test', 'tests/shared-meal-record-detail-page.test.js'],
  ],
}
const expectedContractPaths = [
  'cloudfunctions/sharedMealRecord/schema/access.json',
  'cloudfunctions/sharedMealRecord/schema/indexes.json',
  'cloudfunctions/sharedMealRecord/schema/record.schema.json',
  'contracts/shared-meal/shared-meal-ingredient-v1.schema.json',
]
const expectedTabs = ['首页', '记录', '我的']
const expectedLegacyPaths = [
  'pages/recipes/list/index',
  'pages/recipes/detail/index',
  'pages/plan/index/index',
]

function validateGateContract(gate, projectRoot = root) {
  if (!gate || gate.contract !== 'navigationMigrationGate/v1') {
    throw new Error('导航迁移门禁契约版本无效')
  }
  if (JSON.stringify(gate.tabs) !== JSON.stringify(expectedTabs)) {
    throw new Error('导航迁移目标必须保持为首页、记录、我的')
  }
  if (gate.legacyCompatibility !== 'routes-retained-not-primary') {
    throw new Error('旧深链兼容策略被篡改')
  }
  if (JSON.stringify(gate.legacyPaths) !== JSON.stringify(expectedLegacyPaths)) {
    throw new Error('旧深链兼容清单被篡改')
  }

  const groups = gate.evidenceGroups || {}
  for (const [groupName, expectedItems] of Object.entries(expectedEvidence)) {
    const items = groups[groupName]
    if (!Array.isArray(items)) throw new Error(`缺少导航迁移证据组：${groupName}`)
    const actualItems = items.map((item) => [item && item.kind, item && item.path])
    if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
      if (items.some((item) => !item || !['test', 'contractChecker'].includes(item.kind))) {
        throw new Error(`${groupName} 的证据必须引用 test 或 contractChecker`)
      }
      throw new Error(`${groupName} 的导航迁移证据不完整`)
    }
    for (const item of items) {
      if (!fs.existsSync(path.join(projectRoot, item.path))) {
        throw new Error(`缺少导航迁移证据：${item.path}`)
      }
    }
  }
  const extraGroups = Object.keys(groups).filter((name) => !expectedEvidence[name])
  if (extraGroups.length) throw new Error(`存在未定义的导航迁移证据组：${extraGroups.join(', ')}`)
  if (JSON.stringify(gate.contractPaths) !== JSON.stringify(expectedContractPaths)) {
    throw new Error('记录云端合同文件清单不完整')
  }
  for (const contractPath of gate.contractPaths) {
    if (!fs.existsSync(path.join(projectRoot, contractPath))) {
      throw new Error(`缺少记录云端合同：${contractPath}`)
    }
  }
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${label}未通过：\n${result.stdout}\n${result.stderr}`)
  }
}

function main() {
  const gate = JSON.parse(fs.readFileSync(path.join(root, 'contracts/shared-meal/navigation-migration-gate-v1.json'), 'utf8'))
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  validateGateContract(gate, root)

  const tabs = appConfig.tabBar.list.map((item) => item.text)
  if (JSON.stringify(tabs) !== JSON.stringify(gate.tabs)) {
    throw new Error('主导航尚未切换为首页、记录、我的')
  }
  gate.legacyPaths.forEach((pagePath) => {
    if (!appConfig.pages.includes(pagePath)) throw new Error(`旧兼容路由已被删除：${pagePath}`)
    if (appConfig.tabBar.list.some((item) => item.pagePath === pagePath)) {
      throw new Error(`旧路由仍暴露为主入口：${pagePath}`)
    }
  })

  const evidence = Object.values(gate.evidenceGroups).flat()
  const tests = evidence.filter((item) => item.kind === 'test').map((item) => item.path)
  const contractCheckers = evidence.filter((item) => item.kind === 'contractChecker')
  runCommand(process.execPath, ['--test', ...tests], '导航迁移核心测试证据')
  contractCheckers.forEach((item) => runCommand(process.execPath, [item.path], `导航迁移合同证据 ${item.path}`))
  console.log('Shared meal navigation gate passed.')
}

if (require.main === module) main()

module.exports = { validateGateContract }
