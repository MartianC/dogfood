# 小程序 UI 系统架构

## 目标

建立一套适合 AI 稳定开发的小程序前端体系：

- 设计语言稳定：颜色、圆角、阴影、字号、间距都有唯一来源。
- 结构清晰：基础 UI、第三方 wrapper、业务组件、页面各司其职。
- 可控扩展：新增组件和变体必须走明确接口。
- 可验证：用脚本阻止裸色值、全局泛名和低质量样式扩散。

## 推荐目录

```text
styles/
  tokens.wxss          # 设计 token，唯一视觉来源
  typography.wxss      # 字体层级
  utilities.wxss       # 极少量布局工具类

components/ui/
  ui-button/
  ui-card/
  ui-tag/
  ui-notice/
  ui-field/
  ui-empty/

components/vendor/
  td-dialog/
  td-picker/
  td-toast/

components/domain/
  product-card/
  user-summary/
  result-panel/

docs/ui/
  design-system.md
  component-contracts.md
  ai-frontend-rules.md

scripts/
  check-ui-system.js

AGENTS.md / CLAUDE.md / GEMINI.md / .github/copilot-instructions.md / .cursor/rules/* / .windsurfrules
  # 已存在的 AI 入口文档应索引 docs/ui/* 和 scripts/check-ui-system.js
```

## 模块边界

### `styles/*`

只提供 token、字体层级和少量通用布局工具。不要放具体业务样式。

### `components/ui/*`

UI Kernel。接口要小而稳定，封装尽量多的视觉和状态逻辑。

如果项目已引入 TDesign、Vant Weapp、WeUI 等组件库，按钮、卡片、标签、输入、提示等基础视觉组件应优先包装组件库实现，再暴露为项目自己的 `ui-*` 契约。没有组件库、组件库无法满足设计要求、或组件需要强定制时，才自研基础实现。

典型接口：

- `variant`: `primary | secondary | warning | ghost`
- `size`: `small | medium | large`
- `disabled`
- `loading`
- `block`

### `components/vendor/*`

第三方组件库适配层。页面和业务组件不直接依赖 TDesign/Vant/WeUI。

好处：

- 以后替换组件库时只改 wrapper。
- 统一第三方组件的 props 命名、文案、事件和主题 token。
- 避免第三方类名和项目类名混在页面里。
- 让 `components/ui/*` 能基于组件库复用成熟能力，同时不泄漏第三方 API。

### `components/domain/*`

业务组件，只组合 UI Kernel 和业务数据，不重复实现基础按钮、卡片、标签、提示。

### `pages/*`

页面负责数据装配、状态切换和流程编排。页面 WXSS 只允许页面布局和少量局部结构样式。

### AI 入口文档

不同 AI 工具有不同的默认入口，例如 Codex 常读 `AGENTS.md`，Claude Code 常读 `CLAUDE.md`，Gemini CLI 常读 `GEMINI.md`，Copilot、Cursor、Windsurf 也各有项目规则文件。初始化或迁移 UI 系统时，必须把 `docs/ui/design-system.md`、`docs/ui/component-contracts.md`、`docs/ui/ai-frontend-rules.md` 和 `scripts/check-ui-system.js` 索引到项目已存在的入口文档中。不要为未使用的工具主动创建入口文件。

## 组件来源判断

新增组件前按顺序判断：

1. `components/ui/*` 或 `components/domain/*` 是否已有可复用组件。
2. 已引入的组件库是否有现成组件，或能通过 props、theme、slot、externalClasses、wrapper 适配。
3. 若适合，基础视觉组件包装为 `components/ui/*`，标准功能组件包装为 `components/vendor/*` 或 `components/ui/*`。
4. 若组件库不适合，再自研；自研原因要写清楚，例如强视觉、复杂交互、性能、组件库限制。

## 第三方组件库接入规则

优先接入标准控件：

- Button / Card / Tag / Input / Notice 等基础视觉组件
- Dialog / Toast / Popup
- Picker / Upload / Input / Form
- Skeleton / Empty / NoticeBar

不建议用第三方库承载品牌体验：

- 首页 Hero
- 核心内容卡片
- 商品、用户、订单等业务卡片
- 结果页、报告页、详情页的核心模块
- 分享图

## 样式隔离

自定义组件默认使用：

```json
{
  "component": true,
  "styleIsolation": "isolated"
}
```

只有确实需要外部覆盖时，才通过 `externalClasses` 暴露明确的覆盖点。不要使用 `shared` 作为默认策略。

## 迁移顺序

1. 建立 `styles/tokens.wxss`。
2. 如果项目已引入组件库，先建立组件库 wrapper；否则建立自研 `components/ui/ui-button` 基线。
3. 将按钮、卡片、标签、输入、提示等基础视觉组件收敛到 `components/ui/*`。
4. 替换页面里的全局 `.button`、`.card`、`.tag` 等泛名样式。
5. 重构核心业务组件为 UI Kernel 组合，例如 `product-card`、`user-summary`、`result-panel`。
6. 禁止页面直接使用第三方组件。
7. 缩小 `app.wxss`，只保留基础页面样式和 imports。
