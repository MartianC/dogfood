const { shanghaiDateKey } = require('./sharedMealRecordCalendarModel')

const HOME_STATUS = Object.freeze({
  INITIALIZING: 'initializing',
  GUEST: 'guest',
  DATA_ERROR: 'data-error',
  DRAFT: 'draft',
  PROFILE_REQUIRED: 'profile-required',
  TODAY_EMPTY: 'today-empty',
  TODAY_HAS_RECORDS: 'today-has-records'
})

// 启动生命周期与业务状态分离，避免用 guest 代表示认证尚未完成。
const HOME_LOAD_STATUS = Object.freeze({
  INITIALIZING: 'initializing',
  READY: 'ready',
  PARTIAL: 'partial',
  ERROR: 'error'
})

const PRIMARY_TASK_TYPE = Object.freeze({
  LOGIN_AND_CONTINUE: 'login-and-continue',
  CREATE_PROFILE: 'create-profile',
  RESUME_DRAFT: 'resume-draft',
  START_SHARED_MEAL: 'start-shared-meal',
  VIEW_TODAY_RECORDS: 'view-today-records'
})

const PROFILE_ISSUE_COPY = Object.freeze({
  profile_incomplete: {
    kind: 'profile',
    title: '档案信息还不完整',
    description: '补充档案后再开始记餐。'
  },
  missing_birth_date: {
    kind: 'profile',
    title: '补充出生日期',
    description: '完善出生日期，才能继续判断档案状态。'
  },
  missing_breed: {
    kind: 'profile',
    title: '补充品种',
    description: '完善品种信息，才能继续判断档案状态。'
  },
  invalid_weight: {
    kind: 'profile',
    title: '补充当前体重',
    description: '完善当前体重，才能继续记餐。'
  },
  invalid_daily_meals: {
    kind: 'profile',
    title: '补充每日餐数',
    description: '完善每日餐数，才能继续记餐。'
  },
  missing_activity_duration: {
    kind: 'profile',
    title: '补充日均活动时长',
    description: '完善日均活动时长，才能继续记餐。'
  },
  missing_body_condition: {
    kind: 'profile',
    title: '补充体况',
    description: '完善体况，才能继续记餐。'
  },
  missing_expected_adult_weight: {
    kind: 'profile',
    title: '补充预估成犬体重',
    description: '完善预估成犬体重，才能继续记餐。'
  },
  unconfirmed_disease_status: {
    kind: 'profile',
    title: '确认特殊营养情况',
    description: '确认档案中的特殊营养情况后再继续。'
  },
  unconfirmed_reproductive_status: {
    kind: 'profile',
    title: '确认生理状态',
    description: '确认档案中的生理状态后再继续。'
  },
  unconfirmed_therapeutic_weight_management: {
    kind: 'profile',
    title: '确认体重管理状态',
    description: '确认档案中的体重管理状态后再继续。'
  },
  invalid_special_nutrition_needs: {
    kind: 'profile',
    title: '检查特殊营养情况',
    description: '档案中的特殊营养情况需要重新确认。'
  },
  not_applicable: {
    kind: 'applicability',
    title: '当前档案状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  under_eight_weeks: {
    kind: 'applicability',
    title: '当前年龄暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  diagnosed_disease: {
    kind: 'applicability',
    title: '当前特殊状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  pregnant: {
    kind: 'applicability',
    title: '当前生理状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  lactating: {
    kind: 'applicability',
    title: '当前生理状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  therapeutic_weight_loss: {
    kind: 'applicability',
    title: '当前体重管理状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  },
  therapeutic_weight_gain: {
    kind: 'applicability',
    title: '当前体重管理状态暂不适用',
    description: '当前档案状态暂不适用共享本餐。'
  }
})

const DEFAULT_PROFILE_ISSUE = Object.freeze({
  kind: 'profile',
  title: '档案需要确认',
  description: '检查档案信息后再继续记餐。'
})

const DEFAULT_DATA_ERROR = Object.freeze({
  code: 'HOME_DATA_UNAVAILABLE',
  title: '首页数据暂时无法读取',
  description: '稍后重试；你仍然可以记一顿。',
  retryable: true
})

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value, fallback = '') {
  const result = String(value == null ? '' : value).trim()
  return result || fallback
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))]
}

