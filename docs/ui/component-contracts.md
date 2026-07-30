# UI 组件契约

## 通用约定

- 组件命名使用 `ui-*`。
- 变体使用 `variant`，尺寸使用 `size`。
- 状态使用 `disabled`、`loading`、`errorText` 等明确属性。
- 事件透出使用业务语义清晰的事件名。
- 默认 slot 承载可变内容，组件内部只维护基础视觉和状态。
- 所有 `components/ui/*` 默认声明 `styleIsolation: "isolated"`。

基础组件仍为自研 UI Kernel。项目已引入 `tdesign-miniprogram@1.15.3`，只允许通过 `custom-tab-bar` 和 `components/vendor/*` 适配层使用；页面不得直接依赖 TDesign 标签或事件细节。

## TDesign vendor 适配

| 路径 | 内部组件 | 对外契约 |
| --- | --- | --- |
| `custom-tab-bar` | `TabBar`、`TabBarItem` | data `selected`；内部根据四个固定路由调用 `wx.switchTab`；图标 `32rpx`、文字 `28rpx / 40rpx`，按下背景使用项目 `surface-pressed` |
| `components/vendor/recipe-create-popup` | `Popup`、`Cell`、`Input`、`Button` | props `visible/dogs/loading`；events `visiblechange/cancel/confirm`；公开方法 `reset()` |
| `components/vendor/recipe-fab` | `Fab` | event `tap` |
| `components/vendor/recipe-empty` | `Empty`、`Button` | props `icon/title/description/actionText`；event `action` |
| `components/vendor/recipe-ingredient-search` | `Search` | props `value/loading/placeholder/actionText`；events `change/action`；页面负责决定默认、结果和无结果状态 |
| `components/vendor/recipe-ingredient-list` | `CellGroup`、`Cell`、`Input`、`Icon` | props `items/mode/actionIcon`；events `select/amountchange/remove` |
| `components/vendor/recipe-ingredient-popup` | `Popup`、`Input`、`Button` | props `visible/ingredient/loading`；events `visiblechange/cancel/confirm` |
| `components/vendor/recipe-menu-indicator` | `Checkbox`、`Icon`、`Loading` | props `kind/checked/disabled/icon/iconSize/tone/text`；`kind` 支持 `checkbox/icon/loading/loading-compact`，紧凑 Loading 不保留 44pt 占位；`tone` 仅支持项目语义色 `default/primary/warning/muted`；Checkbox 受控并透出 `change`，Icon 和 Loading 仅展示；不读取菜谱服务 |

vendor 适配层只负责第三方 API、主题和基础状态转换，不读取业务服务，不执行页面跳转，不保存食谱数据。

## ui-button

路径：`components/ui/ui-button`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `primary | secondary | outline | warning | warning-outline | ghost`，默认 `primary`；`outline` 为主题色描边操作，`warning-outline` 为警示色描边操作 |
| prop | `size` | `small | medium | large | xlarge`，默认 `large`；`xlarge` 高度为 `96rpx`，用于设计稿明确要求的 48pt 主操作 |
| prop | `disabled` | 禁用态，默认 `false` |
| prop | `loading` | 加载态，默认 `false` |
| prop | `block` | 是否撑满容器，默认 `true`；`false` 时按内容渲染为小操作按钮 |
| prop | `openType` | 透传小程序 button `open-type` |
| prop | `eventValue` | 可选事件值，会随 `tap` 事件放入 `detail.eventValue` |
| event | `tap` | 非禁用、非加载时触发 |
| slot | 默认 | 按钮文案或少量内联内容 |

`ui-button` 的组件 host 为块级；默认 `block=true` 时内部按钮撑满父容器。需要“删除”“修改”这类窄操作时使用 `block=false`，不要用外层固定宽度强行覆盖按钮宽度。

## ui-card

路径：`components/ui/ui-card`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `plain | soft | primary`，默认 `plain` |
| prop | `padding` | `none | small | medium | large`，默认 `medium` |
| slot | 默认 | 卡片内容 |

`ui-card` 只提供容器视觉，不承担列表间距、页面分区或点击业务语义。列表间距由页面或业务组件自己的布局类控制。

## nutrition-assessment

路径：`components/nutrition-assessment`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `assessment` | 双轴本餐评估结果 |
| prop | `expanded` | 是否展示全屏详情，默认 `false` |
| prop | `loading` | 是否正在读取评估数据，默认 `false` |
| prop | `compact` | 是否使用 `280rpx` 起始高度的紧凑收起态，默认 `false`；共享本餐创建页使用 |
| event | `toggle` | 切换收起/展开态 |
| event | `nutrientselect` | 选择需要补充的营养项 |
| event | `scaleconfirm` | 确认按目标等比例调整整餐 |

`compact` 只收紧摘要的间距和点击行，不删减能量、营养密度两轴内容；默认形态继续供自定义食谱页使用。

## ui-tag

路径：`components/ui/ui-tag`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `neutral | good | warning`，默认 `neutral` |
| prop | `size` | `small | medium | large`，默认 `medium`；`large` 用于搜索页的常用食材胶囊 |
| prop | `removable` | 是否显示可移除形态，默认 `false`；内部关闭图标适配 TDesign Icon |
| prop | `eventValue` | 移除时随事件回传的稳定业务值 |
| event | `remove` | 点击可移除 Tag 时触发，`detail.eventValue` 返回业务值 |
| slot | 默认 | 标签文案 |

`small` 和 `medium` 的长文案允许换行，避免在窄屏中撑破父容器；搜索页专用的 `large` 保持单行，父级必须通过横向滚动或换行布局承接超宽内容。
`removable` 形态提供不小于 `88rpx` 的点击目标，实际胶囊高度为 `72rpx`，用于固定摘要中的已选菜单移除操作。

## ui-notice

路径：`components/ui/ui-notice`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `neutral | good | warning`，默认 `neutral` |
| prop | `clickable` | 是否启用点击态与 `tap` 事件，默认 `false` |
| event | `tap` | `clickable` 为 `true` 时触发 |
| slot | 默认 | 提示内容，允许较长文案 |

## ui-field

路径：`components/ui/ui-field`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `label` | 字段名称 |
| prop | `helpText` | 辅助说明 |
| prop | `errorText` | 错误文案；存在时优先展示并覆盖 `helpText` |
| slot | 默认 | `input`、`picker` 展示值或其他表单控件 |

`ui-field` 用于字段边框、label、帮助和错误文案。输入控件的取值、单位、对齐和 picker 数据仍由业务组件负责。

## ui-empty

路径：`components/ui/ui-empty`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `imageUrl` | 可选空状态图片 |
| prop | `title` | 标题，默认 `暂无内容` |
| prop | `description` | 描述文案 |
| prop | `actionText` | 操作按钮文案；为空时不展示按钮 |
| event | `action` | 点击操作按钮时触发 |

## 样式隔离

所有 `components/ui/*` 和现有业务组件默认声明：

```json
{
  "component": true,
  "styleIsolation": "isolated"
}
```

如需外部覆盖，只能通过明确的 `externalClasses`，不要依赖页面全局样式穿透。
