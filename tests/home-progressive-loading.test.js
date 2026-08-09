const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const model = require('../services/homeStateModel')

const wxmlPath = path.join(__dirname, '..', 'pages/home/index.wxml')
const wxssPath = path.join(__dirname, '..', 'pages/home/index.wxss')

test('H6：首页分区拥有独立的加载、空和错误表达', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')
  assert.match(wxml, /todaySummary\.status === 'error'/)
  assert.match(wxml, /homeItemsStatus === 'loading'/)
  assert.match(wxml, /homeItemsStatus === 'error'/)
  assert.match(wxml, /homeItemsStatus === 'empty'/)
  assert.match(wxml, /recentSummary\.status === 'empty'/)
  assert.match(wxml, /recentSummary\.status === 'error'/)
})

test('H6：数据请求未完成时今天、最近一顿和事项不会误显示为空', () => {
  const state = model.buildHomeState({
    authState: 'has-profile',
    loadStatus: model.HOME_LOAD_STATUS.PARTIAL,
    dogs: [{ id: 'dog-1', name: '布丁' }]
  })
  assert.equal(state.todaySummary.status, 'loading')
  assert.equal(state.recentSummary.status, 'loading')
  assert.equal(state.homeItemsStatus, 'loading')
})

test('H6：分区样式为动态文案预留高度并继承页面底部安全区', () => {
  const wxss = fs.readFileSync(wxssPath, 'utf8')
  assert.match(wxss, /\.home-summary\s*\{[\s\S]*min-height/)
  assert.match(wxss, /\.home-section__state\s*\{[\s\S]*min-height/)
  const appWxss = fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')
  assert.match(appWxss, /\.page\.with-tab-bar[\s\S]*safe-area-inset-bottom/)
})
