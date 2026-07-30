const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createBoundaryChecker,
  collectReachableMainJavaScript,
  findUnusedMainPackageJavaScript
} = require('../scripts/check-main-package-unused-js')

test('根目录普通 JS 均由主包真实页面或组件使用', () => {
  assert.deepEqual(findUnusedMainPackageJavaScript(), [])
})

test('跨分包共享服务生成到各自分包且不在主包保留运行时入口', () => {
  const projectRoot = path.join(__dirname, '..')
  assert.equal(fs.existsSync(path.join(projectRoot, 'utils/ingredientOperationRules.js')), false)
  assert.equal(fs.existsSync(path.join(projectRoot, 'services/sharedMealDraftService.js')), false)
  assert.equal(
    fs.existsSync(path.join(
      projectRoot,
      'subpackages/custom-recipe/services/ingredientOperationRules.js'
    )),
    true
  )
  assert.equal(
    fs.existsSync(path.join(
      projectRoot,
      'subpackages/shared-meal/services/ingredientOperationRules.js'
    )),
    true
  )
})

test('mainPackageReachability/v2 正反 fixtures 保留分包共享并拒绝孤儿根 JS', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const positive = createBoundaryChecker(path.join(fixtureRoot, 'subpackage-shared'))
  const negative = createBoundaryChecker(path.join(fixtureRoot, 'orphan-root-js'))

  assert.equal(
    positive.collectReachableMainJavaScript().has('utils/sharedRule.js'),
    true
  )
  assert.deepEqual(positive.findUnusedMainPackageJavaScript(), [])
  assert.deepEqual(negative.findUnusedMainPackageJavaScript(), ['utils/orphan.js'])
})

test('mainPackageReachability/v2 不把注释或字符串里的伪造 require 计入依赖图', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const fakeRequireFixtures = [
    'fake-require-line-comment',
    'fake-require-block-comment',
    'fake-require-string'
  ]

  fakeRequireFixtures.forEach((fixture) => {
    const checker = createBoundaryChecker(path.join(fixtureRoot, fixture))
    assert.deepEqual(
      checker.findUnusedMainPackageJavaScript(),
      ['utils/orphan.js'],
      `${fixture} 不应让孤儿根 JS 变为可达`
    )
  })
})

test('mainPackageReachability/v2 忽略被参数、局部变量和嵌套作用域遮蔽的 require', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const shadowedRequireFixtures = [
    'fake-require-parameter',
    'fake-require-local',
    'fake-require-nested-scope'
  ]

  shadowedRequireFixtures.forEach((fixture) => {
    const checker = createBoundaryChecker(path.join(fixtureRoot, fixture))
    assert.deepEqual(
      checker.findUnusedMainPackageJavaScript(),
      ['utils/orphan.js'],
      `${fixture} 不应把被遮蔽的 require 当作 CommonJS 依赖`
    )
  })
})

test('mainPackageReachability/v2 忽略成员调用、动态参数和模板字符串', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const checker = createBoundaryChecker(path.join(fixtureRoot, 'fake-require-nonstatic'))

  assert.deepEqual(checker.findUnusedMainPackageJavaScript(), ['utils/orphan.js'])
})

test('mainPackageReachability/v2 识别转义后的静态字符串 require', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const checker = createBoundaryChecker(path.join(fixtureRoot, 'static-require-escaped'))

  assert.equal(
    checker.collectReachableMainJavaScript().has('utils/sharedRule.js'),
    true
  )
  assert.deepEqual(checker.findUnusedMainPackageJavaScript(), [])
})

test('mainPackageReachability/v2 遇到语法错误时关闭检查并返回失败', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'main-package-syntax-error-')
  )
  const temporaryProject = path.join(temporaryRoot, 'project')
  try {
    fs.cpSync(
      path.join(fixtureRoot, 'syntax-error'),
      temporaryProject,
      { recursive: true }
    )
    fs.renameSync(
      path.join(temporaryProject, 'pages/home/index.source.txt'),
      path.join(temporaryProject, 'pages/home/index.js')
    )
    const checker = createBoundaryChecker(temporaryProject)
    assert.throws(
      () => checker.findUnusedMainPackageJavaScript(),
      /无法解析真实 require 图/
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('mainPackageReachability/v2 不信任 Annex B 和 with 形成的动态 require', () => {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'main-package-boundary')
  const annexBBlock = createBoundaryChecker(
    path.join(fixtureRoot, 'fake-require-annex-b-block')
  )
  assert.deepEqual(
    annexBBlock.findUnusedMainPackageJavaScript(),
    ['utils/orphan.js']
  )

  const sourceFixtures = [
    'fake-require-annex-b-if',
    'fake-require-with'
  ]
  sourceFixtures.forEach((fixture) => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `main-package-${fixture}-`)
    )
    const temporaryProject = path.join(temporaryRoot, 'project')
    try {
      fs.cpSync(
        path.join(fixtureRoot, fixture),
        temporaryProject,
        { recursive: true }
      )
      fs.renameSync(
        path.join(temporaryProject, 'pages/home/index.source.txt'),
        path.join(temporaryProject, 'pages/home/index.js')
      )
      const checker = createBoundaryChecker(temporaryProject)
      assert.deepEqual(
        checker.findUnusedMainPackageJavaScript(),
        ['utils/orphan.js'],
        `${fixture} 不应建立可信 CommonJS 依赖`
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
