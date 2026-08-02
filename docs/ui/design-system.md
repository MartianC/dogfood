# 小程序 UI 设计系统

## 设计语气

狗饭小程序面向希望快速规划自制狗饭的用户，界面应当清晰、可信、克制、生活化。基础组件只表达通用状态，不写入具体业务承诺。

## Token 来源

所有普通 WXSS 的颜色、圆角、阴影、间距、字号优先来自 `styles/tokens.wxss`。页面和业务组件不直接新增裸 hex、`rgb()`、`rgba()`、`hsl()` 或 `hsla()` 色值。

## 色彩语义

| Token | 语义 | 当前值 |
| --- | --- | --- |
| `--df-color-bg` | 页面背景 | `#f4f8f3` |
| `--df-color-surface` | 卡片、弹层和导航表面 | `#ffffff` |
| `--df-color-surface-muted` | 弱背景、轻量块 | `#edf4ee` |
| `--df-color-text` | 主文本 | `#17201b` |
| `--df-color-text-secondary` | 次级文本、次级按钮文字 | `#34423a` |
| `--df-color-muted` | 辅助文字 | `#6f7b73` |
| `--df-color-line` | 默认边框 | `#d8e1da` |
| `--df-color-line-strong` | 强边框、可选项边框 | `#b7c7bc` |
| `--df-color-primary` | 品牌主色、主操作 | `#25684a` |
| `--df-color-primary-pressed` | 主操作按下态 | `#1d523a` |
| `--df-color-on-primary` | 主色背景上的文字 | `#ffffff` |
| `--df-color-primary-soft` | 主色弱背景 | `#e3f0e8` |
| `--df-color-primary-soft-pressed` | 浅色主操作按下态 | `#cfe4d6` |
| `--df-color-surface-pressed` | 次要操作、单元格按下态 | `#eef3ef` |
| `--df-color-warning` | 风险、删除、警示文字 | `#a84f34` |
| `--df-color-warning-pressed` | 风险操作按下态 | `#873e29` |
| `--df-color-warning-soft` | 风险弱背景 | `#f6e8e1` |
| `--df-color-status-low` | 营养偏低、低于参考要求 | `#a77514` |
| `--df-color-status-low-soft` | 营养偏低弱背景 | `#fff7e0` |
| `--df-color-on-primary-muted` | 主色背景上的弱文字 | `rgba(255, 255, 255, 0.78)` |
| `--df-color-mask` | 弹层遮罩 | `rgba(25, 24, 21, 0.44)` |

## 字体层级

`styles/typography.wxss` 提供少量全局排版类：`df-heading-xl`、`df-heading-lg`、`df-body`、`df-caption`。页面标题、卡片标题和说明文字优先使用这些层级或组件内部样式，不新增 `.title`、`.subtitle`、`.section-title` 等泛名。

## 间距、圆角和阴影

间距使用 `--df-space-1` 到 `--df-space-6`。圆角使用 `--df-radius-sm` 到 `--df-radius-xl`，胶囊标签使用 `--df-radius-pill`。普通卡片阴影使用 `--df-shadow-card`，首屏强调区使用 `--df-shadow-hero`，主色强调区使用 `--df-shadow-primary`，底部弹层使用 `--df-shadow-sheet`。

## 页面布局规则

`app.wxss` 只保留小程序页面基础样式和少量页面布局类：

- `page`
- `.page`
- `.page.with-bottom-action`
- `.page.with-bottom-action.with-stacked-actions`
- `.section`
- `.section-head`
- `.stack`
- `.bottom-action`
- `.grid-2`

`styles/utilities.wxss` 只保留少量可复用布局工具：`df-stack`、`df-row`、`df-page`、`df-page-with-bottom-action`。页面 WXSS 应只负责列表间距、分区布局、固定底部操作等页面结构，不重新实现按钮、卡片、标签、提示和表单字段。

固定底部操作只用于必须常驻的主动作。单按钮页面使用 `.page.with-bottom-action`；两个固定按钮页面同时加 `.with-stacked-actions`。动态表单页面优先使用页面内流动操作区，避免遮挡新增项、选择器或安全区。

