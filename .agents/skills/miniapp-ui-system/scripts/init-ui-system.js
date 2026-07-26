#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)

function readFlag(name) {
  return args.includes(name)
}

function readValue(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1 || index === args.length - 1) return fallback
  return args[index + 1]
}

const projectRoot = path.resolve(readValue('--project', process.cwd()))
const dryRun = readFlag('--dry-run')
const force = readFlag('--force')
const withFigma = readFlag('--with-figma')
const tokenPrefix = normalizeTokenPrefix(readValue('--token-prefix', 'mp'))

function normalizeTokenPrefix(value) {
  const normalized = String(value || 'mp')
    .trim()
    .replace(/^--/, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return normalized || 'mp'
}

function applyTokenPrefix(content) {
  if (tokenPrefix === 'mp') return content
  return content.replace(/--mp-/g, `--${tokenPrefix}-`)
}

function readBundledFile(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8')
}

const files = {
  'styles/tokens.wxss': `page {
  --mp-color-bg: #f6f7f9;
  --mp-color-surface: #ffffff;
  --mp-color-surface-muted: #eef2f6;
  --mp-color-text: #17202a;
  --mp-color-text-secondary: #344054;
  --mp-color-muted: #667085;
  --mp-color-line: #d0d5dd;
  --mp-color-line-strong: #98a2b3;
  --mp-color-primary: #2563eb;
  --mp-color-on-primary: #ffffff;
  --mp-color-primary-soft: #eaf1ff;
  --mp-color-warning: #b54708;
  --mp-color-warning-soft: #fff4e5;

  --mp-radius-sm: 12rpx;
  --mp-radius-md: 18rpx;
  --mp-radius-lg: 20rpx;
  --mp-radius-xl: 24rpx;
  --mp-radius-pill: 999rpx;

  --mp-space-1: 8rpx;
  --mp-space-2: 12rpx;
  --mp-space-3: 16rpx;
  --mp-space-4: 20rpx;
  --mp-space-5: 24rpx;
  --mp-space-6: 32rpx;

  --mp-font-xs: 22rpx;
  --mp-font-sm: 24rpx;
  --mp-font-md: 28rpx;
  --mp-font-lg: 32rpx;
  --mp-font-xl: 44rpx;

  --mp-touch-min: 88rpx;
  --mp-shadow-card: 0 12rpx 32rpx rgba(16, 24, 40, 0.06);
  --mp-shadow-hero: 0 16rpx 40rpx rgba(16, 24, 40, 0.08);
}
`,
  'styles/typography.wxss': `.mp-heading-xl {
  color: var(--mp-color-text);
  font-size: var(--mp-font-xl);
  line-height: 1.2;
  font-weight: 800;
}

.mp-heading-lg {
  color: var(--mp-color-text);
  font-size: var(--mp-font-lg);
  line-height: 1.25;
  font-weight: 800;
}

.mp-body {
  color: var(--mp-color-text-secondary);
  font-size: var(--mp-font-md);
  line-height: 1.55;
}

.mp-caption {
  color: var(--mp-color-muted);
  font-size: var(--mp-font-sm);
  line-height: 1.45;
}
`,
  'styles/utilities.wxss': `.mp-stack {
  display: flex;
  flex-direction: column;
  gap: var(--mp-space-4);
}

.mp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-space-4);
}

.mp-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: var(--mp-space-6) var(--mp-space-6) 48rpx;
}

.mp-page-with-bottom-action {
  padding-bottom: calc(176rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(176rpx + env(safe-area-inset-bottom));
}
`,
  'components/ui/ui-button/index.json': `{
  "component": true,
  "styleIsolation": "isolated"
}
`,
  'components/ui/ui-button/index.wxml': `<button
  class="ui-button ui-button--{{variant}} ui-button--{{size}} {{block ? 'ui-button--block' : ''}}"
  disabled="{{disabled || loading}}"
  loading="{{loading}}"
  open-type="{{openType}}"
  bindtap="handleTap"
>
  <slot />
</button>
`,
  'components/ui/ui-button/index.js': `Component({
  properties: {
    variant: { type: String, value: 'primary' },
    size: { type: String, value: 'large' },
    block: { type: Boolean, value: true },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    openType: { type: String, value: '' },
  },
  methods: {
    handleTap(event) {
      if (this.properties.disabled || this.properties.loading) return
      this.triggerEvent('tap', event.detail)
    },
  },
})
`,
  'components/ui/ui-button/index.wxss': `.ui-button {
  min-height: var(--mp-touch-min);
  box-sizing: border-box;
  padding: 0 28rpx;
  border-radius: var(--mp-radius-lg);
  border: 1rpx solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mp-color-text-secondary);
  background: var(--mp-color-surface);
  font-size: 30rpx;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
}

.ui-button::after {
  border: 0;
}

.ui-button--block {
  width: 100%;
}

.ui-button--medium {
  min-height: 80rpx;
  font-size: 28rpx;
}

.ui-button--small {
  min-height: 64rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
}

.ui-button--primary {
  color: var(--mp-color-on-primary);
  background: var(--mp-color-primary);
  border-color: var(--mp-color-primary);
}

.ui-button--secondary {
  color: var(--mp-color-text-secondary);
  background: var(--mp-color-surface);
  border-color: var(--mp-color-line-strong);
}

.ui-button--warning {
  color: var(--mp-color-on-primary);
  background: var(--mp-color-warning);
  border-color: var(--mp-color-warning);
}

.ui-button--ghost {
  color: var(--mp-color-primary);
  background: var(--mp-color-primary-soft);
  border-color: transparent;
}

.ui-button[disabled] {
  opacity: 0.56;
}
`,
  'components/ui/ui-card/index.json': `{
  "component": true,
  "styleIsolation": "isolated"
}
`,
  'components/ui/ui-card/index.wxml': `<view class="ui-card ui-card--{{variant}} ui-card--{{padding}}">
  <slot />
</view>
`,
  'components/ui/ui-card/index.js': `Component({
  properties: {
    variant: { type: String, value: 'surface' },
    padding: { type: String, value: 'medium' },
  },
})
`,
  'components/ui/ui-card/index.wxss': `.ui-card {
  box-sizing: border-box;
  border: 1rpx solid var(--mp-color-line);
  border-radius: var(--mp-radius-lg);
  background: var(--mp-color-surface);
  box-shadow: var(--mp-shadow-card);
}

.ui-card--soft {
  background: var(--mp-color-surface-muted);
  box-shadow: none;
}

.ui-card--primary {
  color: var(--mp-color-on-primary);
  background: var(--mp-color-primary);
  border-color: var(--mp-color-primary);
}

.ui-card--none {
  padding: 0;
}

.ui-card--small {
  padding: var(--mp-space-4);
}

.ui-card--medium {
  padding: var(--mp-space-5);
}

.ui-card--large {
  padding: var(--mp-space-6);
}
`,
  'components/ui/ui-tag/index.json': `{
  "component": true,
  "styleIsolation": "isolated"
}
`,
  'components/ui/ui-tag/index.wxml': `<text class="ui-tag ui-tag--{{variant}} ui-tag--{{size}}">
  <slot />
</text>
`,
  'components/ui/ui-tag/index.js': `Component({
  properties: {
    variant: { type: String, value: 'neutral' },
    size: { type: String, value: 'medium' },
  },
})
`,
  'components/ui/ui-tag/index.wxss': `.ui-tag {
  display: inline-flex;
  align-items: center;
  min-height: 44rpx;
  box-sizing: border-box;
  padding: 0 16rpx;
  border-radius: var(--mp-radius-pill);
  font-size: 23rpx;
  font-weight: 700;
  line-height: 1;
}

.ui-tag--small {
  min-height: 34rpx;
  padding: 0 12rpx;
  font-size: 20rpx;
}

.ui-tag--neutral {
  color: var(--mp-color-text-secondary);
  background: var(--mp-color-surface-muted);
}

.ui-tag--good {
  color: var(--mp-color-primary);
  background: var(--mp-color-primary-soft);
}

.ui-tag--warning {
  color: var(--mp-color-warning);
  background: var(--mp-color-warning-soft);
}
`,
  'components/ui/ui-notice/index.json': `{
  "component": true,
  "styleIsolation": "isolated"
}
`,
  'components/ui/ui-notice/index.wxml': `<view class="ui-notice ui-notice--{{variant}}">
  <slot />
</view>
`,
  'components/ui/ui-notice/index.js': `Component({
  properties: {
    variant: { type: String, value: 'neutral' },
  },
})
`,
  'components/ui/ui-notice/index.wxss': `.ui-notice {
  box-sizing: border-box;
  padding: 20rpx 22rpx;
  border-radius: var(--mp-radius-md);
  color: var(--mp-color-text-secondary);
  background: var(--mp-color-surface-muted);
  line-height: 1.5;
}

.ui-notice--good {
  color: var(--mp-color-primary);
  background: var(--mp-color-primary-soft);
}

.ui-notice--warning {
  color: var(--mp-color-warning);
  background: var(--mp-color-warning-soft);
}
`,
  'components/ui/ui-field/index.json': `{
  "component": true,
  "styleIsolation": "isolated"
}
`,
  'components/ui/ui-field/index.wxml': `<view class="ui-field">
  <view wx:if="{{label}}" class="ui-field__label">{{label}}</view>
  <view class="ui-field__body">
    <slot />
  </view>
  <view wx:if="{{help}}" class="ui-field__help">{{help}}</view>
</view>
`,
  'components/ui/ui-field/index.js': `Component({
  properties: {
    label: { type: String, value: '' },
    help: { type: String, value: '' },
  },
})
`,
  'components/ui/ui-field/index.wxss': `.ui-field {
  box-sizing: border-box;
  min-height: 108rpx;
  padding: 16rpx 20rpx;
  border: 1rpx solid var(--mp-color-line);
  border-radius: var(--mp-radius-lg);
  background: var(--mp-color-surface);
}

.ui-field__label {
  margin-bottom: 10rpx;
  color: var(--mp-color-muted);
  font-size: var(--mp-font-sm);
}

.ui-field__body {
  min-height: 58rpx;
  color: var(--mp-color-text);
  font-size: 30rpx;
}

.ui-field__help {
  margin-top: 8rpx;
  color: var(--mp-color-muted);
  font-size: var(--mp-font-xs);
  line-height: 1.4;
}
`,
  'components/ui/ui-empty/index.json': `{
  "component": true,
  "styleIsolation": "isolated",
  "usingComponents": {
    "ui-button": "../ui-button/index"
  }
}
`,
  'components/ui/ui-empty/index.wxml': `<view class="ui-empty">
  <image wx:if="{{imageUrl}}" class="ui-empty__image" src="{{imageUrl}}" mode="aspectFill" />
  <view class="ui-empty__title">{{title}}</view>
  <view wx:if="{{description}}" class="ui-empty__description">{{description}}</view>
  <view wx:if="{{actionText}}" class="ui-empty__action">
    <ui-button bind:tap="handleAction">{{actionText}}</ui-button>
  </view>
</view>
`,
  'components/ui/ui-empty/index.js': `Component({
  properties: {
    imageUrl: { type: String, value: '' },
    title: { type: String, value: '暂无内容' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },
  methods: {
    handleAction() {
      this.triggerEvent('action')
    },
  },
})
`,
  'components/ui/ui-empty/index.wxss': `.ui-empty {
  box-sizing: border-box;
  padding: 64rpx 32rpx;
  border: 1rpx solid var(--mp-color-line);
  border-radius: var(--mp-radius-lg);
  background: var(--mp-color-surface);
  text-align: center;
}

.ui-empty__image {
  width: 96rpx;
  height: 96rpx;
  display: block;
  margin: 0 auto;
  border-radius: var(--mp-radius-pill);
  background: var(--mp-color-primary-soft);
}

.ui-empty__title {
  margin-top: 24rpx;
  color: var(--mp-color-text);
  font-size: var(--mp-font-lg);
  font-weight: 800;
}

.ui-empty__description {
  margin-top: 12rpx;
  color: var(--mp-color-muted);
  line-height: 1.5;
}

.ui-empty__action {
  margin-top: 28rpx;
}
`,
  'components/vendor/.gitkeep': '',
  'docs/ui/design-system.md': `# 小程序 UI 设计系统

## 设计语气

面向当前小程序的核心用户，界面应当清晰、可信、克制，并匹配产品所在行业的语气。不要在通用组件里写入业务承诺、行业术语或特定品牌表达。

## Token 来源

所有颜色、圆角、阴影、间距、字号先定义在 \`styles/tokens.wxss\`。页面和组件不直接新增裸色值。

## 基础组件

- \`ui-button\`: 主操作、次操作、风险操作、轻量操作。
- \`ui-card\`: 信息容器。
- \`ui-tag\`: 状态和属性标签。
- \`ui-notice\`: 提醒、风险、建议。
- \`ui-field\`: 表单字段容器。
- \`ui-empty\`: 空状态。

如果项目已引入组件库，基础视觉组件优先包装组件库能力，再暴露为 \`ui-*\`；只有复杂、强视觉、高自定义需求才自研。

## 第三方组件

第三方组件只能通过 \`components/ui/*\` 或 \`components/vendor/*\` 进入业务代码，页面不直接使用组件库标签。
`,
  'docs/ui/component-contracts.md': `# UI 组件契约

## 通用约定

- 组件命名使用 \`ui-*\`。
- 变体使用 \`variant\`。
- 尺寸使用 \`size\`。
- 状态使用 \`disabled\`、\`loading\`。
- 事件透出使用业务语义清晰的事件名。
- 已引入组件库时，基础视觉组件优先包装组件库组件；自研基础组件需要说明组件库不适合的原因。

## 样式隔离

所有 \`components/ui/*\` 默认声明：

\`\`\`json
{
  "component": true,
  "styleIsolation": "isolated"
}
\`\`\`

如需外部覆盖，只能通过明确的 \`externalClasses\`，不要依赖页面全局样式穿透。
`,
  'docs/ui/ai-frontend-rules.md': `# AI 前端开发规则

## 新增 UI 前

先说明：

- 使用哪些 token。
- 使用哪些 \`components/ui/*\`。
- 如果项目有组件库，为什么使用或不使用组件库组件。
- 是否新增组件或变体。
- 是否包装第三方组件。
- 影响哪些页面。
- 如果来自 Figma，使用了哪个 frame、哪些 token map、哪些 component map。

## 禁止项

- 禁止新增裸 hex 色值到普通页面/组件。
- 禁止新增 \`.button\`、\`.card\`、\`.tag\`、\`.notice\`、\`.title\` 等全局泛名。
- 禁止页面直接引用第三方组件库组件。
- 有组件库时，禁止跳过组件库直接重复自研基础视觉组件。
- 有 Figma 时，先提取和确认 token，不直接写页面样式。
- Figma 自动生成代码只能作为参考，不能跳过项目组件体系。
- Figma 里的硬编码值要记录为设计债务，不能默认照抄。
- 禁止低于 \`88rpx\` 的主要点击目标。

## 验证

\`\`\`bash
npm run check:ui
npm test
\`\`\`

Figma 设计稿落地后，还要写 \`docs/ui/figma-implementation-notes.md\`，记录设计稿来源、实现差异和无法等价还原的原因。
`,
  'scripts/check-ui-system.js': `#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = process.cwd()
const errors = []
const forbiddenClassNames = ['button', 'card', 'tag', 'notice', 'title', 'row', 'input']
const thirdPartyTags = [
  { library: 'TDesign', pattern: /<\\s*t-[a-z0-9-]+/gi },
  { library: 'Vant', pattern: /<\\s*van-[a-z0-9-]+/gi },
]
const allowedRawColorFiles = new Set([
  path.normalize('styles/tokens.wxss'),
])

function canUseThirdPartyTags(normalizedPath) {
  return normalizedPath.startsWith(path.normalize('components/ui/')) ||
    normalizedPath.startsWith(path.normalize('components/vendor/'))
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'miniprogram_npm') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

function readJsonIfExists(rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (error) {
    errors.push(rel + ': JSON 格式无效，' + error.message)
    return null
  }
}

function isMapped(item) {
  return !item.status || item.status === 'mapped'
}

function validateFigmaSourceManifest() {
  const rel = 'docs/ui/figma-source-manifest.json'
  const manifest = readJsonIfExists(rel)
  if (!manifest) return
  if (manifest.status === 'draft') return
  if (!manifest.fileKey) errors.push(rel + ': 缺少 fileKey')
  if (!manifest.nodeId) errors.push(rel + ': 缺少 nodeId')
  if (!Number.isFinite(Number(manifest.frameWidthPx)) || Number(manifest.frameWidthPx) <= 0) {
    errors.push(rel + ': frameWidthPx 必须是正数')
  }
}

function validateFigmaTokenMap() {
  const rel = 'docs/ui/figma-token-map.json'
  const data = readJsonIfExists(rel)
  if (!data) return
  const tokens = Array.isArray(data) ? data : data.tokens
  if (!Array.isArray(tokens)) {
    errors.push(rel + ': tokens 必须是数组')
    return
  }
  const tokenFile = path.join(root, 'styles/tokens.wxss')
  const tokenText = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : ''
  for (const [index, token] of tokens.entries()) {
    if (!token || typeof token !== 'object') {
      errors.push(rel + ': tokens[' + index + '] 必须是对象')
      continue
    }
    if (!isMapped(token)) continue
    for (const field of ['name', 'type', 'target', 'value']) {
      if (token[field] === undefined || token[field] === '') {
        errors.push(rel + ': tokens[' + index + '] 缺少 ' + field)
      }
    }
    if (token.target && !String(token.target).startsWith('--')) {
      errors.push(rel + ': tokens[' + index + '] target 必须以 -- 开头')
    }
    if (tokenText && token.target && !tokenText.includes(String(token.target) + ':')) {
      errors.push(rel + ': ' + token.target + ' 未写入 styles/tokens.wxss')
    }
  }
}

function validateFigmaComponentMap() {
  const rel = 'docs/ui/figma-component-map.json'
  const data = readJsonIfExists(rel)
  if (!data) return
  const mappings = Array.isArray(data)
    ? data
    : Array.isArray(data.mappings)
      ? data.mappings
      : Object.entries(data).map(([name, value]) => ({ name, ...value }))
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== 'object') {
      errors.push(rel + ': mapping[' + index + '] 必须是对象')
      continue
    }
    if (!isMapped(mapping)) continue
    if (!mapping.target) {
      errors.push(rel + ': mapping[' + index + '] 缺少 target')
      continue
    }
    if (!fs.existsSync(path.join(root, mapping.target))) {
      errors.push(rel + ': ' + mapping.target + ' 不存在')
    }
  }
}

for (const file of walk(root)) {
  const rel = path.relative(root, file)
  const normalized = path.normalize(rel)
  if (!/\\.(wxss|wxml)$/.test(rel)) continue
  const text = fs.readFileSync(file, 'utf8')

  if (rel.endsWith('.wxml') && !canUseThirdPartyTags(normalized)) {
    for (const { library, pattern } of thirdPartyTags) {
      pattern.lastIndex = 0
      if (pattern.test(text)) {
        errors.push(rel + ': 禁止页面或业务组件直接使用 ' + library + ' 标签，请先包装到 components/ui/* 或 components/vendor/*')
      }
    }
    if (/<\\s*button\\b/i.test(text)) {
      errors.push(rel + ': 页面或业务组件不应直接实现基础按钮，请使用 ui-button 或组件库 wrapper')
    }
  }

  if (rel.endsWith('.wxss') && !allowedRawColorFiles.has(normalized)) {
    const rawColors = text.match(/#[0-9a-fA-F]{3,8}\\b/g)
    if (rawColors) {
      errors.push(rel + ': 避免直接写颜色 ' + [...new Set(rawColors)].join(', ') + '，请先加到 styles/tokens.wxss')
    }
  }

  if (rel.endsWith('.wxss')) {
    for (const name of forbiddenClassNames) {
      const re = new RegExp('(^|\\\\n)\\\\s*\\\\.' + name + '(\\\\s|[.{:#,>+~])')
      if (re.test(text)) {
        errors.push(rel + ': 禁止新增全局泛名 .' + name + '，请使用 ui-* 或业务前缀')
      }
    }
  }
}

validateFigmaSourceManifest()
validateFigmaTokenMap()
validateFigmaComponentMap()

if (errors.length) {
  console.error(errors.map((item) => '- ' + item).join('\\n'))
  process.exit(1)
}

console.log('UI system checks passed.')
`,
}

const packageScript = 'node scripts/check-ui-system.js'
const figmaPackageScript = `node scripts/figma-tokens-to-wxss.js --input docs/ui/figma-token-map.json --output styles/tokens.wxss --prefix ${tokenPrefix} --dry-run`
const aiEntrypointCandidates = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
  '.windsurfrules',
]
const aiDocsIndexStart = '<!-- miniapp-ui-system:docs:start -->'
const aiDocsIndexEnd = '<!-- miniapp-ui-system:docs:end -->'
const aiDocsIndexBlock = `${aiDocsIndexStart}
### UI 系统文档入口

- \`docs/ui/design-system.md\`：设计 token、颜色语义、排版、间距、圆角、阴影和页面布局规则。
- \`docs/ui/component-contracts.md\`：\`components/ui/*\` 的 props、events、slots、状态和样式隔离契约。
- \`docs/ui/ai-frontend-rules.md\`：AI 或开发者修改 UI 前后的规则、禁止项和验证命令。
- \`scripts/check-ui-system.js\`：UI 静态检查入口；全项目必须通过，不再使用迁移期 baseline。
${aiDocsIndexEnd}`

