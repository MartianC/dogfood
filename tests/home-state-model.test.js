const test = require('node:test')
const assert = require('node:assert/strict')

const {
  HOME_STATUS,
  HOME_LOAD_STATUS,
  PRIMARY_TASK_TYPE,
  buildHomeState,
  buildProfileIssues,
  buildHomeIssues,
  draftView,
  formatDraftUpdatedAt
} = require('../services/homeStateModel')

const dog = {
  id: 'dog-1',
  name: '布丁'
}

const FIXED_NOW = new Date('2026-08-02T04:00:00.000Z')

function record({ id, dogName = '布丁', menu = '番茄炒蛋', mealTime = '2026-08-02T04:00:00.000Z' } = {}) {
  return {
    id: id || `record-${dogName}`,
    mealTime,
    dogSnapshot: { id: `snapshot-${dogName}`, name: dogName },
    humanMenu: [{ title: menu }],
    dogMealItems: [{ name: '番茄' }]
  }
}

test('认证未决时使用启动态，不把未知认证误判为游客', () => {
  const state = buildHomeState({
    loadStatus: HOME_LOAD_STATUS.INITIALIZING,
    authState: 'unknown',
    dogs: [dog],
    todayRecords: [record()],
    recentRecords: [record({ id: 'recent-1' })]
  })

  assert.equal(state.status, HOME_STATUS.INITIALIZING)
  assert.equal(state.state, HOME_STATUS.INITIALIZING)
  assert.equal(state.authState, 'unknown')
  assert.equal(state.loadStatus, HOME_LOAD_STATUS.INITIALIZING)
  assert.notEqual(state.status, HOME_STATUS.GUEST)
  assert.equal(state.primaryTask.type, null)
  assert.doesNotMatch(state.primaryTask.label, /登录并继续/)
  assert.doesNotMatch(state.todaySummary.title, /登录后/)
  assert.equal(state.recentRecord, null)
})

test('未提供认证状态时默认保持启动态，认证完成为游客后才显示游客态', () => {
  const initializing = buildHomeState()
  assert.equal(initializing.authState, 'unknown')
  assert.equal(initializing.loadStatus, HOME_LOAD_STATUS.INITIALIZING)
  assert.equal(initializing.status, HOME_STATUS.INITIALIZING)

  const guest = buildHomeState({ authState: 'guest' })
  assert.equal(guest.authState, 'guest')
  assert.equal(guest.loadStatus, HOME_LOAD_STATUS.READY)
  assert.equal(guest.status, HOME_STATUS.GUEST)
  assert.equal(guest.primaryTask.type, PRIMARY_TASK_TYPE.LOGIN_AND_CONTINUE)
})

test('游客状态只保留登录主任务，不展示或伪造历史数据', () => {
  const state = buildHomeState({
    authState: 'guest',
    dogs: [dog],
    todayRecords: [record()],
    recentRecords: [record({ id: 'recent-1' })]
  })

  assert.equal(state.status, HOME_STATUS.GUEST)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.LOGIN_AND_CONTINUE)
  assert.equal(state.primaryTask.preserveMealIntent, true)
  assert.equal(state.todaySummary.status, 'unavailable')
  assert.equal(state.recentRecord, null)
  assert.deepEqual(state.recentRecords, [])
  assert.deepEqual(state.profileIssues, [])
})

test('已登录但没有档案时主任务是新增档案，并保留记餐意图', () => {
  const state = buildHomeState({ authState: 'logged-in' })

  assert.equal(state.status, HOME_STATUS.PROFILE_REQUIRED)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.CREATE_PROFILE)
  assert.equal(state.primaryTask.label, '新增狗狗档案')
  assert.equal(state.primaryTask.preserveMealIntent, true)
  assert.equal(state.todaySummary.status, 'profile-required')
})

test('可恢复草稿优先于普通首页状态，并展示狗狗、菜单和更新时间', () => {
  const state = buildHomeState({
    authState: 'has-profile',
    dogs: [dog],
    draft: {
      status: 'resumable',
      draft: {
        id: 'draft-1',
        dog,
        humanMenus: [{ title: '鸡肉饭' }],
        mealTime: '2026-08-02T03:15:00.000Z'
      }
    },
    todayRecords: [record()],
    now: FIXED_NOW
  })

  assert.equal(state.status, HOME_STATUS.DRAFT)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.RESUME_DRAFT)
  assert.equal(state.primaryTask.draftId, 'draft-1')
  assert.match(state.primaryTask.description, /布丁/)
  assert.match(state.primaryTask.description, /今天 11:15 更新/)
  assert.equal(state.draft.menuText, '鸡肉饭')
  assert.equal(state.todaySummary.status, 'draft')
})

test('今天没有记录时提供记一顿主任务，并保留真实最近一顿', () => {
  const state = buildHomeState({
    authState: 'has-profile',
    dogs: [dog],
    todayRecords: [],
    recentRecords: [record({ id: 'recent-1', mealTime: '2026-08-01T04:00:00.000Z' })]
  })

  assert.equal(state.status, HOME_STATUS.TODAY_EMPTY)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.START_SHARED_MEAL)
  assert.equal(state.primaryTask.title, '准备今天这一顿')
  assert.equal(state.primaryTask.label, '记一顿')
  assert.equal(state.todaySummary.status, 'empty')
  assert.equal(state.recentRecord.id, 'recent-1')
  assert.equal(state.recentRecord.snapshotText, '查看保存时快照')
})