## 基础组件

- `ui-button`: 主操作、次操作、风险操作、轻量操作。
- `ui-card`: 信息容器。
- `ui-tag`: 状态和属性标签。
- `ui-notice`: 提醒、风险、建议。
- `ui-field`: 表单字段容器。
- `ui-empty`: 空状态。

当前引入 `tdesign-miniprogram@1.15.3`，仅通过 `custom-tab-bar` 和 `components/vendor/*` 适配层使用。页面与业务组件不直接使用 `<t-*>`；既有按钮、卡片、标签、提示和字段继续使用项目 UI Kernel。

TDesign 适配范围：

- `custom-tab-bar`：包装 `TabBar/TabBarItem`，固定使用 `theme=tag`、`shape=round`，通过公开 icon slot 使用本地图标。
- `components/vendor/recipe-create-popup`：包装 `Popup/Cell/Input/Button`。
- `components/vendor/recipe-fab`：包装 `Fab`。
- `components/vendor/recipe-empty`：包装 `Empty/Button`。
- `components/vendor/record-calendar`：包装页面内嵌 `Calendar/Loading`，固定单选年月切换并将 TDesign 时间戳收口为日期事件。

第三方组件主题必须映射 `--df-*` 语义色。因小程序组件样式隔离，`custom-tab-bar/index.js` 的 `tabBarStyle` 保存一份与本文件同步的 TDesign CSS 变量字符串；修改主色、表面色或弱色时必须同步更新。

按下态规则：自研 `ui-button` 显式使用 `hover-class="ui-button--pressed"`，按 variant 映射 `primary-pressed`、`primary-soft-pressed`、`surface-pressed` 和 `warning-pressed`。TDesign Button/Fab 适配层必须同时覆盖 `--td-brand-color-active`、`--td-brand-color-light-active` 及对应的 `--td-button-*-active-*` 变量，禁止回退到 TDesign 默认蓝色。

TabBar 图文比例：外框按 D1.1 设计稿为 `343 × 64pt`；四个 item 在中央 Fab 两侧分为左右两组，中间保留独立间隙。图标 slot 固定 `40rpx`（20 px），标签使用 `22rpx / 32rpx`（11 px），图标下方保留 `4rpx` 间距。320pt 窄屏按同一组结构收缩 item 宽度，不得恢复四项均匀铺满并让 Fab 覆盖 item。

## JSON 和 Canvas 同步规则

小程序 JSON 与 canvas 无法直接读取 WXSS token，必须手动保持同步：

| 位置 | 当前值 | 对应 token |
| --- | --- | --- |
| `app.json window.navigationBarBackgroundColor` | `#ffffff` | `--df-color-surface` |
| `app.json window.backgroundColor` | `#f4f8f3` | `--df-color-bg` |
| `app.json tabBar.backgroundColor` | `#ffffff` | `--df-color-surface` |
| `app.json tabBar.color` | `#6f7b73` | `--df-color-muted` |
| `app.json tabBar.selectedColor` | `#25684a` | `--df-color-primary` |
| `custom-tab-bar/index.js tabBarStyle` | `#ffffff / #e3f0e8 / #25684a / #6f7b73` | `surface / primary-soft / primary / muted` |

`pages/plan/index/index.js` 的分享图使用 `SHARE_COLORS` 常量集中映射 `surface`、`text`、`primary`、`textSecondary`、`muted`，并与本文件 token 保持一致。

## UI 检查

`npm run check:ui` 通过 `scripts/check-ui-system.js` 对全项目执行严格检查。普通页面和业务组件不得新增裸色值、基础按钮、第三方标签或禁用泛名；检查失败时应修复实现，不再通过迁移期 baseline 放行。

禁用泛名包括 `.hero`、`.title`、`.subtitle`、`.section-title`、`.link`、`.card`、`.row`、`.tag`、`.button`、`.notice`、`.field`、`.input`、`.metric`。业务类必须使用有明确归属的前缀或语义，例如 `.recipe-title`、`.plan-metric`、`.selector-chip`。
