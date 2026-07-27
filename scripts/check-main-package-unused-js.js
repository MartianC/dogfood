#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const DEFAULT_PROJECT_ROOT = path.join(__dirname, '..')
const PLAIN_JS_DIRS = ['config', 'data', 'services', 'utils']
const SOURCE_SCAN_ROOTS = [
  'app.js',
  'config',
  'custom-tab-bar',
  'data',
  'pages',
  'components',
  'services',
  'subpackages',
  'utils'
]
const ACORN_REQUIRE_PARSER = String.raw`
const fs = require('node:fs')
const acorn = require('internal/deps/acorn/acorn/dist/acorn')
const sources = JSON.parse(fs.readFileSync(0, 'utf8'))
const result = {}

class Scope {
  constructor(parent = null) {
    this.parent = parent
    this.bindings = new Set()
  }
}

function addPatternBindings(pattern, scope) {
  if (!pattern) return
  if (pattern.type === 'Identifier') {
    scope.bindings.add(pattern.name)
    return
  }
  if (pattern.type === 'RestElement') {
    addPatternBindings(pattern.argument, scope)
    return
  }
  if (pattern.type === 'AssignmentPattern') {
    addPatternBindings(pattern.left, scope)
    return
  }
  if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach((item) => addPatternBindings(item, scope))
    return
  }
  if (pattern.type === 'ObjectPattern') {
    pattern.properties.forEach((property) => {
      addPatternBindings(
        property.type === 'RestElement' ? property.argument : property.value,
        scope
      )
    })
  }
}

function addDirectBindings(statements, scope, includeVar) {
  statements.forEach((statement) => {
    if (
      statement.type === 'VariableDeclaration'
      && (includeVar || statement.kind !== 'var')
    ) {
      statement.declarations.forEach((declaration) => {
        addPatternBindings(declaration.id, scope)
      })
    }
    if (
      (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration')
      && statement.id
    ) {
      scope.bindings.add(statement.id.name)
    }
  })
}

function isFunction(node) {
  return node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression'
}

function collectVarBindings(node, scope) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => collectVarBindings(item, scope))
    return
  }
  if (isFunction(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    return
  }
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    node.declarations.forEach((declaration) => {
      addPatternBindings(declaration.id, scope)
    })
  }
  Object.values(node).forEach((value) => collectVarBindings(value, scope))
}

function hasBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return true
  }
  return false
}

function collectRequires(ast, requests) {
  function visit(node, scope) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, scope))
      return
    }

    if (node.type === 'Program') {
      const programScope = new Scope(scope)
      addDirectBindings(node.body, programScope, true)
      collectVarBindings(node, programScope)
      visit(node.body, programScope)
      return
    }

    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      const blockScope = new Scope(scope)
      addDirectBindings(node.body, blockScope, false)
      visit(node.body, blockScope)
      return
    }

    if (isFunction(node)) {
      const functionScope = new Scope(scope)
      if (node.id) functionScope.bindings.add(node.id.name)
      node.params.forEach((parameter) => addPatternBindings(parameter, functionScope))
      if (node.body.type === 'BlockStatement') {
        collectVarBindings(node.body, functionScope)
      }
      visit(node.params, functionScope)
      visit(node.body, functionScope)
      return
    }

    if (node.type === 'CatchClause') {
      const catchScope = new Scope(scope)
      addPatternBindings(node.param, catchScope)
      visit(node.param, catchScope)
      visit(node.body, catchScope)
      return
    }

    if (node.type === 'ForStatement') {
      const loopScope = new Scope(scope)
      if (node.init && node.init.type === 'VariableDeclaration' && node.init.kind !== 'var') {
        node.init.declarations.forEach((declaration) => {
          addPatternBindings(declaration.id, loopScope)
        })
      }
      visit(node.init, loopScope)
      visit(node.test, loopScope)
      visit(node.update, loopScope)
      visit(node.body, loopScope)
      return
    }

    if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
      const loopScope = new Scope(scope)
      if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') {
        node.left.declarations.forEach((declaration) => {
          addPatternBindings(declaration.id, loopScope)
        })
      }
      visit(node.left, loopScope)
      visit(node.right, loopScope)
      visit(node.body, loopScope)
      return
    }

    if (node.type === 'SwitchStatement') {
      const switchScope = new Scope(scope)
      addDirectBindings(
        node.cases.flatMap((switchCase) => switchCase.consequent),
        switchScope,
        false
      )
      visit(node.discriminant, scope)
      node.cases.forEach((switchCase) => {
        visit(switchCase.test, switchScope)
        visit(switchCase.consequent, switchScope)
      })
      return
    }

    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const classScope = new Scope(scope)
      if (node.id) classScope.bindings.add(node.id.name)
      visit(node.superClass, scope)
      visit(node.body, classScope)
      return
    }

    if (
      node.type === 'CallExpression'
      && node.optional !== true
      && node.callee
      && node.callee.type === 'Identifier'
      && node.callee.name === 'require'
      && !hasBinding(scope, 'require')
      && node.arguments
      && node.arguments.length === 1
      && node.arguments[0].type === 'Literal'
      && typeof node.arguments[0].value === 'string'
    ) {
      requests.push(node.arguments[0].value)
    }

    Object.values(node).forEach((value) => visit(value, scope))
  }

  visit(ast, null)
}

for (const [file, source] of Object.entries(sources)) {
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true
  })
  const requests = []
  collectRequires(ast, requests)
  result[file] = requests
}

process.stdout.write(JSON.stringify(result))
`

