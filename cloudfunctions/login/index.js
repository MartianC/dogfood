const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function normalizeAvatarUrl(value) {
  return typeof value === 'string' ? value.trim().slice(0, 2048) : ''
}

function toClientUser(user) {
  return {
    id: user._id,
    openId: user.openId,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  const now = new Date()
  const users = db.collection('users')
  const existed = await users.where({ openId }).limit(1).get()

  let user
  if (existed.data.length) {
    user = existed.data[0]
    if (event.action === 'updateProfile') {
      const avatarUrl = normalizeAvatarUrl(event.profile && event.profile.avatarUrl)
      await users.doc(user._id).update({
        data: { avatarUrl, updatedAt: now }
      })
      user = { ...user, avatarUrl, updatedAt: now }
    }
  } else {
    const avatarUrl = event.action === 'updateProfile'
      ? normalizeAvatarUrl(event.profile && event.profile.avatarUrl)
      : ''
    const result = await users.add({
      data: {
        openId,
        nickname: '爪饭用户',
        avatarUrl,
        createdAt: now,
        updatedAt: now
      }
    })
    user = {
      _id: result._id,
      openId,
      nickname: '爪饭用户',
      avatarUrl,
      createdAt: now,
      updatedAt: now
    }
  }

  return {
    token: openId,
    user: toClientUser(user)
  }
}
