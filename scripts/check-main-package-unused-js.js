#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PROJECT_ROOT = path.join(__dirname, '..')
const PLAIN_JS_DIRS = ['config', 'data', 'services', 'utils']
const REQUIRE_PATTERN = /require\(\s*['"]([^'"]+)['"]\s*\)/g

function exists(relativePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, relativePath))
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function resolveJavaScript(fromFile, request) {
  if (!request.startsWith('.')) return ''
  const base = path.resolve(PROJECT_ROOT, path.dirname(fromFile), request)
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')]
  const target = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  return target ? normalize(path.relative(PROJECT_ROOT, target)) : ''
}

function usingComponentsOf(jsonFile) {
  if (!exists(jsonFile)) return []
  const config = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, jsonFile), 'utf8'))
  return Object.values(config.usingComponents || {}).filter((value) => value.startsWith('.'))
}

function componentJavaScript(fromJson, request) {
  const base = path.resolve(PROJECT_ROOT, path.dirname(fromJson), request)
  const target = fs.existsSync(`${base}.js`) ? `${base}.js` : path.join(base, 'index.js')
  return fs.existsSync(target) ? normalize(path.relative(PROJECT_ROOT, target)) : ''
}

function collectReachableMainJavaScript() {
  const appConfig = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'app.json'), 'utf8'))
  const queue = ['app.js', ...(appConfig.pages || []).map((page) => `${page}.js`)]
  const componentQueue = ['app.json', ...(appConfig.pages || []).map((page) => `${page}.json`)]
  if (appConfig.tabBar && appConfig.tabBar.custom) {
    queue.push('custom-tab-bar/index.js')
    componentQueue.push('custom-tab-bar/index.json')
  }

  const reachable = new Set()
  const visitedComponentJson = new Set()

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
    const source = fs.readFileSync(path.join(PROJECT_ROOT, jsFile), 'utf8')
    for (const match of source.matchAll(REQUIRE_PATTERN)) {
      const dependency = resolveJavaScript(jsFile, match[1])
      if (dependency) queue.push(dependency)
    }
  }

  return reachable
}

function collectPlainMainJavaScript() {
  const files = []
  function visit(relativeDir) {
    const absoluteDir = path.join(PROJECT_ROOT, relativeDir)
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

if (require.main === module) {
  const unused = findUnusedMainPackageJavaScript()
  if (unused.length) {
    console.error(`发现 ${unused.length} 个主包未使用 JS：`)
    unused.forEach((file) => console.error(`- ${file}`))
    process.exit(1)
  }
  console.log('未发现主包未使用 JS。')
}

module.exports = {
  collectReachableMainJavaScript,
  findUnusedMainPackageJavaScript
}
