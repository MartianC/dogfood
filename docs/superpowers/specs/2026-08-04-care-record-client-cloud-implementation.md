# 护理记录客户端与云端实现交接

**状态：** C1.2 已完成代码实现，等待 C1.3 页面与 OC1 授权部署

**日期：** 2026-08-04

**上游：** [`护理领域与数据合同`](2026-08-04-care-domain-and-data-contract.md)

## 1. 实现范围

本轮将 `careRecord/v1` 接入独立护理 service、Mock/CloudBase adapter 和 `careRecord` 云函数，补齐 `care_records` 集合的存储 schema、权限和查询索引。没有修改护理页面、首页事项、统一记录时间轴或线上 CloudBase 资源。

护理记录保持独立写模型；体重测量、本餐记录和狗狗档案不会因为 C1.2 被合并或改写。写入不会自动重试，因为 v1 没有幂等命令字段，避免网络超时后重复创建护理事实。

## 2. 客户端模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 护理 service | `care/careRecordService.js` | 校验写入与列表参数，统一 CRUD、类型筛选、分页结果和稳定错误分类 |
| CloudBase adapter | `care/adapters/careRecordCloudbase.js` | 只负责调用 `careRecord` 云函数和收口底层调用错误；无 CloudBase 运行时则回退 Mock |
| Mock adapter | `care/adapters/careRecordMock.js` | 使用本地 storage 模拟单狗归属、CRUD、类型筛选和稳定游标分页 |
| 合同同步 | `scripts/sync-care-record-contract.js` | 将根合同同步到云函数包内，避免云函数依赖小程序包外文件 |

service 和 adapter 不读取 `care_records` 集合，不接受 `id`、`_id`、`_openid`、`userId`、`createdAt` 或 `updatedAt` 作为写入字段。写入前统一规范化空名称、空备注和未填写的下次日期；下次日期只保存用户明确填写的值。

## 3. 云函数操作

云函数：`cloudfunctions/careRecord/index.js`。

| action | 输入 | 输出 |
| --- | --- | --- |
| `create` | `schemaVersion/dogId/type/name/occurredOn/nextDate/notes` | 新护理记录 DTO |
| `update` | `recordId` + 完整护理写入字段 | 更新后的同一条护理记录 DTO |
| `delete` | `recordId` | `{ deleted: true, id }` |
| `list` | `dogId/type?/limit?/cursor?` | 当前狗狗的记录、稳定分页游标 |
| `get` | `recordId` | 当前用户拥有的单条护理记录 DTO |

所有操作从云函数上下文获取 `_openid`。创建、列表和读取前校验狗狗或记录归属；更新禁止更换 `dogId`；跨用户读取统一返回未找到，避免泄漏记录存在性。CloudBase 的 `_id`、`_openid` 和 Date 字段不会泄漏到业务 DTO。

列表排序固定为 `occurredOn DESC → _id DESC`，游标编码最后一条记录的发生日期和服务端记录 ID；类型筛选只接受四个稳定类型码，单页最多返回 20 条。

## 4. 失败恢复与数据边界

- 未部署云函数、集合/索引未就绪、未登录、无权限、记录不存在、输入无效和网络失败会映射为稳定错误码，页面不依赖 CloudBase 原始错误文案。
- 仅网络错误被标记为可重试；创建、更新和删除不由 service 自动重试。
- 更新只改变护理字段和 `updatedAt`，保留 `createdAt` 与原记录 ID；删除不可恢复。
- 服务端不根据护理类型、名称、发生日期或备注推导周期、剂量、医疗适用性或健康结论。

## 5. 资源合同

- 集合 schema：`cloudfunctions/careRecord/schema/record.schema.json`
- 权限：`cloudfunctions/careRecord/schema/access.json`，固定 `ADMINONLY`，禁止客户端直读/直写
- 索引：`cloudfunctions/careRecord/schema/indexes.json`，覆盖用户、狗狗、类型、发生日期和稳定主键排序
- 实体合同：`contracts/care/care-record-v1.schema.json`
- 写入合同：`contracts/care/care-record-write-v1.schema.json`
- 云函数包：`cloudfunctions/careRecord/package.json`

## 6. 验证与部署边界

本轮验证命令：

```bash
npm run check:care-record-contract
node --test tests/care-record-contract.test.js tests/care-record-service.test.js tests/care-record-cloud-function.test.js
```

OC1 仍需单独授权后执行：创建 `care_records` 集合、应用 `ADMINONLY` 权限、创建两条索引、部署 `careRecord` 云函数和执行线上烟测。C1.2 不创建线上资源、不写入测试或用户数据、不迁移历史护理事实。
