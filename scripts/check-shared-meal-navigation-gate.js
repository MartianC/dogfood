const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const gate = JSON.parse(fs.readFileSync(path.join(root, 'contracts/shared-meal/navigation-migration-gate-v1.json'), 'utf8'))
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

gate.requiredEvidence.forEach((relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) throw new Error(`缺少导航迁移证据：${relativePath}`)
})

const tabs = appConfig.tabBar.list.map((item) => item.text)
if (JSON.stringify(tabs) !== JSON.stringify(gate.tabs)) throw new Error('主导航尚未切换为首页、记录、我的')

const legacyPaths = ['pages/recipes/list/index', 'pages/recipes/detail/index', 'pages/plan/index/index']
legacyPaths.forEach((pagePath) => {
  if (!appConfig.pages.includes(pagePath)) throw new Error(`旧兼容路由已被删除：${pagePath}`)
  if (appConfig.tabBar.list.some((item) => item.pagePath === pagePath)) throw new Error(`旧路由仍暴露为主入口：${pagePath}`)
})

const result = spawnSync(process.execPath, ['--test', ...gate.requiredEvidence], {
  cwd: root,
  encoding: 'utf8'
})
if (result.status !== 0) throw new Error(`导航迁移核心证据未通过：\n${result.stdout}\n${result.stderr}`)
console.log('Shared meal navigation gate passed.')
