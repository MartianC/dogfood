#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const expectedTaskIds = [
  'S0.1', 'S0.2', 'S1.1', 'S1.2', 'S1.3', 'S1.4',
  'D1.1', 'F1.1', 'F1.2', 'F1.3', 'F1.4', 'F1.5', 'F1.6', 'F1.7',
  'D2.1', 'F2.1', 'F2.2', 'F2.3', 'F2.4',
  'D3.1', 'F3.1', 'F3.2', 'F3.3',
  'B1.1', 'B1.2', 'B1.3', 'B1.4', 'B2.1',
  'D4.1', 'F4.1', 'F4.2', 'F4.3', 'F4.4', 'F4.5', 'F4.6',
  'G1.1', 'G1.2', 'DOC1.1', 'DOC1.2', 'DOC1.3', 'DOC1.4', 'D5.1', 'DOC2.1'
]
const expectedScope = {
  automaticInitialAmount: false,
  automaticIngredientRatio: false,
  automaticIngredientSupplement: false,
  photoFeature: false,
  deleteLegacyFlows: false,
  newUiComponentLibrary: false
}
const expectedExclusions = [
  'automatic-initial-amount',
  'automatic-ingredient-ratio',
  'automatic-ingredient-supplement',
  'photo-selection-upload-storage-detail',
  'legacy-flow-deletion',
  'new-ui-library-or-test-framework'
]
const expectedFigmaGates = {
  menuSearch: ['D1.1', ['F1.2', 'F1.3', 'F1.4', 'F1.5', 'F1.6', 'F1.7']],
  composeSources: ['D2.1', ['F2.2', 'F2.3', 'F2.4']],
  draftRecovery: ['D3.1', ['F3.2', 'F3.3']],
  recordListAndDetail: ['D4.1', ['F4.3', 'F4.5', 'F4.6']],
  profileCopy: ['D5.1', ['DOC2.1']]
}

function readArguments(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--contract', '--plan'].includes(key) || !value) {
      throw new Error(`无效参数：${key || '(空)'}`)
    }
    values[key.slice(2)] = path.resolve(root, value)
  }
  return values
}

function assertExactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}与已批准基线不一致`)
  }
}

function validateContract(contract) {
  if (contract.contract !== 'sharedMealDeviationClosureBaseline/v1') {
    throw new Error('偏差基线契约版本无效')
  }
  if (JSON.stringify(contract.scope) !== JSON.stringify(expectedScope)) {
    throw new Error('自动克重、自动比例、照片等排除范围被篡改')
  }
  assertExactArray(contract.exclusions, expectedExclusions, '排除项')

  const tasks = Array.isArray(contract.tasks) ? contract.tasks : []
  const taskIds = tasks.map((task) => task.id)
  assertExactArray(taskIds, expectedTaskIds, '允许实施的任务 ID')
  if (new Set(taskIds).size !== taskIds.length) throw new Error('任务 ID 不得重复')

  const knownIds = new Set(taskIds)
  const visited = new Set()
  const visiting = new Set()
  const byId = new Map(tasks.map((task) => [task.id, task]))
  function visit(taskId) {
    if (visited.has(taskId)) return
    if (visiting.has(taskId)) throw new Error(`任务依赖存在环：${taskId}`)
    visiting.add(taskId)
    const dependencies = byId.get(taskId).dependsOn
    if (!Array.isArray(dependencies)) throw new Error(`任务 ${taskId} 缺少 dependsOn`)
    dependencies.forEach((dependencyId) => {
      if (!knownIds.has(dependencyId)) throw new Error(`任务 ${taskId} 依赖未知任务 ${dependencyId}`)
      visit(dependencyId)
    })
    visiting.delete(taskId)
    visited.add(taskId)
  }
  taskIds.forEach(visit)

  const gateNames = Object.keys(expectedFigmaGates)
  assertExactArray(Object.keys(contract.figmaGates || {}), gateNames, 'Figma 门禁工作包')
  gateNames.forEach((name) => {
    const gate = contract.figmaGates[name]
    const [designTaskId, implementationTaskIds] = expectedFigmaGates[name]
    if (gate.designTaskId !== designTaskId) throw new Error(`${name} 的 Figma 设计任务被篡改`)
    assertExactArray(gate.implementationTaskIds, implementationTaskIds, `${name} 的 UI 实现任务`)
  })
}

function parsePlanProgress(source) {
  const board = source.match(/## 进度看板([\s\S]*?)### 进展记录/)
  if (!board) throw new Error('计划缺少进度看板或进展记录')
  const tasks = new Map()
  const pattern = /^- \[([ xX])\] `([^`]+)`/gm
  let match
  while ((match = pattern.exec(board[1]))) {
    if (tasks.has(match[2])) throw new Error(`计划看板任务重复：${match[2]}`)
    tasks.set(match[2], match[1].toLowerCase() === 'x')
  }
  const progress = board[1].match(/\*\*当前进度：\*\* (\d+) \/ (\d+)（(\d+)%）/)
  if (!progress) throw new Error('计划缺少机器可读的当前进度')
  return {
    tasks,
    reportedCompleted: Number(progress[1]),
    reportedTotal: Number(progress[2]),
    reportedPercent: Number(progress[3])
  }
}

function validatePlanState(source, contract) {
  const progress = parsePlanProgress(source)
  assertExactArray([...progress.tasks.keys()], expectedTaskIds, '计划看板任务 ID')

  Object.entries(contract.figmaGates).forEach(([name, gate]) => {
    if (progress.tasks.get(gate.designTaskId)) return
    const completedUiTask = gate.implementationTaskIds.find((taskId) => progress.tasks.get(taskId))
    if (completedUiTask) {
      throw new Error(`Figma 门禁未通过：${name} 的 ${gate.designTaskId} 未完成，不能完成 ${completedUiTask}`)
    }
  })

  contract.tasks.forEach((task) => {
    if (!progress.tasks.get(task.id)) return
    const incompleteDependency = task.dependsOn.find((taskId) => !progress.tasks.get(taskId))
    if (incompleteDependency) throw new Error(`任务 ${task.id} 的依赖 ${incompleteDependency} 尚未完成`)
  })

  const completed = [...progress.tasks.values()].filter(Boolean).length
  const percent = Math.round((completed / expectedTaskIds.length) * 100)
  if (
    progress.reportedCompleted !== completed
    || progress.reportedTotal !== expectedTaskIds.length
    || progress.reportedPercent !== percent
  ) {
    throw new Error('计划进度数字与任务勾选状态不一致')
  }
}

function main() {
  const args = readArguments(process.argv.slice(2))
  const contractPath = args.contract || path.join(root, 'contracts/shared-meal/deviation-closure-baseline-v1.json')
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  const planPath = args.plan || path.join(root, contract.plan)
  validateContract(contract)
  validatePlanState(fs.readFileSync(planPath, 'utf8'), contract)
  console.log('Shared meal deviation baseline checks passed.')
}

if (require.main === module) main()

module.exports = { validateContract, validatePlanState }