test('今天有记录时主任务仍为记一顿，并按最新时间展示真实快照', () => {
  const state = buildHomeState({
    authState: 'has-profile',
    dogs: [dog],
    todayRecords: [
      record({ id: 'record-old', mealTime: '2026-08-02T03:00:00.000Z' }),
      record({ id: 'record-new', menu: '牛肉饭', mealTime: '2026-08-02T06:00:00.000Z' })
    ],
    recentRecords: [record({ id: 'record-new', menu: '牛肉饭', mealTime: '2026-08-02T06:00:00.000Z' })]
  })

  assert.equal(state.status, HOME_STATUS.TODAY_HAS_RECORDS)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.START_SHARED_MEAL)
  assert.equal(state.primaryTask.title, '准备下一顿')
  assert.equal(state.primaryTask.label, '记一顿')
  assert.equal(state.primaryTask.description, '布丁今天已记录 2 次，继续记录下一顿。')
  assert.equal(state.todaySummary.count, 2)
  assert.deepEqual(state.todaySummary.dogNames, ['布丁'])
  assert.equal(state.recentRecord.menuText, '牛肉饭')
})

test('任一首页数据读取失败时使用稳定降级，不展示不可靠记录但仍可记一顿', () => {
  const state = buildHomeState({
    authState: 'has-profile',
    dogs: [dog],
    errors: { records: { status: 'error', code: 'NETWORK_ERROR' } },
    todayRecords: [record()],
    recentRecords: [record({ id: 'untrusted-record' })]
  })

  assert.equal(state.status, HOME_STATUS.DATA_ERROR)
  assert.equal(state.primaryTask.type, PRIMARY_TASK_TYPE.START_SHARED_MEAL)
  assert.equal(state.primaryTask.label, '记一顿')
  assert.equal(state.todaySummary.status, 'error')
  assert.equal(state.error.code, 'HOME_DATA_UNAVAILABLE')
  assert.equal(state.recentRecord, null)
  assert.deepEqual(state.recentRecords, [])
})

test('档案事项消费完整性和适用性结果，最多输出三条并保持狗狗归属', () => {
  const issues = buildProfileIssues(
    [
      { id: 'dog-1', name: '布丁' },
      { id: 'dog-2', name: '可乐' }
    ],
    [
      {
        dogId: 'dog-1',
        eligibility: {
          status: 'incomplete',
          reasonCodes: ['missing_breed', 'invalid_weight', 'missing_body_condition']
        }
      },
      {
        dogId: 'dog-2',
        eligibility: { status: 'blocked' }
      }
    ]
  )

  assert.equal(issues.length, 3)
  assert.deepEqual(issues.map((issue) => issue.code), [
    'missing_breed',
    'invalid_weight',
    'missing_body_condition'
  ])
  assert.equal(issues[0].dogName, '布丁')
  assert.equal(issues[0].action, 'edit-dog')
  assert.equal(issues[2].code, 'missing_body_condition')

  const blockedIssue = buildProfileIssues(
    [{ id: 'dog-3', name: '豆包' }],
    [{ dogId: 'dog-3', applicability: { status: 'blocked' } }]
  )
  assert.equal(blockedIssue[0].code, 'not_applicable')
  assert.equal(blockedIssue[0].kind, 'applicability')
})

test('首页将档案、体重和护理事项合并为最多三条，并保留不同跳转动作', () => {
  const issues = buildHomeIssues(
    [{ id: 'dog-1', name: '布丁' }],
    [],
    [],
    [
      {
        key: 'care:dog-1:care-1',
        kind: 'care',
        action: 'open-care',
        dogId: 'dog-1',
        dogName: '布丁',
        title: '计划中的下次「疫苗」：2026年8月8日',
        description: '布丁 · 狂犬病疫苗'
      },
      {
        key: 'weight:dog-1:weight-1',
        kind: 'weight',
        action: 'open-weight',
        dogId: 'dog-1',
        dogName: '布丁',
        title: '体重记录',
        description: '上次记录于 1 天前'
      },
      {
        key: 'care:dog-1:care-2',
        kind: 'care',
        action: 'open-care',
        dogId: 'dog-1',
        dogName: '布丁',
        title: '计划中的下次「体内驱虫」：2026年9月8日',
        description: '布丁'
      },
      {
        key: 'care:dog-1:care-3',
        kind: 'care',
        action: 'open-care',
        dogId: 'dog-1',
        dogName: '布丁',
        title: '计划中的下次「其他护理」：2026年10月8日',
        description: '布丁'
      }
    ]
  )

  assert.equal(issues.length, 3)
  assert.deepEqual(issues.map((issue) => issue.action), [
    'open-care',
    'open-weight',
    'open-care'
  ])
})

test('损坏或失效草稿不会进入有草稿状态', () => {
  assert.equal(draftView({ status: 'invalid', draft: null }), null)
  assert.equal(draftView({ id: 'empty-draft', dog, humanMenus: [] }), null)
})

test('草稿时间无效时使用稳定文案，跨天时间按上海时区格式化', () => {
  assert.equal(formatDraftUpdatedAt('not-a-date'), '草稿仍在编辑')
  assert.equal(
    formatDraftUpdatedAt('2026-08-01T15:30:00.000Z', new Date('2026-08-02T00:00:00.000Z')),
    '8月1日 23:30 更新'
  )
})
