# AI 前端开发规则

## 改动前说明

每次 UI 改动前先说明：

- 使用哪些 token。
- 使用哪些 `components/ui/*`。
- 是否新增组件或变体。
- 是否引入或包装第三方组件。
- 影响哪些页面或业务组件。
- 如果来自 Figma，使用了哪个 frame、哪些 token map、哪些 component map。

当前项目不引入 TDesign、Vant 或 WeUI。如后续引入，基础视觉组件必须先包装成 `components/ui/*` 或 `components/vendor/*`，页面不直接使用第三方标签。

## 必守规则

1. 新 UI 先查 `components/ui/*`，能组合就不要新增基础样式。
2. 页面不直接写基础按钮、卡片、标签、提示；使用 `ui-button`、`ui-card`、`ui-tag`、`ui-notice`。
3. 表单字段优先使用 `ui-field` 包装输入、选择器展示值、帮助文案和错误文案。
4. 空状态优先使用 `ui-empty`，旧业务空状态组件可逐步委托给它。
5. 普通页面和组件禁止新增裸 hex、`rgb()`、`rgba()`、`hsl()`、`hsla()` 色值。新增颜色先加语义 token。
6. 禁止新增 `.button`、`.card`、`.tag`、`.notice`、`.title`、`.row`、`.input` 等泛名选择器。
7. 可点击目标默认不低于 `88rpx`，除非是文本链接且周围有足够点击空间。
8. 自定义组件默认 `styleIsolation: "isolated"`。
9. 新增组件必须覆盖默认、空、加载、禁用、错误、长文案中的相关状态。
10. 小程序 JSON 和 canvas 色值不能读取 WXSS token，必须在 `docs/ui/design-system.md` 记录同步关系。

## 文件职责

| 位置 | 允许做什么 | 禁止做什么 |
| --- | --- | --- |
| `styles/tokens.wxss` | 设计 token | 业务 class |
| `styles/typography.wxss` | 少量排版工具 | 业务标题样式 |
| `styles/utilities.wxss` | 少量布局工具 | 具体业务样式 |
| `components/ui/*` | 项目基础视觉契约 | 业务字段和流程 |
| `components/vendor/*` | 第三方组件适配 | 业务页面布局 |
| `components/*` | 业务组件组合 | 重新实现基础按钮/卡片 |
| `pages/*` | 页面状态和流程 | 大量重复基础样式 |

## 验证

完成 UI 改动后运行：

```bash
npm run check:ui
npm test
```

`npm run check:ui` 现在按全项目严格规则运行，不再使用迁移期 baseline。检查失败时先修复违规的裸色值、基础泛名、直接按钮或第三方标签，再继续交付。

Figma 设计稿落地后，还要写 `docs/ui/figma-implementation-notes.md`，记录设计稿来源、实现差异和无法等价还原的原因。
