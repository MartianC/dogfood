# AI 前端开发规则

## 必守规则

1. 新 UI 先查 `components/ui/*`，能组合就不要新增基础样式。
2. 如果项目已引入组件库，新增基础视觉组件前必须先查组件库；能通过 props、theme、slot、externalClasses 或 wrapper 适配的，不重复自研。
3. 页面不直接写基础按钮、卡片、标签、提示；使用 `ui-button`、`ui-card`、`ui-tag`、`ui-notice`。
4. 页面不直接使用 TDesign/Vant/WeUI；先创建或复用 `components/vendor/*` 或 `components/ui/*` wrapper。
5. 普通页面和组件禁止新增裸 hex 色值。新增颜色先加语义 token。
6. 有 Figma 时，先提取和确认 token，不直接写页面样式。
7. Figma 组件必须先映射到 `components/ui/*`、`components/vendor/*` 或 `components/domain/*`。
8. Figma 自动生成代码只能作为参考，不能跳过项目组件体系。
9. Figma 里的硬编码值要记录为设计债务，不能默认照抄。
10. 禁止新增 `.button`、`.card`、`.tag`、`.notice`、`.title`、`.row`、`.input` 等泛名选择器。
11. 可点击目标默认不低于 `88rpx`，除非是文本链接且周围有足够点击空间。
12. 自定义组件默认 `styleIsolation: "isolated"`。
13. 新增组件必须覆盖默认、空、加载、禁用、错误、长文案中的相关状态。

## 改动前说明

每次 UI 改动前先说明：

- 使用了哪些 token。
- 使用了哪些 `components/ui/*`。
- 如果项目有组件库，为什么使用或不使用组件库组件。
- 如果来自 Figma，使用了哪个 frame、哪些 token map、哪些 component map。
- 是否新增组件或变体。
- 是否引入或包装第三方组件。
- 哪些页面会受影响。

## 文件职责

| 位置 | 允许做什么 | 禁止做什么 |
| --- | --- | --- |
| `styles/tokens.wxss` | 设计 token | 业务 class |
| `components/ui/*` | 项目基础视觉契约，可包装组件库或自研 | 业务字段和流程 |
| `components/vendor/*` | 第三方组件适配 | 业务页面布局、直接承载品牌视觉 |
| `components/domain/*` | 业务组件组合 | 重新发明基础按钮/卡片 |
| `pages/*` | 页面状态和流程 | 大量重复基础样式 |

## 验证要求

完成 UI 改动后运行：

```bash
npm run check:ui
npm test
```

如果无法运行，必须说明原因和剩余风险。

Figma 设计稿落地后，还要写 `docs/ui/figma-implementation-notes.md`，记录设计稿来源、实现差异和无法等价还原的原因。
