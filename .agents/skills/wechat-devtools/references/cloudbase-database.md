# CloudBase 集合、索引和数据操作

本参考把微信开发者工具相关任务中的 CloudBase 数据面操作统一为可复现的命令/API 流程。它适用于文档型数据库集合，不等同于对象存储 bucket，也不替代业务云函数的鉴权和字段白名单。

## 操作边界和路径选择

| 目标 | 首选路径 | 适用场景 | 说明 |
| --- | --- | --- | --- |
| 检查/创建/删除集合 | `@cloudbase/manager-node` 的 `database` | 可重复脚本、资源核验 | `createCollectionIfNotExists()` 适合幂等创建 |
| 创建/删除索引 | `database.updateCollection()` | 索引声明、按名称检查后创建 | 通过 `describeCollection()` 复核名称、方向和字段顺序 |
| 直接调用管理接口 | `tcb api tcb CreateTable/UpdateTable` | 不想在项目中引入 SDK | 需要已配置的腾讯云/CloudBase CLI 身份 |
| 查询/插入/更新/删除文档 | `tcb db nosql execute` | 临时探针、种子数据、线上烟测 | 使用 Mongo 命令 JSON；每次写入都带可清理 marker |
| 脚本化数据操作 | `database.runCommands()` | 将 CRUD 和断言放进 Node 测试/运维脚本 | 返回值中的 `Data` 是 JSON 字符串数组，需要逐项解析 |
| 控制台 UI | Computer Use 或手工操作 | API 不可用、账号需要人工登录、核对可视化 ACL | 只作为兜底；不要把 UI 点按包装为 CLI 能力 |