function dogName(dog) {
  return text(dog && dog.name, '狗狗')
}

function dogId(dog) {
  return text(dog && (dog.id || dog._id))
}

function validTimestamp(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function sortNewestFirst(records) {
  return records
    .map((record, index) => ({ record, index, timestamp: validTimestamp(record && record.mealTime) }))
    .sort((left, right) => {
      if (left.timestamp === null && right.timestamp === null) return left.index - right.index
      if (left.timestamp === null) return 1
      if (right.timestamp === null) return -1
      return right.timestamp - left.timestamp || left.index - right.index
    })
    .map((item) => item.record)
}

function recordView(record) {
  if (!isObject(record)) return null
  const menuText = asArray(record.humanMenu)
    .map((item) => text(item && item.title))
    .filter(Boolean)
    .join('、')
  const id = text(record.id || record._id)
  const dogSnapshot = isObject(record.dogSnapshot) ? record.dogSnapshot : {}
  return {
    id,
    dogId: text(record.targetDogId || dogSnapshot.id),
    dogName: dogName(dogSnapshot),
    menuText: menuText || '这一顿',
    ingredientCount: asArray(record.dogMealItems).length,
    mealTime: record.mealTime || null,
    snapshotText: '查看保存时快照'
  }
}

function normalizeRecords(records) {
  return sortNewestFirst(asArray(records))
    .map(recordView)
    .filter(Boolean)
}

function shanghaiDateParts(value) {
  const timestamp = validTimestamp(value)
  if (timestamp === null) return null
  const date = new Date(timestamp + 8 * 60 * 60 * 1000)
  return {
    dateKey: shanghaiDateKey(value),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes()
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function draftUpdatedAt(draft) {
  return draft && (draft.updatedAt || draft.lastEditedAt || draft.createdAt || draft.mealTime)
}

function formatDraftUpdatedAt(value, now = new Date()) {
  const parts = shanghaiDateParts(value)
  if (!parts) return '草稿仍在编辑'
  const nowKey = shanghaiDateKey(now)
  const timeText = `${pad(parts.hours)}:${pad(parts.minutes)}`
  if (parts.dateKey === nowKey) return `今天 ${timeText} 更新`
  return `${parts.month}月${parts.day}日 ${timeText} 更新`
}

function draftView(input, now) {
  const source = isObject(input) && isObject(input.draft) ? input.draft : input
  if (!isObject(source)) return null
  if (input && input.status && !['resumable', 'restored'].includes(input.status)) return null
  if (!source.id || !asArray(source.humanMenus).length) return null

  const menuText = uniqueStrings(asArray(source.humanMenus).map((menu) => menu && menu.title)).join('、')
  return {
    id: text(source.id),
    dogId: dogId(source.dog),
    dogName: dogName(source.dog),
    menuText: menuText || '已选菜单',
    updatedAt: draftUpdatedAt(source) || null,
    updatedAtText: formatDraftUpdatedAt(draftUpdatedAt(source), now),
    status: 'resumable'
  }
}

function issueCodesForProfile(dog, state) {
  const source = isObject(state) ? state : {}
  const eligibility = isObject(source.eligibility)
    ? source.eligibility
    : isObject(source.applicability)
      ? source.applicability
      : isObject(dog && dog.eligibility)
        ? dog.eligibility
        : isObject(dog && dog.applicability) ? dog.applicability : null
  const explicitIssues = Array.isArray(source.issues)
    ? source.issues
    : Array.isArray(dog && dog.profileIssues) ? dog.profileIssues : []
  const codes = explicitIssues.map((issue) => (
    isObject(issue) ? issue.code : issue
  ))

  if (eligibility && Array.isArray(eligibility.reasonCodes)) {
    codes.push(...eligibility.reasonCodes)
  }
  if (eligibility && !codes.length) {
    if (eligibility.status === 'incomplete') codes.push('profile_incomplete')
    if (eligibility.status === 'blocked' || eligibility.status === 'ineligible') {
      codes.push('not_applicable')
    }
  }
  if (
    !codes.length
    && (
      source.profileStatus === 'incomplete'
      || source.completeness === 'incomplete'
      || dog && dog.profileStatus === 'incomplete'
      || dog && dog.profileIncomplete === true
    )
  ) codes.push('profile_incomplete')
  return uniqueStrings(codes)
}

function profileStateFor(dog, profileStates) {
  const id = dogId(dog)
  return asArray(profileStates).find((state) => (
    isObject(state) && text(state.dogId || state.id || state.dog && state.dog.id) === id
  )) || {}
}

function buildProfileIssues(dogs, profileStates, explicitIssues) {
  const result = []
  const seen = new Set()
  const dogList = asArray(dogs)
  const suppliedIssues = asArray(explicitIssues)

  suppliedIssues.forEach((issue) => {
    if (!isObject(issue)) return
    const key = `${text(issue.dogId || issue.dog && issue.dog.id)}:${text(issue.code) || 'profile_incomplete'}`
    if (seen.has(key)) return
    seen.add(key)
    const copy = PROFILE_ISSUE_COPY[issue.code] || DEFAULT_PROFILE_ISSUE
    result.push({
      key,
      dogId: text(issue.dogId || issue.dog && issue.dog.id),
      dogName: text(issue.dogName || issue.dog && issue.dog.name, '狗狗'),
      code: text(issue.code, 'profile_incomplete'),
      kind: text(issue.kind, copy.kind),
      title: text(issue.title, copy.title),
      description: text(issue.description, copy.description),
      action: 'edit-dog'
    })
  })

  dogList.forEach((dog) => {
    const state = profileStateFor(dog, profileStates)
    issueCodesForProfile(dog, state).forEach((code) => {
      if (result.length >= 3) return
      const key = `${dogId(dog)}:${code}`
      if (seen.has(key)) return
      seen.add(key)
      const copy = PROFILE_ISSUE_COPY[code] || DEFAULT_PROFILE_ISSUE
      result.push({
        key,
        dogId: dogId(dog),
        dogName: dogName(dog),
        code,
        kind: copy.kind,
        title: copy.title,
        description: copy.description,
        action: 'edit-dog'
      })
    })
  })

  return result.slice(0, 3)
}

function normalizeHomeItems(items) {
  return asArray(items)
    .filter((item) => isObject(item) && text(item.dogId) && text(item.action))
    .map((item) => {
      const dogIdValue = text(item.dogId)
      const kind = text(item.kind, 'record')
      const recordId = text(item.recordId)
      return {
        key: text(item.key, `${kind}:${dogIdValue}:${recordId}`),
        dogId: dogIdValue,
        dogName: text(item.dogName, '狗狗'),
        kind,
        title: text(item.title, '查看记录'),
        description: text(item.description),
        action: text(item.action),
        recordId,
        measuredOn: text(item.measuredOn),
        nextDate: text(item.nextDate)
      }
    })
}

function buildHomeIssues(dogs, profileStates, explicitIssues, homeItems) {
  return buildProfileIssues(dogs, profileStates, explicitIssues)
    .concat(normalizeHomeItems(homeItems))
    .slice(0, 3)
}

function isErrorLike(value) {
  if (value === true) return true
  if (!value) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (value instanceof Error) return true
  if (!isObject(value)) return false
  return value.status === 'error'
    || value.status === 'failed'
    || value.failed === true
    || value.hasError === true
    || Boolean(value.error)
    || Boolean(value.code)
    || Boolean(value.message)
}

function hasDataError(input) {
  if (isErrorLike(input.errors) || isErrorLike(input.error)) return true
  if (input.loadStatus === 'error' || input.dataStatus === 'error') return true
  return isObject(input.errors) && Object.values(input.errors).some(isErrorLike)
}

function errorView() {
  return { ...DEFAULT_DATA_ERROR }
}

function todayDogNames(records) {
  return uniqueStrings(records.map((record) => record.dogName))
}

function subjectText(names) {
  if (names.length === 1) return names[0]
  if (names.length > 1) return `${names.length} 只狗狗`
  return '今天'
}

function createPrimaryTask(status, context) {
  const { draft, todayRecords, todayNames, error } = context
  if (status === HOME_STATUS.INITIALIZING) {
    return {
      type: null,
      label: '正在准备首页',
      description: '正在确认登录状态，请稍候。',
      preserveMealIntent: false
    }
  }
  if (status === HOME_STATUS.GUEST) {
    return {
      type: PRIMARY_TASK_TYPE.LOGIN_AND_CONTINUE,
      label: '登录并继续',
      description: '登录后继续原来的记餐意图。',
      preserveMealIntent: true
    }
  }
  if (status === HOME_STATUS.DATA_ERROR) {
    return {
      type: PRIMARY_TASK_TYPE.START_SHARED_MEAL,
      label: '记一顿',
      description: error.description,
      preserveMealIntent: false
    }
  }
  if (status === HOME_STATUS.DRAFT) {
    return {
      type: PRIMARY_TASK_TYPE.RESUME_DRAFT,
      label: '查看草稿',
      description: `${draft.dogName} · ${draft.updatedAtText}`,
      draftId: draft.id,
      preserveMealIntent: true
    }
  }
  if (status === HOME_STATUS.PROFILE_REQUIRED) {
    return {
      type: PRIMARY_TASK_TYPE.CREATE_PROFILE,
      label: '新增狗狗档案',
      description: '保存后会回到当前记餐流程。',
      preserveMealIntent: true
    }
  }
  if (status === HOME_STATUS.TODAY_HAS_RECORDS) {
    return {
      type: PRIMARY_TASK_TYPE.VIEW_TODAY_RECORDS,
      label: '查看今天的本餐记录',
      description: `${subjectText(todayNames)} · ${todayRecords.length} 次保存快照`,
      preserveMealIntent: false
    }
  }
  return {
    type: PRIMARY_TASK_TYPE.START_SHARED_MEAL,
    label: '记一顿',
    description: '记录今天和狗狗共享的一顿饭。',
    preserveMealIntent: false
  }
}

function createTodaySummary(status, todayRecords, todayNames, error) {
  if (status === HOME_STATUS.INITIALIZING) {
    return {
      status: 'loading',
      title: '正在准备今天的记录',
      description: '确认登录状态后加载首页内容。',
      count: 0,
      dogNames: []
    }
  }
  if (status === HOME_STATUS.GUEST) {
    return {
      status: 'unavailable',
      title: '登录后查看今天的记录',
      description: '登录后才能看到今天和最近的本餐记录。',
      count: 0,
      dogNames: []
    }
  }
  if (status === HOME_STATUS.DATA_ERROR) {
    return {
      status: 'error',
      title: '今天的记录暂时无法读取',
      description: error.description,
      count: 0,
      dogNames: []
    }
  }
  if (status === HOME_STATUS.PROFILE_REQUIRED) {
    return {
      status: 'profile-required',
      title: '先添加狗狗档案',
      description: '保存档案后，就可以开始记录本餐。',
      count: 0,
      dogNames: []
    }
  }
  if (status === HOME_STATUS.DRAFT) {
    return {
      status: 'draft',
      title: '有一份草稿还在继续',
      description: '查看草稿，决定继续编辑还是重新开始。',
      count: 0,
      dogNames: []
    }
  }
  if (status === HOME_STATUS.TODAY_HAS_RECORDS) {
    return {
      status: 'has-records',
      title: `${subjectText(todayNames)}已记录 ${todayRecords.length} 次`,
      description: '这里展示已保存的本餐快照。',
      count: todayRecords.length,
      dogNames: todayNames
    }
  }
  return {
    status: 'empty',
    title: '今天还没有记录',
    description: '记下第一顿后，会在这里显示今天的本餐摘要。',
    count: 0,
    dogNames: []
  }
}

function createRecentSummary(recentRecords) {
  const recentRecord = recentRecords[0] || null
  return {
    status: recentRecord ? 'available' : 'empty',
    title: '最近一顿',
    description: recentRecord
      ? '查看保存时的本餐快照。'
      : '保存第一顿后，会在这里显示最近的单餐快照。',
    record: recentRecord
  }
}

function buildHomeState(input = {}) {
  const source = isObject(input) ? input : {}
  const providedAuthState = text(source.authState)
  const authState = ['guest', 'logged-in', 'has-profile'].includes(providedAuthState)
    ? providedAuthState
    : 'unknown'
  const requestedLoadStatus = text(source.loadStatus || source.dataStatus)
  const loadStatus = requestedLoadStatus || (
    authState === 'unknown' ? HOME_LOAD_STATUS.INITIALIZING : HOME_LOAD_STATUS.READY
  )
  const dogs = asArray(source.dogs || source.profiles)
  const todayRecords = normalizeRecords(source.todayRecords)
  const recentRecords = normalizeRecords(source.recentRecords)
  const error = errorView()
  const hasError = authState !== 'guest' && hasDataError(source)
  const draft = draftView(source.draft, source.now || new Date())
  let status = HOME_STATUS.TODAY_EMPTY

  if (loadStatus === HOME_LOAD_STATUS.INITIALIZING || authState === 'unknown') status = HOME_STATUS.INITIALIZING
  else if (authState === 'guest') status = HOME_STATUS.GUEST
  else if (hasError) status = HOME_STATUS.DATA_ERROR
  else if (draft) status = HOME_STATUS.DRAFT
  else if (dogs.length === 0) status = HOME_STATUS.PROFILE_REQUIRED
  else if (todayRecords.length > 0) status = HOME_STATUS.TODAY_HAS_RECORDS

  const homeIssues = buildHomeIssues(
    dogs,
    source.profileStates,
    source.profileIssues,
    source.homeItems
  )
  const todayNames = todayDogNames(todayRecords)
  const recent = status === HOME_STATUS.DATA_ERROR || status === HOME_STATUS.GUEST || status === HOME_STATUS.INITIALIZING
    ? []
    : recentRecords

  const visibleHomeIssues = status === HOME_STATUS.DATA_ERROR || status === HOME_STATUS.GUEST || status === HOME_STATUS.INITIALIZING
    ? []
    : homeIssues

  return {
    status,
    state: status,
    authState,
    loadStatus,
    primaryTask: createPrimaryTask(status, {
      draft,
      todayRecords,
      todayNames,
      error
    }),
    todaySummary: createTodaySummary(status, todayRecords, todayNames, error),
    profileIssues: visibleHomeIssues,
    homeIssues: visibleHomeIssues,
    draft: status === HOME_STATUS.DRAFT ? draft : null,
    recentRecords: recent,
    recentRecord: recent[0] || null,
    recentSummary: createRecentSummary(recent),
    error: status === HOME_STATUS.DATA_ERROR ? error : null
  }
}

module.exports = {
  HOME_STATUS,
  HOME_LOAD_STATUS,
  PRIMARY_TASK_TYPE,
  PROFILE_ISSUE_COPY,
  buildHomeState,
  buildProfileIssues,
  buildHomeIssues,
  normalizeHomeItems,
  recordView,
  normalizeRecords,
  draftView,
  formatDraftUpdatedAt,
  shanghaiDateKey
}