const figmaFiles = {
  'docs/ui/figma-handoff.md': `# Figma Handoff

## Source

- Figma file:
- Frame / layer:
- Node id:
- Frame width px:
- Source method: mcp | rest | manual
- Component library: none | tdesign | vant | weui

## Workflow

1. Fill \`figma-source-manifest.json\`.
2. Map variables in \`figma-token-map.json\`.
3. Map components in \`figma-component-map.json\`.
4. Convert confirmed tokens with \`scripts/figma-tokens-to-wxss.js\`.
5. Implement via \`components/ui/*\`, \`components/vendor/*\`, and \`components/domain/*\`.
6. Record differences in \`figma-implementation-notes.md\`.

Do not paste Figma Dev Mode CSS directly into page WXSS.
`,
  'docs/ui/figma-source-manifest.json': `${JSON.stringify(
    {
      status: 'draft',
      fileKey: '',
      nodeId: '',
      sourceMethod: 'manual',
      figmaVersion: '',
      branch: '',
      frameWidthPx: 375,
      tokenPrefix,
      componentLibrary: 'none',
      notes: '',
    },
    null,
    2
  )}\n`,
  'docs/ui/figma-token-map.json': `{
  "tokens": [
    {
      "sourceKind": "figma-variable",
      "collection": "Base",
      "name": "Color/Primary",
      "type": "color",
      "mode": "default",
      "value": "#2563eb",
      "unit": "none",
      "aliasChain": [],
      "scope": "button,link,focus",
      "target": "--mp-color-primary",
      "status": "mapped",
      "reason": "初始化示例；请按真实 Figma variable 更新"
    },
    {
      "sourceKind": "figma-variable",
      "collection": "Base",
      "name": "Radius/Medium",
      "type": "radius",
      "mode": "default",
      "value": "18rpx",
      "unit": "rpx",
      "aliasChain": [],
      "scope": "card,button,input",
      "target": "--mp-radius-md",
      "status": "mapped",
      "reason": "初始化示例；请按真实 Figma variable 更新"
    },
    {
      "sourceKind": "figma-variable",
      "collection": "Base",
      "name": "Spacing/4",
      "type": "spacing",
      "mode": "default",
      "value": "20rpx",
      "unit": "rpx",
      "aliasChain": [],
      "scope": "layout",
      "target": "--mp-space-4",
      "status": "mapped",
      "reason": "初始化示例；请按真实 Figma variable 更新"
    }
  ]
}
`,
  'docs/ui/figma-component-map.json': `{
  "Button/Primary": {
    "source": {
      "fileKey": "",
      "nodeId": "",
      "component": "Button",
      "variant": "Primary"
    },
    "targetKind": "ui",
    "target": "components/ui/ui-button",
    "library": "none",
    "props": {
      "variant": "primary",
      "size": "large"
    },
    "status": "mapped",
    "reason": "初始化示例；有组件库时优先包装组件库能力"
  }
}
`,
  'docs/ui/figma-implementation-notes.md': `# Figma Implementation Notes

## Source

- Figma file:
- Frame:
- Node id:
- Frame width:

## Token Changes

- Pending.

## Component Mapping

- Pending.

## Differences

- Pending.

## Verification

- [ ] \`npm run check:ui\`
- [ ] \`npm test\`
- [ ] 微信开发者工具编译
- [ ] 关键页面截图人工比对
`,
  'scripts/figma-tokens-to-wxss.js': readBundledFile('figma-tokens-to-wxss.js'),
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, files)
    else files.push(full)
  }
  return files
}

