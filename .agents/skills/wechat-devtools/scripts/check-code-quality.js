#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PACKAGE_LIMIT_BYTES = 1.5 * 1024 * 1024
const ASSET_LIMIT_BYTES = 200 * 1024
const ASSET_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif',
  '.flac', '.m4a', '.ogg', '.ape', '.amr', '.wma',
  '.wav', '.mp3', '.mp4', '.aac', '.aiff', '.caf'
])
const SCANNABLE_SECRET_EXTENSIONS = new Set([
  '.js', '.ts', '.json', '.wxml', '.wxs', '.txt', '.env', '.yaml', '.yml'
])
const RULE_ORDER = [
  'PACKAGE_SIZE_LIMIT',
  'CONTAINS_OTHER_PKG_JS',
  'CONTAINS_OTHER_PKG_COMPONENTS',
  'JS_COMPRESS_OPEN',
  'WXML_COMPRESS_OPEN',
  'WXSS_COMPRESS_OPEN',
  'LAZYCODE_LOADING_OPEN',
  'PLUGIN_OVER_SIZE',
  'IMAGE_AND_AUDIO_LIMIT',
  'CONTAINS_UNUSED_PLUGINS',
  'CONTAINS_UNUSED_COMPONENTS',
  'CONTAINS_UNUSED_CODES',
  'CONTAINS_APPSECRET'
]
const RULE_META = {
  PACKAGE_SIZE_LIMIT: ['主包', '主包大小'],
  CONTAINS_OTHER_PKG_JS: ['主包', 'JS文件'],
  CONTAINS_OTHER_PKG_COMPONENTS: ['主包', '组件'],
  JS_COMPRESS_OPEN: ['代码压缩', 'JS文件'],
  WXML_COMPRESS_OPEN: ['代码压缩', 'WXML文件'],
  WXSS_COMPRESS_OPEN: ['代码压缩', 'WXSS文件'],
  LAZYCODE_LOADING_OPEN: ['代码包', '组件'],
  PLUGIN_OVER_SIZE: ['代码包', '插件'],
  IMAGE_AND_AUDIO_LIMIT: ['代码包', '图片和音频资源'],
  CONTAINS_UNUSED_PLUGINS: ['无使用或无依赖文件', '插件'],
  CONTAINS_UNUSED_COMPONENTS: ['无使用或无依赖文件', '组件'],
  CONTAINS_UNUSED_CODES: ['无使用或无依赖文件', '代码文件'],
  CONTAINS_APPSECRET: ['敏感信息', 'AppSecret']
}

// 使用 Node 随附的 Acorn 解析静态 require，避免注释、字符串或局部同名函数伪造依赖。
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

function hasUseStrictDirective(statements) {
  return statements.some((statement) => statement.directive === 'use strict')
}

function collectVarBindings(node, scope, allowAnnexB) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => collectVarBindings(item, scope, allowAnnexB))
    return
  }
  if (isFunction(node)) {
    if (allowAnnexB && node.type === 'FunctionDeclaration' && node.id) {
      scope.bindings.add(node.id.name)
    }
    return
  }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    node.declarations.forEach((declaration) => addPatternBindings(declaration.id, scope))
  }
  Object.values(node).forEach((value) => collectVarBindings(value, scope, allowAnnexB))
}

function hasBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return true
  }
  return false
}

