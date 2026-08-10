const MAIN_TABS = [
  { value: 'home', label: '首页', pagePath: 'pages/home/index' },
  { value: 'records', label: '记录', pagePath: 'pages/records/index' },
  { value: 'dogs', label: '爱宠', pagePath: 'pages/dogs/index' },
  { value: 'profile', label: '我的', pagePath: 'pages/profile/index/index' }
]

const LEGACY_COMPATIBLE_PATHS = [
  'pages/recipes/list/index',
  'pages/recipes/detail/index',
  'pages/plan/index/index',
  'subpackages/plan-extra/detail/index'
]

module.exports = { MAIN_TABS, LEGACY_COMPATIBLE_PATHS }
