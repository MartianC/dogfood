# 共享本餐记录部署契约

**适用环境：** `cloud1-d4gm1emm8c33e9298`

**范围：** `sharedMealRecord` 云函数和 `shared_meal_records` 集合。本文不授权部署、生产数据结构变更或测试数据写入；每一步仍需按 B1.2、B1.3、B1.4 单独确认。

## 1. 冻结契约

- 云函数：`cloudfunctions/sharedMealRecord`，接受 `save | update | list | get`；`update` 只允许按上海自然日更新当天记录。
- 记录 schema：`cloudfunctions/sharedMealRecord/schema/record.schema.json`。
- 访问规则：`cloudfunctions/sharedMealRecord/schema/access.json`，固定为 `ADMINONLY`；小程序客户端不可直读或直写，所有访问必须经过云函数及 `OPENID` 归属校验。
- 索引：`cloudfunctions/sharedMealRecord/schema/indexes.json`，字段顺序和唯一性必须完全一致：
  1. `owner_idempotency_unique`：`(_openid ASC, idempotencyKey ASC)`，唯一。
  2. `owner_meal_time`：`(_openid ASC, mealTime DESC, _id DESC)`，支持首页最近一顿和全部记录列表。
  3. `owner_dog_meal_time`：`(_openid ASC, targetDogId ASC, mealTime DESC, _id DESC)`，支持按狗狗筛选。
- 照片：`photoFileIds` 仅兼容空数组；schema 和云函数都会拒绝非空数组。
- 更新：当天更新原记录 ID，使用 `revision` 乐观锁和 `updateKey + updateFingerprint` 幂等；跨日后服务端返回 `EDIT_WINDOW_EXPIRED`。

原计划只列了唯一索引和按狗列表索引，但首页、记录页当前都不传 `targetDogId`。因此部署前补充 `owner_meal_time`，避免全量记录查询因缺少匹配索引失败。

## 2. 部署前只读探针

依次确认：

1. `npm run check:shared-meal-record`、记录专项测试、云函数语法检查和 `git diff --check` 通过。
2. 目标环境状态为 `NORMAL`，环境 ID 与 `config/env.js` 一致。
3. `data_releases` 至少有一条 `status=active`，并包含当前 `release_id`、`recipe_version`、`catalog_version` 和 `policy_version`。
4. `dogs`、`data_releases`、`ingredient_catalog` 可由管理端只读查询。
5. 云函数清单中 `sharedMealRecord` 的存在状态和修改时间已记录。
6. 集合存在时只读核对权限、三条索引和记录数；集合不存在时只记录 `NamespaceNotFound`，不借探针创建集合。

2026-07-31 的只读基线：环境为 `NORMAL`；活动发布为 `ingredient_release_2026_07_22_policy_v1`，`recipe_version=2026-07-23-v1`；`sharedMealRecord` 尚未部署；`shared_meal_records` 尚不存在。

## 3. 部署顺序

### B1.2 云函数

取得单独部署授权后，只部署一个函数：

```sh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d4gm1emm8c33e9298 \
  --names sharedMealRecord \
  --project /Users/cyr/Documents/Projects/Web/dogfood \
  --remote-npm-install
```

部署后确认函数状态为可用、运行时和入口正确。此时集合尚不存在，`list/get` 只能用于确认函数已进入数据库依赖边界，不执行 `save`。

### B1.3 集合、权限和索引

取得单独生产数据结构授权后按以下顺序执行：

1. 创建空集合 `shared_meal_records`。
2. 立即设置 `ADMINONLY`，在权限确认前不写入数据。
3. 创建唯一索引 `owner_idempotency_unique`。
4. 创建全部记录索引 `owner_meal_time`。
5. 创建按狗记录索引 `owner_dog_meal_time`。
6. 等待全部索引就绪，再运行空集合 `list` 和不存在 ID 的 `get` 只读探针。

空集合 `list` 应返回 `items=[]`、`nextCursor=null`；不存在 ID 的 `get` 应受控返回 `NOT_FOUND`。不允许客户端直读集合来替代这两项验证。

### B1.4 最小烟测

取得测试档案和测试数据授权后，只写入一条带可识别标记的测试记录，依次执行：

1. `save` 返回记录 ID。
2. 相同 `idempotencyKey + requestFingerprint` 再次 `save`，返回同一记录 ID。
3. `list` 能且只能看到当前用户范围内的记录。
4. `get` 读回的狗狗、人饭、克重、评估和版本快照与保存候选一致。
5. 另一测试用户无法读取该记录。

编辑烟测在取得单独授权后补充：当天 `update` 保持记录 ID、递增 `revision`，重复更新返回同一版本；跨过上海自然日后更新被拒绝。

测试数据不自动删除；清理需要另行授权。

## 4. 回滚

- B1.2 失败：停止后续步骤；若函数为本轮首次创建，可在单独授权后删除该函数。其他云函数和集合不动。
- B1.3 在烟测前失败：停止写入；修正或删除本轮未就绪索引。删除空集合、修改权限仍需单独授权。
- B1.4 后发生问题：保留集合和已有记录，不删除或改写快照；优先停用/回滚 `sharedMealRecord` 函数。恢复服务前重新核对唯一索引，避免重试产生重复记录。
- 任一阶段都不修改活动数据发布、不迁移旧业务集合、不自动清理测试或用户数据。

## 5. 验收证据

每一步在当日工作日志记录：授权范围、目标环境、执行命令类别、云端状态、权限、索引名称与字段顺序、探针结果、测试记录 ID（如有）和回滚点。日志不得保存令牌、密钥或完整用户数据。