function collectRequires(ast, requests) {
  function visit(node, scope, strictMode = false) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, scope, strictMode))
      return
    }
    if (node.type === 'Program') {
      const programScope = new Scope(scope)
      const programStrict = hasUseStrictDirective(node.body)
      addDirectBindings(node.body, programScope, true)
      collectVarBindings(node, programScope, !programStrict)
      visit(node.body, programScope, programStrict)
      return
    }
    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      const blockScope = new Scope(scope)
      addDirectBindings(node.body, blockScope, false)
      visit(node.body, blockScope, strictMode)
      return
    }
    if (isFunction(node)) {
      const functionScope = new Scope(scope)
      const functionStrict = strictMode || (
        node.body.type === 'BlockStatement'
        && hasUseStrictDirective(node.body.body)
      )
      if (node.id) functionScope.bindings.add(node.id.name)
      node.params.forEach((parameter) => addPatternBindings(parameter, functionScope))
      if (node.body.type === 'BlockStatement') {
        collectVarBindings(node.body, functionScope, !functionStrict)
      }
      visit(node.params, functionScope, functionStrict)
      visit(node.body, functionScope, functionStrict)
      return
    }
    if (node.type === 'CatchClause') {
      const catchScope = new Scope(scope)
      addPatternBindings(node.param, catchScope)
      visit(node.param, catchScope, strictMode)
      visit(node.body, catchScope, strictMode)
      return
    }
    if (node.type === 'WithStatement') {
      const withScope = new Scope(scope)
      withScope.bindings.add('require')
      visit(node.object, scope, strictMode)
      visit(node.body, withScope, strictMode)
      return
    }
    if (node.type === 'ForStatement') {
      const loopScope = new Scope(scope)
      if (node.init && node.init.type === 'VariableDeclaration' && node.init.kind !== 'var') {
        node.init.declarations.forEach((declaration) => addPatternBindings(declaration.id, loopScope))
      }
      visit(node.init, loopScope, strictMode)
      visit(node.test, loopScope, strictMode)
      visit(node.update, loopScope, strictMode)
      visit(node.body, loopScope, strictMode)
      return
    }
    if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
      const loopScope = new Scope(scope)
      if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') {
        node.left.declarations.forEach((declaration) => addPatternBindings(declaration.id, loopScope))
      }
      visit(node.left, loopScope, strictMode)
      visit(node.right, loopScope, strictMode)
      visit(node.body, loopScope, strictMode)
      return
    }
    if (node.type === 'SwitchStatement') {
      const switchScope = new Scope(scope)
      addDirectBindings(
        node.cases.flatMap((switchCase) => switchCase.consequent),
        switchScope,
        false
      )
      visit(node.discriminant, scope, strictMode)
      node.cases.forEach((switchCase) => {
        visit(switchCase.test, switchScope, strictMode)
        visit(switchCase.consequent, switchScope, strictMode)
      })
      return
    }
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const classScope = new Scope(scope)
      if (node.id) classScope.bindings.add(node.id.name)
      visit(node.superClass, scope, strictMode)
      visit(node.body, classScope, true)
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
    Object.values(node).forEach((value) => visit(value, scope, strictMode))
  }
  visit(ast, null)
}

for (const [file, source] of Object.entries(sources)) {
  let ast
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    })
  } catch (scriptError) {
    try {
      ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowAwaitOutsideFunction: true
      })
    } catch (moduleError) {
      moduleError.message = file + ': ' + moduleError.message
      throw moduleError
    }
  }
  const requests = []
  collectRequires(ast, requests)
  result[file] = requests
}

