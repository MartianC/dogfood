#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sourceIconDirectory = path.join(
  root,
  'node_modules',
  'tdesign-miniprogram',
  'miniprogram_dist',
  'icon'
)
const builtIconDirectory = path.join(
  root,
  'miniprogram_npm',
  'tdesign-miniprogram',
  'icon'
)

const iconTemplate = `<wxs src="../common/utils.wxs" module="_"/>
<view
  class="{{ prefix ? prefix : classPrefix}} class {{componentPrefix}}-class"
  style="{{_._style([iconStyle, style, customStyle])}}"
  bind:tap="onTap"
  aria-hidden="{{ariaHidden}}"
  aria-label="{{ariaLabel}}"
  aria-role="{{ariaRole}}"
>
  <image
    class="{{classPrefix}}__image"
    src="{{isImage ? name : '/assets/icons/tdesign/' + name + '.svg'}}"
    mode="aspectFit"
  />
</view>
`

const iconStyles = `@import '../common/style/index.wxss';

.t-icon {
  display: inline-flex;
  width: 1em;
  height: 1em;
  align-items: center;
  justify-content: center;
  line-height: 1;
  vertical-align: middle;
}

.t-icon__image {
  display: block;
  width: 1em;
  height: 1em;
}
`

function patchIconDirectory(directory) {
  if (!fs.existsSync(directory)) return false
  fs.writeFileSync(path.join(directory, 'icon.wxml'), iconTemplate)
  fs.writeFileSync(path.join(directory, 'icon.wxss'), iconStyles)
  fs.rmSync(path.join(directory, 'tdesign-icon.woff'), { force: true })
  return true
}

function main() {
  if (!patchIconDirectory(sourceIconDirectory)) {
    throw new Error('未找到 tdesign-miniprogram，请先运行 npm install')
  }
  patchIconDirectory(builtIconDirectory)
  process.stdout.write('TDesign Icon 已切换为本地 SVG 资源。\n')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`替换 TDesign Icon 失败：${error.message}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  iconStyles,
  iconTemplate,
  patchIconDirectory
}