function writeFile(rel, content) {
  const full = path.join(projectRoot, rel)
  const exists = fs.existsSync(full)
  const finalContent = applyTokenPrefix(content)
  if (dryRun) {
    console.log(`${exists ? 'skip' : 'create'} ${rel}`)
    return
  }
  if (exists && !force) {
    console.log(`skip ${rel}`)
    return
  }
  ensureDir(full)
  fs.writeFileSync(full, finalContent)
  console.log(`${exists ? 'overwrite' : 'create'} ${rel}`)
}

function updatePackageJson() {
  const rel = 'package.json'
  const full = path.join(projectRoot, rel)
  if (!fs.existsSync(full)) {
    console.log(`skip ${rel} (not found)`)
    return
  }
  const pkg = JSON.parse(fs.readFileSync(full, 'utf8'))
  const scripts = { ...(pkg.scripts || {}) }
  let changed = scripts['check:ui'] !== packageScript
  scripts['check:ui'] = packageScript
  if (withFigma && scripts['figma:tokens'] !== figmaPackageScript) {
    scripts['figma:tokens'] = figmaPackageScript
    changed = true
  }
  pkg.scripts = scripts
  if (dryRun) {
    console.log(`${changed ? 'update' : 'skip'} ${rel} scripts`)
    return
  }
  if (changed) {
    fs.writeFileSync(full, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`update ${rel} scripts`)
  } else {
    console.log(`skip ${rel} scripts`)
  }
}

