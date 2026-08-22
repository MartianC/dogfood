# 护理记录部署契约

**适用环境：** `cloud1-d4gm1emm8c33e9298`

**范围：** `careRecord` 云函数和 `care_records` 集合。本文不授权部署、生产数据结构变更或测试数据写入；每一步仍需按 OC1 单独确认。

## 1. 冻结契约

- 云函数：`cloudfunctions/careRecord`，接受 `create | update | delete | list | listUpcoming | get`。
- 存储 schema：`cloudfunctions/careRecord/schema/record.schema.json`。
- 访问规则：`cloudfunctions/careRecord/schema/access.json`，固定为 `ADMINONLY`；小程序客户端不可直读或直写，所有访问必须经过云函数及 `_openid`/狗狗归属校验。
- 索引：`cloudfunctions/careRecord/schema/indexes.json`，字段顺序必须完全一致：
  1. `owner_dog_occurred_on`：`(_openid ASC, dogId ASC, occurredOn DESC, _id DESC)`。
  2. `owner_dog_type_occurred_on`：`(_openid ASC, dogId ASC, type ASC, occurredOn DESC, _id DESC)`。
  3. `owner_dog_next_date`：`(_openid ASC, dogId ASC, nextDate ASC, _id ASC)`。
- 列表排序：`occurredOn DESC → _id DESC`；分类筛选只接受 `vaccine`、`internal_deworming`、`external_deworming`、`other`。
- 写入重试：创建没有幂等命令字段，线上烟测和客户端不得把超时后的 `create` 自动重放为第二条护理记录。

## 2. 部署前只读探针

依次确认：

1. `npm run check:care-record-contract`、护理专项测试、云函数语法检查和 `git diff --check` 通过。
2. 目标环境状态为 `NORMAL`，环境 ID 与 `config/env.js` 一致。
3. `dogs` 集合可由管理端只读查询，且用于烟测的测试狗狗归属于授权测试用户。
4. 云函数清单中 `careRecord` 的存在状态和修改时间已记录。
5. `care_records` 集合存在时只读核对权限、三条索引和记录数；集合不存在时只记录 `NamespaceNotFound`，不借探针创建集合。

## 3. 部署顺序

### OC1.1 云函数

取得单独部署授权后，只部署一个函数：

```sh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d4gm1emm8c33e9298 \
  --names careRecord \
  --project /Users/cyr/Documents/Projects/Web/dogfood \
  --remote-npm-install
```

部署后确认函数状态为可用、运行时和入口正确。此时集合尚不存在，不能用 `create` 代替集合探针，也不能写入测试护理记录。

### OC1.2 集合、权限和索引

取得单独生产数据结构授权后按以下顺序执行：

1. 创建空集合 `care_records`。
2. 立即设置 `ADMINONLY`，在权限确认前不写入数据。
3. 创建 `owner_dog_occurred_on` 索引。
4. 创建 `owner_dog_type_occurred_on` 索引。
5. 创建 `owner_dog_next_date` 索引。
6. 等待全部索引就绪，再运行空集合 `list`、`listUpcoming` 和不存在 ID 的 `get` 只读探针。

空集合 `list` 应返回 `items=[]`、`nextCursor=null`；不存在 ID 的 `get` 应受控返回 `NOT_FOUND`。不允许客户端直读集合来替代这两项验证。

### OC1.3 最小烟测

取得测试档案和测试数据授权后，只写入一条带可识别标记的测试护理记录，依次执行：

1. `create` 返回符合 `careRecord/v1` 的记录 DTO。
2. `list` 能按默认排序返回记录，且类型筛选只返回指定类型。
3. `get` 读回的名称、发生日期、用户填写的下次日期和备注与保存候选一致。
4. `update` 只修正同一条记录，`dogId` 不可变，`createdAt` 不变。
5. `delete` 返回删除结果，之后 `get` 返回受控 `NOT_FOUND`。
6. 另一测试用户无法读取、更新或删除该记录。

测试数据不自动删除；清理需要另行授权。

## 4. 回滚

- OC1.1 失败：停止后续步骤；若函数为本轮首次创建，可在单独授权后删除该函数。其他云函数和集合不动。
- OC1.2 在烟测前失败：停止写入；修正或删除本轮未就绪索引。删除空集合、修改权限仍需单独授权。
- OC1.3 后发生问题：保留集合和已有护理事实，不删除或改写用户数据；优先停用/回滚 `careRecord` 函数。恢复服务前重新核对权限和索引，避免列表退化或越权。
- 任一阶段都不修改活动数据发布、不迁移旧业务集合、不自动清理测试或用户数据。

## 5. 验收证据

每一步在当日工作日志记录：授权范围、目标环境、执行命令类别、云端状态、权限、索引名称与字段顺序、探针结果、测试记录 ID（如有）和回滚点。日志不得保存令牌、密钥或完整用户数据。
