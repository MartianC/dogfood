function openAvatarEditor(tempFilePath, onEdited) {
  if (!tempFilePath || typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
    return false
  }

  wx.navigateTo({
    url: '/pages/profile/avatar-edit/index',
    events: {
      avatarEdited: (payload) => {
        const editedPath = payload && payload.tempFilePath
        if (editedPath && typeof onEdited === 'function') onEdited(editedPath)
      }
    },
    success: ({ eventChannel }) => {
      if (eventChannel && typeof eventChannel.emit === 'function') {
        eventChannel.emit('avatarEditorInit', { tempFilePath })
      }
    },
    fail: () => {
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '打开头像编辑失败，请重试', icon: 'none' })
      }
    }
  })
  return true
}

module.exports = {
  openAvatarEditor
}
