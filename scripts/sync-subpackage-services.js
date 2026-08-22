#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sourceRoot = path.join(root, 'shared-src', 'subpackage-services')
const banner = '// 此文件由 scripts/sync-subpackage-services.js 自动生成，请修改 shared-src 后重新同步。\n'

const groups = [
  {
    sourceDirectory: 'meal-assessment',
    files: [
      'energyRequirementService.js',
      'mealAssessmentService.js',
      'mealEnergyService.js',
      'nutritionAssessmentService.js',
      'nutritionDataService.js',
      'runtimeDataReleaseService.js'
    ],
    targetDirectories: [
      'subpackages/custom-recipe/services',
      'subpackages/shared-meal/services'
    ]
  },
  {
    sourceDirectory: 'shared-meal',
    files: [
      'ingredientOperationRules.js',
      'sharedMealContract.js',
      'sharedMealDraftService.js'
    ],
    targetDirectories: [
      'subpackages/custom-recipe/services',
      'subpackages/shared-meal/services'
    ]
  },
  {
    sourceDirectory: 'search',
    files: [
      'debouncedRequestCoordinator.js'
    ],
    targetDirectories: [
      'subpackages/custom-recipe/services',
      'subpackages/shared-meal/services'
    ]
  }
]

function expectedFiles() {
  return groups.flatMap((group) => group.targetDirectories.flatMap((targetDirectory) => (
    group.files.map((file) => {
      const source = path.join(sourceRoot, group.sourceDirectory, file)
      const target = path.join(root, targetDirectory, file)
      return {
        source,
        target,
        relativeTarget: path.relative(root, target),
        content: banner + fs.readFileSync(source, 'utf8')
      }
    })
  )))
}

function checkGeneratedFiles() {
  return expectedFiles().filter(({ target, content }) => (
    !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content
  )).map(({ relativeTarget }) => relativeTarget)
}

function syncGeneratedFiles() {
  const changed = []
  expectedFiles().forEach(({ target, relativeTarget, content }) => {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) return
    fs.writeFileSync(target, content)
    changed.push(relativeTarget)
  })
  return changed
}

function main() {
  const checkOnly = process.argv.slice(2).includes('--check')
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--check')
  if (unknown.length) throw new Error(`未知参数：${unknown.join(', ')}`)
  if (checkOnly) {
    const drift = checkGeneratedFiles()
    if (drift.length) {
      process.stderr.write(`分包共享服务未同步：\n${drift.map((file) => `- ${file}`).join('\n')}\n`)
      process.exitCode = 1
      return
    }
    process.stdout.write('分包共享服务已同步。\n')
    return
  }
  const changed = syncGeneratedFiles()
  process.stdout.write(changed.length
    ? `已同步 ${changed.length} 个分包服务文件。\n`
    : '分包共享服务无需更新。\n')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`同步分包共享服务失败：${error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = {
  checkGeneratedFiles,
  syncGeneratedFiles
}
