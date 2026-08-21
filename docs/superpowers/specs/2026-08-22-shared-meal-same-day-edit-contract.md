# 当天狗饭记录编辑合同

**状态：** 已批准并实现客户端与本地/云端记录链路

**日期：** 2026-08-22

## 1. 产品规则

- `mealTime` 按上海自然日判断，不按设备本地时区判断。
- `mealTime` 属于今天的记录可以修改；昨天及更早、未来或时间无效的记录只能查看。
- 修改更新原记录，不创建第二条记录；记录 ID 和 `mealTime` 不变。
- 修改后重新生成评估快照，`revision` 加一，`updatedAt` 更新，`createdAt` 保持不变。
- 历史记录继续展示保存快照，不因当前活动营养标准变化而重算。

## 2. 客户端合同

编辑入口位于本餐详情页，仅当天展示。编辑页复用现有草稿、食材操作、能量和营养评估能力，编辑草稿包含：

```text
draftMode: create | edit
sourceRecordId: string | null
baseRevision: integer | null
```

编辑保存意图使用 `operation=update`、`recordId`、`expectedRevision`、`updateKey` 和 `updateFingerprint`。保存成功后清理编辑草稿并回到同一个记录详情。

## 3. 服务端合同

`sharedMealRecord` 新增 `action=update`。服务端在写入前检查用户归属、当天窗口、版本、狗狗和用餐时间不可变、食材策略、过敏规则、活动数据版本和更新幂等性。

错误码：

- `EDIT_WINDOW_EXPIRED`：记录已进入历史，只能查看；
- `REVISION_CONFLICT`：记录已被其他编辑更新；
- `IDEMPOTENCY_CONFLICT`：同一更新键对应了不同内容。

旧记录缺少 `revision` 或 `updatedAt` 时读取默认按 `revision=1`、`updatedAt=createdAt` 兼容；首次当天更新会补齐字段。不迁移或重写历史数据。
