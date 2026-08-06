# 体重记录客户端与云端实现交接

**状态：** W1.2 已完成代码实现，等待 W1.3 页面与 OW1 授权部署

**日期：** 2026-08-04

**上游：** [`体重领域与数据合同`](2026-08-04-weight-domain-and-data-contract.md)

## 1. 实现范围

本轮将 `weightMeasurement/v1` 接入独立客户端 service、Mock/CloudBase adapter 和 `weightRecord` 云函数，补齐 `weight_measurements` 集合的存储 schema、权限和分页索引。没有改页面、首页事项、统一记录时间轴或线上 CloudBase 资源。

## 2. 客户端模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 体重 service | `subpackages/dog-profile/services/weightService.js` | 校验写入字段、校验云端能力、统一列表/新增/详情/删除结果和错误分类 |
| CloudBase adapter | `subpackages/dog-profile/services/weightCloudbaseAdapter.js` | 只负责调用 `weightRecord` 云函数和收口底层错误 |
| Mock adapter | `subpackages/dog-profile/services/weightMockAdapter.js` | 使用本地 storage 模拟单狗隔离、分页、当前体重同步和删除回退 |
| 合同同步 | `scripts/sync-weight-contract.js` | 将根合同同步到云函数包内，避免云函数依赖小程序包外文件 |

客户端 service 不读取集合，不接受 `id`、`_openid`、`userId` 或 `createdAt` 作为写入字段；新增/删除前会读取能力合同，服务端错误映射为稳定的未部署、存储未就绪、无权限、未登录、网络失败或未知错误。

## 3. 云函数操作

云函数：`cloudfunctions/weightRecord/index.js`。

| action | 输入 | 输出 |
| --- | --- | --- |
| `contract` | 无 | `weightRecord/v1` 能力、集合、分页上限和档案同步能力 |
| `create` | `schemaVersion/dogId/weightKg/measuredOn` | 新测量、当前体重投影 |
| `replace` | `recordId` + 新测量字段 | 事务替换旧记录并返回新记录、当前体重投影 |
| `list` | `dogId/limit/cursor` | 单狗历史、稳定分页游标 |
| `get` | `recordId` | 当前用户拥有的单条测量 |
| `delete` | `recordId` | 删除结果、回退结果和当前体重投影 |

所有操作从云函数上下文获取 `_openid`；`dogId` 归属在读写前校验。内部 `_id`、`_openid` 不出现在业务返回合同中。

## 4. 一致性与失败恢复

- 新增测量和 `dogs.weightKg` 同步在 CloudBase 服务端事务中完成；档案同步失败时事务回滚，历史不会单独留下。
- 编辑不就地修改历史实体；服务端在同一事务中新增替代记录并删除旧记录，失败时两者都回滚。
- 删除测量和当前体重回退在同一事务中完成；删除最后一条有效记录时档案当前体重写为 `null`。
- 删除非最新记录不会改变当前体重；删除最新记录按 W1.1 合同回退上一条或进入未记录状态。
- Mock adapter 复现同样的服务结果，用于页面开发前的本地回归。

## 5. 资源合同

- 集合 schema：`cloudfunctions/weightRecord/schema/record.schema.json`
- 权限：`cloudfunctions/weightRecord/schema/access.json`，固定 `ADMINONLY`，禁止客户端直读/直写
- 索引：`cloudfunctions/weightRecord/schema/indexes.json`，覆盖用户、狗狗、称量日、创建时间和主键稳定排序
- 写入 schema：`contracts/weight/weight-measurement-write-v1.schema.json`
- 云函数包：`cloudfunctions/weightRecord/package.json`

## 6. 验证与部署边界

本轮验证命令：

```bash
npm run check:weight-contract
node --test tests/weight-contract.test.js tests/weight-record-service.test.js tests/weight-record-cloud-function.test.js
```

OW1 仍需单独授权后执行：创建 `weight_measurements` 集合、应用 `ADMINONLY` 权限、创建索引、部署 `weightRecord` 云函数和执行线上烟测。W1.2 不自动迁移旧档案 `weightKg`，也不删除或回填线上历史数据。
