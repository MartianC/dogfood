const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  const now = new Date()
  const users = db.collection('users')
  const existed = await users.where({ openId }).limit(1).get()

  let user
  if (existed.data.length) {
    user = existed.data[0]
  } else {
    const result = await users.add({
      data: {
        openId,
        nickname: '狗饭用户',
        avatarUrl: '',
        createdAt: now,
        updatedAt: now
      }
    })
    user = {
      _id: result._id,
      openId,
      nickname: '狗饭用户',
      avatarUrl: '',
      createdAt: now,
      updatedAt: now
    }
  }

  return {
    token: openId,
    user: {
      id: user._id,
      openId: user.openId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  }
}