function collectCursorRuleFiles() {
  const rulesDir = path.join(projectRoot, '.cursor/rules')
  if (!fs.existsSync(rulesDir)) return []
  const result = []
  for (const file of walkFiles(rulesDir)) {
    const rel = path.relative(projectRoot, file)
    if (/\.(md|mdc|txt)$/.test(rel)) result.push(rel)
  }
  return result
}

function collectAiEntrypoints() {
  return [...new Set([...aiEntrypointCandidates, ...collectCursorRuleFiles()])]
    .filter((rel) => fs.existsSync(path.join(projectRoot, rel)))
}

function upsertAiDocsIndex(content) {
  const escapedStart = aiDocsIndexStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = aiDocsIndexEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`)
  if (re.test(content)) return content.replace(re, aiDocsIndexBlock)
  return content.replace(/\s*$/, '') + '\n\n' + aiDocsIndexBlock + '\n'
}

function updateAiEntrypointDocs() {
  const entrypoints = collectAiEntrypoints()
  if (!entrypoints.length) {
    console.log('skip AI entry docs (not found)')
    return
  }
  for (const rel of entrypoints) {
    const full = path.join(projectRoot, rel)
    const current = fs.readFileSync(full, 'utf8')
    const next = upsertAiDocsIndex(current)
    const changed = next !== current
    if (dryRun) {
      console.log(`${changed ? 'update' : 'skip'} ${rel} UI docs index`)
      continue
    }
    if (changed) {
      fs.writeFileSync(full, next)
      console.log(`update ${rel} UI docs index`)
    } else {
      console.log(`skip ${rel} UI docs index`)
    }
  }
}

if (!fs.existsSync(projectRoot)) {
  console.error(`Project path not found: ${projectRoot}`)
  process.exit(1)
}

for (const [rel, content] of Object.entries(files)) {
  writeFile(rel, content)
}

if (withFigma) {
  for (const [rel, content] of Object.entries(figmaFiles)) {
    writeFile(rel, content)
  }
}

updatePackageJson()
updateAiEntrypointDocs()

console.log(dryRun ? 'Dry run complete.' : 'UI system scaffold initialized.')
