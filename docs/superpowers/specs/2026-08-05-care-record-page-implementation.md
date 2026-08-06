# 护理记录页面实现交接

**状态：** C1.3 已完成代码实现，等待 OC1 授权部署

**日期：** 2026-08-05

**上游：** [`体重与护理交互设计交接`](2026-08-04-weight-and-care-interface-design.md)、[`护理记录客户端与云端实现`](2026-08-04-care-record-client-cloud-implementation.md)

## 1. 实现范围

本轮按 D2.1 C01–C04 实现护理记录列表和表单，不改变 C1.2 的护理写模型，不接入首页事项或统一记录时间轴，不执行 CloudBase 部署。

新增两个狗狗档案分包任务页：

- `subpackages/dog-profile/care-record/index`：当前狗狗护理列表、全部/四类筛选、分页、空态、错误重试、编辑和删除确认。
- `subpackages/dog-profile/care-edit/index`：新增/编辑表单、类型、名称、发生日期、用户填写的下次日期、长备注、保存失败和删除确认。

两个页面均不注册为 Tab，也不显示底部 TabBar；多狗用户可在列表和新增表单中切换当前狗狗，编辑时固定原记录归属。

## 2. 页面状态与交互

### 列表页

- 默认筛选为“全部”，四类稳定类型码映射为“疫苗、体内驱虫、体外驱虫、其他护理”。
- 记录显示类型、已填写名称、发生日期、用户填写的下次日期和备注；没有名称不显示占位名称，没有下次日期显示“未填写下次”。
- 空狗状态引导到现有狗狗档案编辑页；空记录状态引导到新增护理表单。
- 云函数未部署、集合未就绪、无权限、网络等错误保留稳定文案并提供重试；加载更多失败不清除已显示记录。
- 删除通过 `wx.showModal` 二次确认，成功后刷新当前筛选，删除不影响体重或本餐记录。

### 表单页

- 新增默认使用当前上海自然日作为发生日期；发生日期不能晚于今天。
- 下次日期可以留空，只保存用户明确填写的日期，不显示推荐周期、建议日期、剂量或健康结论。
- 备注支持 2000 字和自然换行；保存时将空下次日期规范为 `null`。
- 编辑读取已有记录，狗狗字段只读；保存失败保留全部输入，并将日期错误显示在对应字段。
- 删除通过二次确认执行，取消和失败均保留当前表单内容。

## 3. UI 与工程映射

- 页面复用 `ui-card`、`ui-button`、`ui-empty`、`ui-field`、`ui-notice` 和 `ui-tag`；页面不直接使用 TDesign 标签。
- 颜色、间距、圆角、阴影和触控尺寸沿用 `styles/tokens.wxss` 的 `--df-*` 语义 token；未新增基础组件或全局 token。
- `subpackages/dog-profile/services/careRecordPageModel.js` 负责类型筛选、表单读写转换和列表展示字段；页面只负责编排状态、导航和小程序生命周期，根 `care/careRecordPageModel.js` 保留兼容转发。
- `subpackages/dog-profile/services/careRecordService.js` 仍是唯一护理业务入口；页面不直读 `care_records`，不复制归属校验或日期规则。

## 4. 验证与后续边界

本轮新增页面模型和页面交互测试，覆盖多狗隔离、筛选、分页、空态、新增、编辑、长备注、日期错误、删除路由和 UI 组件边界。

```bash
node --test tests/care-record-page-model.test.js tests/care-record-page.test.js \
  tests/care-record-service.test.js tests/care-record-cloud-function.test.js \
  tests/care-record-contract.test.js
npm run check:ui
npm run check:main-package
npm run check:project-navigation
```

OC1 仍需单独授权后部署 `careRecord` 云函数、`care_records` 集合、ACL 和索引；页面未执行线上烟测。首页事项、统一记录时间轴、护理周期推导和医疗结论仍属于后续任务。
