# 首页体重与护理事项实施交接

**状态：** H2.1 已完成

**日期：** 2026-08-05

**上游：** [`项目结构与界面编排 DAG 路线图`](../plans/2026-08-01-project-structure-and-interface-roadmap.md)

**依赖：** `W1.3`、`C1.3`、`OW1`、`OC1`

## 1. 实现范围

本轮在现有首页“档案事项”结构上扩展体重和护理事项来源，没有重做首页布局，也没有接入统一记录时间轴。首页通过主包只读服务读取两个领域的列表结果，不直读 CloudBase 集合，不新增写入接口或线上资源。

## 2. 数据边界

- 体重只取带合同日期的最新有效测量；旧档案 `weightKg` 不生成首页事项。文案只表达“上次记录于今天/几天前”，不做健康异常判断。
- 护理只取实体中用户明确填写的 `nextDate`，没有日期的记录不生成事项。文案明确标记为“你填写的下次日期”，不推导系统周期、推荐日期或医疗结论。
- 首页状态模型把现有档案完整性/适用性事项与体重、护理事项合并，最多保留三条；既有档案事项保持优先级。
- 体重事项进入带 `dogId` 的体重趋势页，护理事项进入带 `dogId` 的护理记录页，档案事项继续进入档案编辑页。

## 3. 工程映射

| 位置 | 职责 |
| --- | --- |
| `services/homeItemService.js` | 主包只读汇总、体重相对时间、护理分页和事项 view model |
| `services/adapters/cloudbase.js` | 通过 `weightRecord`/`careRecord` 云函数提供列表读取 |
| `services/adapters/mock.js` | 为首页事项提供同形状的本地列表读取 |
| `services/homeStateModel.js` | 合并事项来源、校验展示字段并限制三条 |
| `pages/home/index.js` | 首页生命周期读取、失败降级和事项路由 |
| `pages/home/index.wxml` | 复用原事项卡片和 UI Kernel，仅增加动作绑定 |

## 4. 验证与边界

定向测试覆盖真实记录筛选、护理分页、上海自然日相对时间、三条上限、狗狗归属和三类路由；未执行 CloudBase 部署、集合、索引或线上数据操作。

```bash
node --test tests/home-item-service.test.js tests/home-state-model.test.js tests/home-page.test.js
npm run check:ui
npm run check:main-package
npm run check:project-navigation
```