process.stdout.write(JSON.stringify(result))
`

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/').replace(/^\.\//, '')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function result(name, status, summary, details = []) {
  const [group, title] = RULE_META[name]
  return { name, group, title, status, summary, details }
}

function parseArguments(argv) {
  const options = { project: process.cwd(), json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      options.json = true
      continue
    }
    if (argument === '--project') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--project 缺少路径')
      options.project = value
      index += 1
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    throw new Error(`未知参数：${argument}`)
  }
  return options
}

function createCodeQualityChecker(projectPath) {
  const projectRoot = path.resolve(projectPath)
  const projectConfigPath = path.join(projectRoot, 'project.config.json')
  if (!fs.existsSync(projectConfigPath)) {
    throw new Error(`项目缺少 project.config.json：${projectRoot}`)
  }
  const projectConfig = readJson(projectConfigPath)
  const miniprogramRoot = path.resolve(projectRoot, projectConfig.miniprogramRoot || '.')
  const appJsonPath = path.join(miniprogramRoot, 'app.json')
  if (!fs.existsSync(appJsonPath)) {
    throw new Error(`小程序目录缺少 app.json：${miniprogramRoot}`)
  }
  const appConfig = readJson(appJsonPath)
  const subpackages = appConfig.subpackages || appConfig.subPackages || []
  const subpackageRoots = subpackages
    .map((item) => normalize(String(item.root || '')).replace(/\/+$/, ''))
    .filter(Boolean)
  const ignoreRules = (projectConfig.packOptions && projectConfig.packOptions.ignore) || []
  const includeRules = (projectConfig.packOptions && projectConfig.packOptions.include) || []
  const cloudRoot = projectConfig.cloudfunctionRoot
    ? normalize(path.relative(miniprogramRoot, path.resolve(projectRoot, projectConfig.cloudfunctionRoot)))
    : ''

  function exists(relativePath) {
    return fs.existsSync(path.join(miniprogramRoot, relativePath))
  }

  function isExplicitlyIncluded(relativePath) {
    return includeRules.some((rule) => normalize(String(rule.value || '')) === relativePath)
  }

  function isIgnored(relativePath) {
    if (!relativePath) return false
    if (relativePath === '.git' || relativePath.startsWith('.git/')) return true
    if (relativePath === 'node_modules' || relativePath.startsWith('node_modules/')) return true
    if (cloudRoot && cloudRoot !== '..' && !cloudRoot.startsWith('../')) {
      if (relativePath === cloudRoot || relativePath.startsWith(`${cloudRoot}/`)) return true
    }
    if (isExplicitlyIncluded(relativePath)) return false
    return ignoreRules.some((rule) => {
      const value = normalize(String(rule.value || '')).replace(/\/+$/, '')
      if (!value) return false
      return rule.type === 'folder'
        ? relativePath === value || relativePath.startsWith(`${value}/`)
        : relativePath === value
    })
  }

  function collectFiles() {
    const files = []
    function visit(relativePath) {
      if (isIgnored(relativePath)) return
      const absolutePath = path.join(miniprogramRoot, relativePath)
      const stat = fs.statSync(absolutePath)
      if (stat.isDirectory()) {
        fs.readdirSync(absolutePath, { withFileTypes: true })
          .sort((left, right) => left.name.localeCompare(right.name))
          .forEach((entry) => visit(normalize(path.join(relativePath, entry.name))))
      } else if (stat.isFile()) {
        files.push({ path: relativePath, size: stat.size })
      }
    }
    visit('')
    return files
  }

  const files = collectFiles()
  const fileSet = new Set(files.map((file) => file.path))

  function isSubpackageFile(relativePath) {
    return subpackageRoots.some(
      (root) => relativePath === root || relativePath.startsWith(`${root}/`)
    )
  }

  function resolveJavaScript(fromFile, request) {
    if (!request.startsWith('.') && !request.startsWith('/')) return ''
    const base = request.startsWith('/')
      ? normalize(request.replace(/^\/+/, ''))
      : normalize(path.join(path.dirname(fromFile), request))
    const candidates = [base, `${base}.js`, `${base}/index.js`]
    return candidates.find((candidate) => fileSet.has(candidate)) || ''
  }

  function resolveComponent(fromJson, request) {
    if (typeof request !== 'string' || (!request.startsWith('.') && !request.startsWith('/'))) {
      return ''
    }
    const base = request.startsWith('/')
      ? normalize(request.replace(/^\/+/, ''))
      : normalize(path.join(path.dirname(fromJson), request))
    const candidates = [base, `${base}/index`]
    return candidates.find((candidate) => fileSet.has(`${candidate}.json`)) || ''
  }

  function componentRequests(jsonFile) {
    if (!fileSet.has(jsonFile)) return []
    const config = readJson(path.join(miniprogramRoot, jsonFile))
    const requests = Object.values(config.usingComponents || {})
    for (const generic of Object.values(config.componentGenerics || {})) {
      if (generic && typeof generic === 'object' && generic.default) requests.push(generic.default)
    }
    return requests
  }

  function collectComponentGraph(entryJsonFiles) {
    const queue = [...entryJsonFiles]
    const visitedJson = new Set()
    const components = new Set()
    while (queue.length) {
      const jsonFile = queue.shift()
      if (!jsonFile || visitedJson.has(jsonFile) || !fileSet.has(jsonFile)) continue
      visitedJson.add(jsonFile)
      componentRequests(jsonFile).forEach((request) => {
        const component = resolveComponent(jsonFile, request)
        if (!component || components.has(component)) return
        components.add(component)
        queue.push(`${component}.json`)
      })
    }
    return components
  }

  const mainPages = (appConfig.pages || []).map(String)
  const subpackagePages = subpackages.flatMap((subpackage) => {
    const root = normalize(String(subpackage.root || '')).replace(/\/+$/, '')
    return (subpackage.pages || []).map((page) => `${root}/${page}`)
  })
  const mainJsonEntries = ['app.json', ...mainPages.map((page) => `${page}.json`)]
  const subJsonEntries = subpackagePages.map((page) => `${page}.json`)
  if (appConfig.tabBar && appConfig.tabBar.custom) mainJsonEntries.push('custom-tab-bar/index.json')
  const mainComponents = collectComponentGraph(mainJsonEntries)
  const subComponents = collectComponentGraph(subJsonEntries)

  function collectRequireMap() {
    const sources = {}
    files.filter((file) => file.path.endsWith('.js')).forEach((file) => {
      sources[file.path] = fs.readFileSync(path.join(miniprogramRoot, file.path), 'utf8')
    })
    const parsed = spawnSync(
      process.execPath,
      ['--expose-internals', '-e', ACORN_REQUIRE_PARSER],
      {
        cwd: miniprogramRoot,
        input: JSON.stringify(sources),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      }
    )
    if (parsed.status !== 0) {
      throw new Error(`无法解析静态 require 图：${String(parsed.stderr || parsed.stdout).trim()}`)
    }
    return JSON.parse(parsed.stdout)
  }

  const requireMap = collectRequireMap()

  function collectReachableJavaScript(entries) {
    const queue = [...entries]
    const reachable = new Set()
    while (queue.length) {
      const file = queue.shift()
      if (!file || reachable.has(file) || !fileSet.has(file)) continue
      reachable.add(file)
      for (const request of requireMap[file] || []) {
        const dependency = resolveJavaScript(file, request)
        if (dependency) queue.push(dependency)
      }
    }
    return reachable
  }

  const mainJsEntries = [
    'app.js',
    ...mainPages.map((page) => `${page}.js`),
    ...[...mainComponents].map((component) => `${component}.js`)
  ]
  if (appConfig.tabBar && appConfig.tabBar.custom) mainJsEntries.push('custom-tab-bar/index.js')
  const subJsEntries = [
    ...subpackagePages.map((page) => `${page}.js`),
    ...[...subComponents].map((component) => `${component}.js`)
  ]
  const mainReachableJs = collectReachableJavaScript(mainJsEntries)
  const subReachableJs = collectReachableJavaScript(subJsEntries)

  function findOtherPackageJavaScript() {
    const componentControllers = new Set(
      files
        .map((file) => file.path)
        .filter((file) => file.endsWith('.json') && file !== 'app.json')
        .filter((file) => {
          try {
            return readJson(path.join(miniprogramRoot, file)).component === true
          } catch (_) {
            return false
          }
        })
        .map((file) => file.replace(/\.json$/, '.js'))
    )
    const hasMainPackageJavaScriptParent = (candidate) => Object.entries(requireMap)
      .some(([source, requests]) => {
        if (isSubpackageFile(source)) return false
        return requests.some((request) => resolveJavaScript(source, request) === candidate)
      })

    return [...subReachableJs]
      .filter((file) => file.endsWith('.js') && !isSubpackageFile(file))
      // 官方依赖图会把页面/组件控制器挂到对应的主包 Page/Component 节点。
      .filter((file) => !mainJsEntries.includes(file) && !componentControllers.has(file))
      .filter((file) => !hasMainPackageJavaScriptParent(file))
      .sort()
  }

  function findOtherPackageComponents() {
    return [...subComponents]
      .filter((component) => !isSubpackageFile(component))
      .filter((component) => !mainComponents.has(component))
      .sort()
  }

  function findUnusedComponents() {
    const reachable = new Set([...mainComponents, ...subComponents])
    if (appConfig.tabBar && appConfig.tabBar.custom) reachable.add('custom-tab-bar/index')
    return files
      .map((file) => file.path)
      .filter((file) => file.endsWith('.json') && file !== 'app.json')
      .filter((file) => {
        try {
          return readJson(path.join(miniprogramRoot, file)).component === true
        } catch (_) {
          return false
        }
      })
      .map((file) => file.replace(/\.json$/, ''))
      .filter((component) => !reachable.has(component))
      .sort()
  }

  function findUnusedPlugins() {
    const aliases = Object.keys(appConfig.plugins || {})
    if (!aliases.length) return []
    const used = new Set()
    files.filter((file) => file.path.endsWith('.json')).forEach((file) => {
      const source = fs.readFileSync(path.join(miniprogramRoot, file.path), 'utf8')
      aliases.forEach((alias) => {
        if (source.includes(`plugin://${alias}/`) || source.includes(`plugin-private://${alias}/`)) {
          used.add(alias)
        }
      })
    })
    files.filter((file) => file.path.endsWith('.js')).forEach((file) => {
      const source = fs.readFileSync(path.join(miniprogramRoot, file.path), 'utf8')
      aliases.forEach((alias) => {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`requirePlugin\\(\\s*['\"]${escaped}['\"]\\s*\\)`).test(source)) used.add(alias)
      })
    })
    return aliases.filter((alias) => !used.has(alias)).sort()
  }

  function collectImageAudioAssets() {
    return files
      .filter((file) => ASSET_EXTENSIONS.has(path.extname(file.path).toLowerCase()))
      .map((file) => ({
        path: file.path,
        size: file.size
      }))
  }

  function findAppSecrets() {
    const matches = []
    const pattern = /(?:app[_-]?secret|secret)\s*[=:]\s*['"]([a-f\d]{32})['"]/i
    files.forEach((file) => {
      if (!SCANNABLE_SECRET_EXTENSIONS.has(path.extname(file.path).toLowerCase())) return
      const source = fs.readFileSync(path.join(miniprogramRoot, file.path), 'utf8')
      if (pattern.test(source)) matches.push(file.path)
    })
    return matches.sort()
  }

  function run() {
    const findings = []
    const setting = projectConfig.setting || {}
    findings.push(result(
      'PACKAGE_SIZE_LIMIT',
      'manual',
      '官方 1.5 M 规则以依赖裁剪、编译和压缩后的主包为准，需用 DevTools 复核'
    ))

    const otherJs = findOtherPackageJavaScript()
    findings.push(result(
      'CONTAINS_OTHER_PKG_JS',
      otherJs.length ? 'fail' : 'pass',
      otherJs.length ? `发现 ${otherJs.length} 个仅被分包依赖的主包 JS` : '未发现仅被分包依赖的主包 JS',
      otherJs
    ))

    findings.push(result(
      'CONTAINS_OTHER_PKG_COMPONENTS',
      'manual',
      '组件归包会受 DevTools 构建器的组件复制与依赖裁剪影响，需用官方面板复核'
    ))

    findings.push(result(
      'JS_COMPRESS_OPEN',
      setting.minified === true ? 'pass' : 'fail',
      setting.minified === true ? '已开启 JS 压缩' : 'project.config.json 未开启 setting.minified'
    ))
    findings.push(result(
      'WXML_COMPRESS_OPEN',
      setting.minifyWXML === true ? 'pass' : 'fail',
      setting.minifyWXML === true ? '已开启 WXML 压缩' : 'project.config.json 未开启 setting.minifyWXML'
    ))
    findings.push(result(
      'WXSS_COMPRESS_OPEN',
      setting.minifyWXSS === true ? 'pass' : 'fail',
      setting.minifyWXSS === true ? '已开启 WXSS 压缩' : 'project.config.json 未开启 setting.minifyWXSS'
    ))
    findings.push(result(
      'LAZYCODE_LOADING_OPEN',
      appConfig.lazyCodeLoading === 'requiredComponents' ? 'pass' : 'fail',
      appConfig.lazyCodeLoading === 'requiredComponents'
        ? '已启用组件按需注入'
        : 'app.json 未配置 lazyCodeLoading: requiredComponents'
    ))

    const pluginAliases = Object.keys(appConfig.plugins || {})
    findings.push(result(
      'PLUGIN_OVER_SIZE',
      pluginAliases.length ? 'manual' : 'pass',
      pluginAliases.length
        ? '插件大小需要以 DevTools 编译包结果复核（官方阈值 200 K）'
        : '项目未声明插件'
    ))

    const imageAudioAssets = collectImageAudioAssets()
    const imageAudioTotalBytes = imageAudioAssets.reduce((total, file) => total + file.size, 0)
    const imageAudioTotalKilobytes = (imageAudioTotalBytes / 1024).toFixed(1)
    const imageAudioOverLimit = imageAudioTotalBytes > ASSET_LIMIT_BYTES
    findings.push(result(
      'IMAGE_AND_AUDIO_LIMIT',
      imageAudioOverLimit ? 'fail' : 'pass',
      imageAudioOverLimit
        ? `图片和音频资源合计 ${imageAudioTotalKilobytes} K，超过 200 K`
        : `图片和音频资源合计 ${imageAudioTotalKilobytes} K，未超过 200 K`,
      imageAudioOverLimit
        ? imageAudioAssets.map((file) => `${file.path} (${(file.size / 1024).toFixed(1)} K)`)
        : []
    ))

    const unusedPlugins = findUnusedPlugins()
    findings.push(result(
      'CONTAINS_UNUSED_PLUGINS',
      unusedPlugins.length ? 'fail' : 'pass',
      unusedPlugins.length ? `发现 ${unusedPlugins.length} 个未使用插件声明` : '未发现未使用插件声明',
      unusedPlugins
    ))

    findings.push(result(
      'CONTAINS_UNUSED_COMPONENTS',
      'manual',
      '完整未使用组件规则依赖 DevTools 构建后的组件图，脚本不以源码目录冒充包内结果'
    ))

    findings.push(result(
      'CONTAINS_UNUSED_CODES',
      'manual',
      '完整无依赖文件规则依赖 DevTools 代码依赖分析，脚本不冒充官方结果'
    ))

    const appSecrets = findAppSecrets()
    findings.push(result(
      'CONTAINS_APPSECRET',
      appSecrets.length ? 'fail' : 'pass',
      appSecrets.length ? `发现 ${appSecrets.length} 个疑似 AppSecret 文件（内容未输出）` : '未发现高置信 AppSecret 字面量',
      appSecrets
    ))

    return {
      projectRoot,
      miniprogramRoot,
      rules: RULE_ORDER.map((name) => findings.find((item) => item.name === name))
    }
  }

  return {
    run,
    findOtherPackageJavaScript,
    findOtherPackageComponents,
    findUnusedComponents
  }
}

