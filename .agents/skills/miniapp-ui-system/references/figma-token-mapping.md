# Figma Token 映射

## 目录

- [原则](#原则)
- [输入来源](#输入来源)
- [映射结构](#映射结构)
- [px 到 rpx](#px-到-rpx)
- [输出到 WXSS](#输出到-wxss)
- [离线转换脚本](#离线转换脚本)
- [检查规则](#检查规则)

## 原则

Figma variable 是设计来源，不能直接等同于小程序 token。落地顺序固定为：

```text
Figma variable/style
  -> semantic token
  -> styles/tokens.wxss
  -> ui component variant
```

新增或修改 token 前，先输出映射和原因；不要自动覆盖现有 `styles/tokens.wxss`。

## 输入来源

允许来源：

- Figma Variables REST API 导出的 variables JSON。
- Figma MCP 或 Dev Mode 辅助整理出的变量 JSON。
- 用户手动整理的 token map JSON。

截图、设计图抽色、Dev Mode CSS snippet 只能作为参考，不能作为唯一来源。

## 映射结构

推荐 `docs/ui/figma-token-map.json` 使用以下结构：

```json
{
  "tokens": [
    {
      "sourceKind": "figma-variable",
      "collection": "Base",
      "name": "Color/Primary",
      "type": "color",
      "mode": "light",
      "value": "#2563eb",
      "unit": "none",
      "aliasChain": [],
      "scope": "button,link,focus",
      "target": "--mp-color-primary",
      "status": "mapped",
      "reason": "品牌主色"
    }
  ]
}
```

字段要求：

- `name`: Figma 原始变量名或样式名。
- `type`: `color | spacing | radius | font | shadow | opacity | dimension`。
- `mode`: Figma mode 名称；没有 mode 时写 `default`。
- `value`: 原始值或确认后的语义值。
- `unit`: `px | rpx | none`。
- `target`: 小程序 token 名，必须以 `--` 开头。
- `status`: `mapped | pending | ignored`。
- `reason`: 映射、待定或忽略的原因。

如果使用 Design Tokens Community Group 格式，保留 `$value`、`$type`、`$description`；不要把 DTCG 格式和 Figma 原始导出混写成同一种结构。

## px 到 rpx

必须在 source manifest 中记录设计稿基准宽度：

```json
{
  "frameWidthPx": 375
}
```

默认换算：

```text
rpx = px * 750 / frameWidthPx
```

常见情况：

| 设计稿宽度 | 换算 |
| --- | --- |
| 375px | `1px = 2rpx` |
| 390px | `1px = 1.923rpx` |
| 414px | `1px = 1.812rpx` |
| 750px | `1px = 1rpx` |

换算后保留最多 3 位小数；整数直接输出整数。

## 输出到 WXSS

输出示例：

```css
page {
  --mp-color-primary: #2563eb;
  --mp-radius-md: 16rpx;
  --mp-space-4: 24rpx;
}
```

命名建议：

- 颜色：`--mp-color-*`
- 字号：`--mp-font-*`
- 间距：`--mp-space-*`
- 圆角：`--mp-radius-*`
- 阴影：`--mp-shadow-*`
- 透明度：`--mp-opacity-*`

## 离线转换脚本

脚手架使用 `--with-figma` 后会生成离线脚本：

```bash
node scripts/figma-tokens-to-wxss.js \
  --input docs/ui/figma-token-map.json \
  --output styles/tokens.wxss \
  --prefix mp \
  --frame-width 375 \
  --dry-run
```

默认建议先 `--dry-run` 查看输出。要写入并覆盖已有 `styles/tokens.wxss`，需要显式加 `--force`。

## 检查规则

`check:ui` 应检查：

- `figma-token-map.json` 是合法 JSON。
- `tokens` 是数组。
- `mapped` 状态必须有 `name`、`type`、`target`、`value`。
- `target` 必须以 `--` 开头。
- `styles/tokens.wxss` 中必须存在所有 `mapped` token 的 `target`。
- 页面和普通组件不能绕过 token 写裸 hex。