function createBoundaryChecker(projectRoot = DEFAULT_PROJECT_ROOT) {
  function exists(relativePath) {
    return fs.existsSync(path.join(projectRoot, relativePath))
  }

  function normalize(relativePath) {
    return relativePath.split(path.sep).join('/')
  }

  function resolveJavaScript(fromFile, request) {
    if (!request.startsWith('.') && !request.startsWith('/')) return ''
    const base = request.startsWith('/')
      ? path.resolve(projectRoot, `.${request}`)
      : path.resolve(projectRoot, path.dirname(fromFile), request)
    const candidates = [base, `${base}.js`, path.join(base, 'index.js')]
    const target = candidates.find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    )
    return target ? normalize(path.relative(projectRoot, target)) : ''
  }

  function usingComponentsOf(jsonFile) {
    if (!exists(jsonFile)) return []
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, jsonFile), 'utf8'))
    return Object.values(config.usingComponents || {}).filter(
      (value) => value.startsWith('.') || value.startsWith('/')
    )
  }

  function componentJavaScript(fromJson, request) {
    const base = request.startsWith('/')
      ? path.resolve(projectRoot, `.${request}`)
      : path.resolve(projectRoot, path.dirname(fromJson), request)
    const candidates = [`${base}.js`, path.join(base, 'index.js')]
    const target = candidates.find((candidate) => fs.existsSync(candidate))
    return target ? normalize(path.relative(projectRoot, target)) : ''
  }

  function pageEntries(appConfig) {
    const mainPages = (appConfig.pages || []).map((page) => String(page))
    const subpackagePages = (appConfig.subpackages || []).flatMap((subpackage) => {
      const root = String(subpackage.root || '').replace(/\/+$/, '')
      return (subpackage.pages || []).map((page) => `${root}/${page}`)
    })
    return mainPages.concat(subpackagePages)
  }

  function collectJavaScriptSources() {
    const sources = {}

    function visit(relativePath) {
      const absolutePath = path.join(projectRoot, relativePath)
      if (!fs.existsSync(absolutePath)) return
      const stat = fs.statSync(absolutePath)
      if (stat.isFile()) {
        if (relativePath.endsWith('.js')) {
          sources[normalize(relativePath)] = fs.readFileSync(absolutePath, 'utf8')
        }
        return
      }
      fs.readdirSync(absolutePath, { withFileTypes: true }).forEach((entry) => {
        visit(normalize(path.join(relativePath, entry.name)))
      })
    }

    SOURCE_SCAN_ROOTS.forEach(visit)
    return sources
  }

  function staticRequireMap() {
    const parseResult = spawnSync(
      process.execPath,
      ['--expose-internals', '-e', ACORN_REQUIRE_PARSER],
      {
        cwd: projectRoot,
        input: JSON.stringify(collectJavaScriptSources()),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024
      }
    )
    if (parseResult.status !== 0) {
      throw new Error(
        `无法解析真实 require 图：${String(parseResult.stderr || parseResult.stdout).trim()}`
      )
    }
    return JSON.parse(parseResult.stdout)
  }

  function collectReachableMainJavaScript() {
    const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'))
    const pages = pageEntries(appConfig)
    const queue = ['app.js', ...pages.map((page) => `${page}.js`)]
    const componentQueue = ['app.json', ...pages.map((page) => `${page}.json`)]
    if (appConfig.tabBar && appConfig.tabBar.custom) {
      queue.push('custom-tab-bar/index.js')
      componentQueue.push('custom-tab-bar/index.json')
    }

    const reachable = new Set()
    const visitedComponentJson = new Set()
    const requireMap = staticRequireMap()

    while (componentQueue.length) {
      const jsonFile = componentQueue.shift()
      if (visitedComponentJson.has(jsonFile)) continue
      visitedComponentJson.add(jsonFile)
      usingComponentsOf(jsonFile).forEach((request) => {
        const jsFile = componentJavaScript(jsonFile, request)
        if (!jsFile) return
        queue.push(jsFile)
        componentQueue.push(jsFile.replace(/\.js$/, '.json'))
      })
    }

    while (queue.length) {
      const jsFile = queue.shift()
      if (!jsFile || reachable.has(jsFile) || !exists(jsFile)) continue
      reachable.add(jsFile)
      for (const request of requireMap[jsFile] || []) {
        const dependency = resolveJavaScript(jsFile, request)
        if (dependency) queue.push(dependency)
      }
    }

    return reachable
  }

  function collectPlainMainJavaScript() {
    const files = []
    function visit(relativeDir) {
      const absoluteDir = path.join(projectRoot, relativeDir)
      if (!fs.existsSync(absoluteDir)) return
      fs.readdirSync(absoluteDir, { withFileTypes: true }).forEach((entry) => {
        const relativePath = normalize(path.join(relativeDir, entry.name))
        if (entry.isDirectory()) visit(relativePath)
        else if (entry.name.endsWith('.js')) files.push(relativePath)
      })
    }
    PLAIN_JS_DIRS.forEach(visit)
    return files.sort()
  }

  function findUnusedMainPackageJavaScript() {
    const reachable = collectReachableMainJavaScript()
    return collectPlainMainJavaScript().filter((file) => !reachable.has(file))
  }

  return {
    collectReachableMainJavaScript,
    findUnusedMainPackageJavaScript
  }
}

const defaultChecker = createBoundaryChecker()

if (require.main === module) {
  const unused = defaultChecker.findUnusedMainPackageJavaScript()
  if (unused.length) {
    console.error(`发现 ${unused.length} 个主包未使用 JS：`)
    unused.forEach((file) => console.error(`- ${file}`))
    process.exit(1)
  }
  console.log('未发现主包未使用 JS。')
}

module.exports = {
  createBoundaryChecker,
  collectReachableMainJavaScript: defaultChecker.collectReachableMainJavaScript,
  findUnusedMainPackageJavaScript: defaultChecker.findUnusedMainPackageJavaScript
}
