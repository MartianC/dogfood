# UI 组件契约

## 通用约定

- 组件命名使用 `ui-*`。
- 变体使用 `variant`，尺寸使用 `size`。
- 状态使用 `disabled`、`loading`、`errorText` 等明确属性。
- 事件透出使用业务语义清晰的事件名。
- 默认 slot 承载可变内容，组件内部只维护基础视觉和状态。
- 所有 `components/ui/*` 默认声明 `styleIsolation: "isolated"`。

当前不引入第三方组件库，因此基础组件为自研 UI Kernel。后续如引入 TDesign、Vant 或 WeUI，必须先包装到 `components/ui/*` 或 `components/vendor/*`。

## ui-button

路径：`components/ui/ui-button`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `primary | secondary | warning | ghost`，默认 `primary` |
| prop | `size` | `small | medium | large`，默认 `large` |
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

## ui-tag

路径：`components/ui/ui-tag`

| 类型 | 名称 | 取值/说明 |
| --- | --- | --- |
| prop | `variant` | `neutral | good | warning`，默认 `neutral` |
| prop | `size` | `small | medium`，默认 `medium` |
| slot | 默认 | 标签文案 |

长文案允许换行，避免在窄屏中撑破父容器。

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
