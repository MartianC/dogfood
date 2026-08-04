# 体重趋势页面实施交接

**状态：** W1.3 已完成代码实现，等待 OW1 授权部署

**日期：** 2026-08-05

**上游：** [`体重记录客户端与云端实现`](2026-08-04-weight-record-client-cloud-implementation.md)

## 1. 实现范围

本轮将 D2.1 的体重趋势、历史、新增、编辑和删除确认交接落到微信小程序。页面位于 `subpackages/dog-profile/weight`，表单位于 `subpackages/dog-profile/weight-edit`，均属于 `dog-profile` 分包；没有接入首页事项、统一记录时间轴或线上 CloudBase 资源。

## 2. 页面能力

- 狗狗档案页提供“查看体重趋势”或“记录第一次体重”入口；趋势页支持多狗切换。
- 趋势页显示档案当前体重、最近测量日期、有效测量数量、CSS 趋势图、倒序历史列表和分页加载。
- 没有历史记录时只显示空态和“记录第一次体重”，不生成估算曲线；没有狗狗档案时提供档案入口。
- 新增/编辑表单复用 `weightService` 的写入合同，校验大于 0、最多两位小数和不晚于今天的称量日期。
- 编辑页的删除需要二次确认，并明确最新记录删除后的当前体重回退与本餐快照不变语义。
- 页面覆盖加载、失败重试、空态、正常态、长历史、取消、保存中、删除中和字段错误反馈。

## 3. 工程映射

- `subpackages/dog-profile/weight/weightTrendModel.js`：排序、当前值兼容、图表点/线、历史差值和分页合并的纯函数。
- `subpackages/dog-profile/weight/index.js`：趋势页状态、狗狗切换、下拉刷新、分页和导航。
- `subpackages/dog-profile/weight-edit/index.js`：新增/编辑/删除流程；`weightFormModel.js` 负责表单校验和字段错误映射。
- 页面只组合 `ui-card`、`ui-button`、`ui-field`、`ui-empty`、`ui-notice`、`ui-tag`，不直接使用 TDesign，不新增基础组件变体或颜色 token。
- `app.json` 将两页放入 `subpackages/dog-profile`；档案页只增加体重入口，不改变首页和记录页职责。

## 4. 验证与部署边界

本轮定向验证：

```bash
node --test tests/weight-trend-model.test.js tests/weight-page.test.js tests/weight-edit-page.test.js tests/dogs-page.test.js
npm run check:ui
npm run check:main-package
npm run check:project-navigation
```

OW1 仍需单独授权后创建 `weight_measurements` 集合、应用权限、创建索引、部署 `weightRecord` 云函数并执行线上烟测；W1.3 不自动迁移历史 `weightKg`、不修改线上数据，也不提前接入首页事项或统一时间轴。