function printHuman(report) {
  let currentGroup = ''
  const icons = { pass: '通过', fail: '未通过', manual: '需复核' }
  for (const rule of report.rules) {
    if (rule.group !== currentGroup) {
      currentGroup = rule.group
      process.stdout.write(`\n${currentGroup}\n`)
    }
    process.stdout.write(`- [${icons[rule.status]}] ${rule.title}：${rule.summary}\n`)
    rule.details.forEach((detail) => process.stdout.write(`  - ${detail}\n`))
  }
  const counts = report.rules.reduce((summary, rule) => {
    summary[rule.status] += 1
    return summary
  }, { pass: 0, fail: 0, manual: 0 })
  process.stdout.write(
    `\n汇总：通过 ${counts.pass}，未通过 ${counts.fail}，需 DevTools 复核 ${counts.manual}。\n`
  )
}

function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
    if (options.help) {
      process.stdout.write('用法：check-code-quality.js [--project /absolute/project] [--json]\n')
      return
    }
    const report = createCodeQualityChecker(options.project).run()
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    else printHuman(report)
    if (report.rules.some((rule) => rule.status === 'fail')) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`代码质量预检失败：${error.message}\n`)
    process.exitCode = 2
  }
}

if (require.main === module) main()

module.exports = {
  createCodeQualityChecker,
  parseArguments,
  PACKAGE_LIMIT_BYTES,
  ASSET_LIMIT_BYTES
}