官方接口：[CloudBase Manager Node 数据库 API](https://docs.cloudbase.net/api-reference/manager/node/database)、[CreateTable](https://cloud.tencent.com/document/api/876/127968)、[UpdateTable](https://cloud.tencent.com/document/product/876/127964)、[RunCommands](https://cloud.tencent.com/document/api/876/129012)。

## 执行前检查

先确定以下信息，再执行任何写操作：

- 目标 `EnvId`，以及它属于当前登录的腾讯云账号；
- 目标集合名、ACL 预期和是否已有线上数据；
- 目标索引的名称、字段顺序、升降序和唯一性；
- 是只读核验、创建资源、写入烟测数据，还是会更新/删除已有数据；
- 测试数据的唯一 marker、保留时间和清理方式。

建议先确认工具版本和帮助：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli islogin --lang zh
npx --yes -p @cloudbase/cli tcb --help
npx --yes -p @cloudbase/cli tcb db nosql execute --help
npx --yes -p @cloudbase/cli tcb api --help
```

`tcb db model push` 是数据模型文件的声明式发布入口，只有仓库已经维护对应的模型文件时才使用；它不是临时 CRUD、索引探针或线上烟测的替代命令。当前没有模型文件时，使用 Manager SDK、`tcb api` 和 `tcb db nosql execute` 更直接。

### 凭证规则

DevTools 的 `islogin` 只说明微信开发者工具登录状态，不保证当前进程有 Tencent Cloud API/CloudBase Manager 权限。命令行管理数据库需要已登录的 CloudBase CLI，或通过环境变量提供腾讯云密钥/临时凭证。不要读取、打印、提交或拼接以下敏感值：`SecretKey`、`token`、ticket、cookie、Authorization header。

推荐使用环境变量：

```bash
export TCB_ENV_ID='replace-env-id'
export TENCENTCLOUD_SECRET_ID='provided-out-of-band'
export TENCENTCLOUD_SECRET_KEY='provided-out-of-band'
# 临时凭证再设置 TENCENTCLOUD_SESSION_TOKEN；不要把值写入仓库或命令历史
```

如果浏览器 CloudBase 控制台没有环境，而微信开发者工具能看到环境，先检查账号、地域和 `EnvId`，不要重新创建环境，也不要把空列表当成删除证据。

## 集合操作

### Manager Node SDK

安装到本地运维脚本所在项目：

```bash
npm install --save-dev @cloudbase/manager-node
```

可重复执行的集合检查/创建：

```js
const CloudBase = require('@cloudbase/manager-node')

const app = new CloudBase({
  secretId: process.env.TENCENTCLOUD_SECRET_ID,
  secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
  token: process.env.TENCENTCLOUD_SESSION_TOKEN,
  envId: process.env.TCB_ENV_ID,
})

const database = app.database()
const result = await database.createCollectionIfNotExists('care_records')
console.log(JSON.stringify({
  isCreated: result.IsCreated,
  exists: result.ExistsResult.Exists,
  requestId: result.RequestId,
}, null, 2))

const collection = await database.describeCollection('care_records')
console.log(JSON.stringify(collection, null, 2))
```

单独的 `createCollection()` 只在已完成存在性检查后使用；删除集合使用 `deleteCollection()`，属于高影响破坏性操作，必须获得明确授权并再次确认集合名和环境。

### `tcb api` 直接创建

`CreateTable` 支持通过 `EnvId` 和 `TableName` 创建文档型数据库表/集合。先替换占位符，再执行：

```bash
npx --yes -p @cloudbase/cli tcb api tcb CreateTable \
  --body '{"EnvId":"replace-env-id","TableName":"care_records"}' \
  --json
```

如果还要在创建时提交 `PermissionInfo`，以腾讯云 API 的当前参数结构为准；ACL 不能因为集合创建成功就默认视为正确，创建后必须独立核验。

## 索引操作

索引必须服务于已经冻结的查询排序合同。创建前先用 `checkIndexExists()` 或 `describeCollection()` 检查；不要盲目重复创建相同名称/字段的索引。

Manager SDK 示例：

```js
const desiredIndex = {
  IndexName: 'owner_dog_occurred_on',
  MgoKeySchema: {
    MgoIndexKeys: [
      { Name: '_openid', Direction: '1' },
      { Name: 'dogId', Direction: '1' },
      { Name: 'occurredOn', Direction: '-1' },
      { Name: '_id', Direction: '-1' },
    ],
    MgoIsUnique: false,
  },
}

const exists = await database.checkIndexExists(
  'care_records',
  desiredIndex.IndexName,
)

if (!exists.Exists) {
  await database.updateCollection('care_records', {
    CreateIndexes: [desiredIndex],
  })
}

const after = await database.describeCollection('care_records')
console.log(JSON.stringify(after.Indexes, null, 2))
```

`UpdateTable` 同时支持 `CreateIndexes` 和 `DropIndexes`。直接调用时优先让 API Explorer 或当前 SDK 生成请求体，避免手写不同版本 API 对 `MgoKeySchema` 和唯一性字段的层级差异。删除索引前必须确认索引名称、替代索引和查询回退方案；不要用删除再创建来“修复”生产索引，除非已评估期间的查询性能和失败恢复。

## 数据 CRUD

`@cloudbase/manager-node` 的 `database.runCommands()` 与 `tcb db nosql execute` 使用同一类 `MgoCommands`。以下命令只使用可清理的 smoke marker；将 `replace-me` 替换为本次运行生成的唯一值。

### 查询

```bash
npx --yes -p @cloudbase/cli tcb db nosql execute --json \
  --command '[{"TableName":"care_records","CommandType":"QUERY","Command":"{\"find\":\"care_records\",\"filter\":{\"smokeMarker\":\"replace-me\"},\"limit\":10}"}]'
```

### 插入

```bash
npx --yes -p @cloudbase/cli tcb db nosql execute --json \
  --command '[{"TableName":"care_records","CommandType":"INSERT","Command":"{\"insert\":\"care_records\",\"documents\":[{\"smokeMarker\":\"replace-me\",\"dogId\":\"smoke-dog\",\"type\":\"grooming\",\"occurredOn\":\"2026-08-05\",\"notes\":\"skill smoke test\"}]}"}]'
```

### 更新

```bash
npx --yes -p @cloudbase/cli tcb db nosql execute --json \
  --command '[{"TableName":"care_records","CommandType":"UPDATE","Command":"{\"update\":\"care_records\",\"updates\":[{\"q\":{\"smokeMarker\":\"replace-me\"},\"u\":{\"$set\":{\"notes\":\"skill smoke test updated\"}},\"multi\":false}]}"}]'
```

### 删除测试数据

```bash
npx --yes -p @cloudbase/cli tcb db nosql execute --json \
  --command '[{"TableName":"care_records","CommandType":"DELETE","Command":"{\"delete\":\"care_records\",\"deletes\":[{\"q\":{\"smokeMarker\":\"replace-me\"},\"limit\":1}]}"}]'
```

删除命令禁止使用空过滤器；上面的 `limit: 1` 只允许删除一条精确匹配唯一 marker 的测试记录。若 marker 查询到多条记录，先停止并人工核对，不要扩大删除范围；用户数据不得使用测试删除命令清理。

## 线上 CRUD 烟测顺序

1. 用唯一 marker 插入一条最小测试文档，记录返回的文档 ID。
2. 按 marker 查询，确认字段和数量。
3. 按 marker 更新一个非关键字段，再查询确认更新结果。
4. 按 marker 删除，随后再次查询，确认数量为 `0`。
5. 读取集合结构，确认集合仍存在、目标索引仍存在且字段顺序未变。
6. 如果业务客户端只允许经过云函数访问集合，再用已登录用户上下文执行一次云函数 CRUD；原始管理 API 烟测不能替代权限隔离和业务错误映射测试。

每次烟测都要记录 `EnvId`、集合名、marker、测试时间、创建/更新/删除结果和清理结果。最终回复只输出脱敏后的 ID 或摘要，不输出凭证和完整用户数据。

## Computer Use 兜底边界

只有以下情况才使用控制台 UI 或 Computer Use：

- 需要用户手动登录、选择账号或打开服务端口；
- CLI/SDK/API 明确返回权限或账号上下文问题，需要人工核对；
- 当前产品只在控制台暴露某个 ACL/索引可视化设置，且没有稳定管理接口；
- 用户明确要求通过开发者工具界面完成操作。

即使使用 UI，也要先核对环境 ID 和集合名，完成后用 CLI/SDK/API 只读复核；不要通过截图把“看起来创建成功”当作数据层验证。
