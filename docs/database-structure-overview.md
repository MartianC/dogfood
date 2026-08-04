# 数据库结构总览

更新时间：2026-08-04

这份文档以当前代码、导出脚本和项目设计文档为准，区分三类数据：用户业务数据、公共营养运行时投影、离线审核主库。CloudBase 是文档数据库，下面的“表”统一指集合；离线部分明确写作 SQLite 表。

## 1. 总体边界

```text
微信用户
  └─ users
       └─ dogs
            ├─ customRecipes
            ├─ mealPlans
            ├─ weight_measurements
            └─ shared_meal_records

离线 SQLite 主库
  ├─ USDA / SR Legacy 原始数据
  ├─ 食材概念、别名、形态
  ├─ 犬食安全策略
  ├─ 营养素排行
  └─ 人饭菜谱与人工映射
          │ 受控导出（版本化、staging）
          ▼
CloudBase 公共只读投影
  ├─ foods / food_nutrients / food_localized_name / pet_nutrition_standards
  └─ data_releases / food_nutrition_profiles / ingredient_catalog /
     canine_ingredient_policies / nutrient_rankings / human_recipes
```

业务集合由云函数写入；公共集合由离线导出和受限导入脚本写入。页面层应使用 `id`、`userId` 等业务字段，不把 `_id`、`_openid` 泄漏成业务契约。

### 1.1 主导航到数据入口

主线导航重排只改变页面编排，不新增集合、索引或数据迁移：

| 页面/动作 | 客户端服务 | 数据入口 | 说明 |
| --- | --- | --- | --- |
| 首页 | `authService`、`dogService`、`sharedMealRecordService`、`homeStateModel` | `users`、`dogs`、`shared_meal_records` | 展示今日主任务、草稿摘要、今日记录和最近一顿；读取失败时仍保留“记一顿”入口 |
| 记录 | `sharedMealRecordService`、月份状态与日历模型 | `shared_meal_records` | 继续只负责本餐月份、日期和不可变详情回看 |
| 狗狗 | `authService`、`dogService` | `users`、`dogs` | 承载原“我的”中的狗狗档案列表、新增和编辑入口 |
| 我的 | `authService` | `users` | 只承载账号信息和已实现的低频能力，不读取狗狗档案列表 |
| 中央“记一顿” | `sharedMealEntryService` | 无独立集合 | 统一进入现有登录、建档、选狗、草稿恢复、菜单和本餐保存流程 |

体重代码已完成独立数据入口，但尚未接入主线页面或首页事项；体重集合、索引和云函数仍需 OW1 单独授权部署。统一记录时间轴尚未接入。旧 `customRecipes`、`mealPlans` 与旧深链继续保留兼容，但不成为当前导航入口。

## 2. CloudBase 用户业务集合

### `users`

用途：微信登录后的用户索引。写入方：`login` 云函数。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` | string | CloudBase 主键 |
| `openId` | string，业务上唯一 | 微信 openid；当前代码用它查询用户 |
| `nickname` | string | 默认“狗饭用户” |
| `avatarUrl` | string | 默认空字符串 |
| `createdAt` | Date | 首次创建 |
| `updatedAt` | Date | 当前实现登录时不会更新，建议后续统一 |

### `dogs`

用途：用户的狗狗档案。所有读写均由 `dogProfile` 云函数按 `_openid` 隔离。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` | string | 主键 |
| `_openid` | string | CloudBase 用户归属，不可由客户端决定 |
| `schemaVersion` | number，当前为 3 | `dogProfile/v3` 合同版本 |
| `name` | string，必填 | 狗狗名称 |
| `birthDate` | `YYYY-MM-DD`，必填 | 当前实际写入字段；由此派生年龄阶段 |
| `ageStage` | string | 当前读取/展示字段，写入时由其他服务补齐或历史遗留 |
| `breed` | `shiba-inu` / `labrador-retriever` / `mixed-or-unknown` | 受控品种 |
| `weightKg` | number > 0 或 null | 当前体重；体重历史上线后无有效测量时允许为 null |
| `dailyMeals` | number > 0 | 每日餐数 |
| `dailyActivityHours` | number，0–6，0.5 步长 | 当前主输入 |
| `activityLevel` | string | 根据活动时长派生，可能为空/历史值 |
| `bodyCondition` | `thin` / `ideal` / `overweight` | 体况 |
| `avatarUrl` | string | 头像 |
| `neutered` | boolean | 是否绝育 |
| `dietGoal` | `daily` / `lowFat` / `gainWeight` / `stomachFriendly` | 饮食目标 |
| `allergens` | string[] | 过敏源，创建时初始化为空数组 |
| `avoidIngredients` | string[] | 忌口，创建时初始化为空数组 |
| `healthNotes` | string | 健康备注 |
| `specialNutritionNeeds` | object | 用户显式确认的疾病、生殖状态和治疗性体重管理；未知值为 `null` |
| `createdAt` / `updatedAt` | Date | 审计时间 |

`birthDate`、`dailyActivityHours` 和 `specialNutritionNeeds` 是共享本餐适用门禁的可信输入；生命阶段与活动档位在运行时派生。客户端和云函数都按 `dogProfile/v3` 校验，旧版档案缓存不能冒充当前合同。

### `weight_measurements`

用途：保存单只狗狗的体重测量历史。唯一写入、列表、详情和删除入口为 `weightRecord` 云函数；小程序客户端不得直读或直写集合。W1.2 已完成代码、schema、权限和索引合同，但未执行 OW1 线上部署或旧 `weightKg` 历史回填。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` | string | CloudBase 主键，服务端生成并映射为业务 `id` |
| `_openid` | string | CloudBase 用户归属，只取云函数上下文 |
| `schemaVersion` | number，固定为 1 | `weightMeasurement/v1` 存储版本 |
| `dogId` | string，必填 | 当前用户拥有的狗狗 ID |
| `weightKg` | number > 0，最多两位小数 | 单位固定为 kg |
| `measuredOn` | `YYYY-MM-DD` | 称量日期，不能晚于上海自然日当天 |
| `createdAt` | Date | 服务端创建时间，用于同日稳定排序 |

机器合同位于 `cloudfunctions/weightRecord/schema/record.schema.json`，写入字段合同位于 `contracts/weight/weight-measurement-write-v1.schema.json`。索引位于 `cloudfunctions/weightRecord/schema/indexes.json`，按 `_openid ASC, dogId ASC, measuredOn DESC, createdAt DESC, _id DESC` 支持单狗历史分页；权限位于同目录 `access.json`，固定为 `ADMINONLY`。

新增或删除体重记录时，`weightRecord` 在服务端事务中同步更新 `dogs.weightKg`：最新有效测量作为当前值，没有剩余有效测量时清空为 null。旧档案 `weightKg` 只在没有历史记录时作为兼容当前值，不自动生成历史记录。

### `customRecipes`

用途：用户自定义食谱及建议结果。写入方：`saveCustomRecipe`。当前保存函数对 payload 使用展开写入，字段约束主要在前端，属于高风险集合。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` / `_openid` | string | 主键 / 用户归属 |
| `targetDogIds` | string[] | 目标狗狗 ID |
| `targetDogSnapshots` | object[] | 保存时的狗狗快照，避免历史被档案更新影响 |
| `title` | string，必填 | 食谱名称 |
| `ingredients` | object[]，至少一项 | `name`、`category`、`perMealAmountGram`、`allergenKey` |
| `adviceSummary` | string | 建议摘要 |
| `advices` | object[] | `ingredientName`、`level`、`suggestion`、`reason` |
| `adviceAlgorithmVersion` / `adviceAlgorithmSource` | string | 算法可追溯信息 |
| `status` | `draft` / `checked` / `archived` | 默认 `draft` |
| `createdAt` / `updatedAt` | Date | 审计时间 |

### `mealPlans`

用途：批量制作清单历史。写入/列表读取方：`saveMealPlan`。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` / `_openid` | string | 主键 / 用户归属 |
| `targetDogIds` | string[] | 目标狗狗 |
| `targetMode` | `singleDog` / `multipleDogs` | 目标模式 |
| `targetDogSnapshots` | object[]，至少一项 | 生成时的狗狗快照 |
| `sourceType` | `builtInRecipe` / `customRecipe` | 食谱来源 |
| `recipeId` / `customRecipeId` | string | 按来源二选一；当前未由云函数强校验 |
| `recipeName` | string，必填 | 冗余名称 |
| `recipeSnapshot` | object | 生成时食谱快照 |
| `periodDays` | number | 制作周期 |
| `calculationParams` | object | 周期、目标狗、舍入规则 |
| `algorithmVersion` / `algorithmSource` | string，必填 | 算法追溯 |
| `totalPortions` | number | 总份数 |
| `dogMealSummaries` | object[] | 每只狗的餐数、克重、食材明细 |
| `totalItems` | object[] | 汇总采购项，含 `name`、`category`、`amountGram` |
| `cookingSteps` / `warnings` | string[] | 烹饪步骤 / 风险提示 |
| `shareImageFileId` | string | 云存储文件 ID |
| `createdAt` / `updatedAt` | Date | 审计时间；当前只新增不更新 |

### `shared_meal_records`

用途：保存“和狗狗一起吃”的单餐不可变快照。唯一写入/列表/详情入口为 `sharedMealRecord` 云函数的 `save | list | get` action；客户端不得直读或修改集合。

| 字段 | 类型/约束 | 说明 |
|---|---|---|
| `_id` / `_openid` | string | 主键 / 用户归属；`_openid` 只取云函数上下文 |
| `targetDogId` | string | 当前用户拥有的狗狗 ID |
| `mealTime` | ISO datetime string | 用餐时间和稳定分页第一排序键 |
| `idempotencyKey` | string | 与 `_openid` 组成唯一索引，保证重试只创建一条 |
| `requestFingerprint` | string | 对 canonical 单餐候选快照的确定性指纹；同 key 异指纹拒绝 |
| `dogSnapshot` | object | 保存时档案快照 |
| `humanMenu` / `sourceIngredientSelections` | object[] | 一到多道人饭菜单、全部来源原料及跨菜单选择决定快照 |
| `dogMealItems` | object[] | 引用 `sharedMealIngredient/v1` 的最终食材和用户填写克重；同一食材可保留多个 `sourceRefs` |
| `assessment` | object | 保存时能量、营养密度、数据覆盖和算法版本快照 |
| `note` | string，最大 200 字 | 可选历史备注；当前创建页不展示备注输入，但保留旧草稿兼容 |
| `photoFileIds` | string[]，`maxItems=0` | 只兼容空数组；当前没有照片选择、上传、保存或展示能力 |
| `versions` | object | recipe、mapping、catalog、policy、standard、nutrition source 与 assessment algorithm 版本 |
| `createdAt` | Date | 服务端创建时间；没有更新 action |

索引机器契约位于 `cloudfunctions/sharedMealRecord/schema/indexes.json`：唯一索引为 `(_openid ASC, idempotencyKey ASC)`；全部记录列表索引为 `(_openid ASC, mealTime DESC, _id DESC)`；按狗筛选索引为 `(_openid ASC, targetDogId ASC, mealTime DESC, _id DESC)`。权限契约位于同目录 `access.json`，固定为 `ADMINONLY`，小程序客户端不可直读或直写。`sharedMealRecord` 云函数、生产集合、ACL 和三条业务索引已于 2026-07-31 部署并通过最小幂等烟测；后续结构变更仍需单独授权。

共享本餐记录不保存自动分配结果。`dogMealItems[].perMealAmountGram` 来自用户首次填写或用户明确确认后的整餐等比例缩放；营养标准只生成评估快照，不反推食材比例。

## 3. CloudBase 公共营养集合

这些集合禁止小程序端写入，数据源是 SQLite 或受控种子文件。

### FoodData 基础集合

- `foods`：`_id=food_<fdc_id>`；字段：`fdc_id`、`data_type`、`description`、`food_category_id`、`publication_date`、`data_version`、`source`。
- `food_nutrients`：`_id=food_nutrient_<id>`；字段：`id`、`food_id`、`fdc_id`、`nutrient_id`、`name`、`unit_name`、`amount`、`data_points`、`derivation_id`、`min`、`max`、`median`、`footnote`、`min_year_acquired`、`data_version`。
- `food_localized_name`：`_id=food_localized_name_<id>`；字段：`id`、`fdc_id`、`food_id`、`locale`、`name`、`name_type`、`confidence`、`created_at`、`updated_at`、`data_version`。
- `pet_nutrition_standards`：`_id=pet_standard_<id>`；顶层字段为标准元数据（`region_code`、`authority`、`standard_code`、`title`、`version`、日期、`status`、`source_url`、`notes`、`data_version`），`profiles[]` 内含犬种/生命阶段/食品范围、能量密度和 `requirements[]`；需求项含 `pet_nutrient_code`、名称、`requirement_type`、数值/文本、单位、basis、条件。

### 食材知识运行时投影

- `data_releases`：发布指针和计数。字段：`release_id`、`base_release_id`、`schema_version`、`status`（`staging` 或 `active`）、`catalog_version`、`policy_version`、`ranking_version`、独立 `recipe_version`、输入 `mapping_version`、`rollback_candidate`、`generated_at`、`sources[]`、`collections` 计数。生产查询只消费当前活动发布，新的导出先进入 staging 完成验证。
- `food_nutrition_profiles`：一条 `source_release_id + fdc_id` 一份聚合快照。字段：`release_id`、`food_id`、`fdc_id`、食物描述/来源版本、`nutrient_count`、`known_nutrient_count`、`nutrients` 对象。`nutrients[nutrient_id]` 含 `name`、`unit`、`amount`、`value_status`。
- `ingredient_catalog`：搜索和选择目录项。字段：`release_id`、`catalog_version`、`policy_version`、`concept_id`、`variant_id`、中文名/别名、分类、制备/部位/皮骨状态、`food_id`/`fdc_id`、来源版本、`policy_status`；新生成物不保存权限布尔字段。
- `canine_ingredient_policies`：安全策略快照。字段：`policy_id`、`policy_version`、兼容目录版本、`subject_key`、`concept_id`、可选 `variant_id`、`decision`、`hazard_type`、`conditions`、`evidence`、`rationale`、审核人/时间和下次复核时间。
- `nutrient_rankings`：版本化营养素排行。字段：`ranking_version`、兼容目录/策略版本、`nutrient_code`、中文名、单位、basis、`formula`、候选/入榜数量、生成时间、`items[]`。排行项含 rank、概念/形态/food ID、每 100g 数值和组成值。
- `human_recipes`：授权菜谱运行时投影。历史 `recipe_version=2026-07-23-v1` 共6,082条且保持不变；v2 使用 `human-recipe-runtime-v2-<mapping_version>` 独立版本和新 `_id/release_id` 键空间，每条内嵌全部来源有序原料、映射组件、四态策略、阻断原因和版本快照，人饭分量只作参考。

## 4. 离线 SQLite 主库表

### 原始来源层

`data_build(release_id, schema_version)`；`source_release(release_id, source_kind, source_version, source_path, source_sha256, license_status)`；`source_import_stat(source_release_id, entity_name, row_count)`。

`source_food(source_release_id, fdc_id, data_type, description, food_category_id, publication_date)`；`source_nutrient(source_release_id, nutrient_id, name, unit_name, nutrient_nbr, rank)`；`source_food_nutrient(source_release_id, source_record_id, fdc_id, nutrient_id, amount, data_points, derivation_id, min, max, median, footnote, min_year_acquired)`；`source_localized_name(source_release_id, source_record_id, fdc_id, locale, name, name_type, confidence, created_at, updated_at)`；`source_food_category(source_release_id, category_id, code, description)`；`source_sr_legacy_food(source_release_id, fdc_id, ndb_number)`。

### 人饭菜谱层

`human_recipe` 保存来源、标题、分类、原料/分量原文及数量对齐状态；`human_recipe_ingredient_mention` 保存按位置拆分的原料和分量；`recipe_ingredient_term` 保存规范化原料写法和出现次数。

### 审核与知识层

`ingredient_concept`（标准概念）；`ingredient_alias`（别名到概念，含审核状态和版本）；`ingredient_variant`（生熟/部位/皮骨状态到来源食物）；`canine_ingredient_policy`（概念或形态安全策略）；`nutrient_ranking` 与 `nutrient_ranking_item`（版本化排行及排行项）；`recipe_mapping_release`（映射版本、兼容版本、来源和授权）；`ingredient_mapping_decision` 与 `ingredient_mapping_component`（人饭原料映射及复合拆分）；`review_task`（歧义、安全关键、无形态等人工任务）。完整字段和约束以 `scripts/fooddata/build_ingredient_data_sqlite.py` 的 `SCHEMA_SQL` 为最终机器契约。

## 5. 关系、版本和权限

1. 用户关系：`users.openId` 是登录索引；业务集合通过 `_openid` 归属用户，`dogs._id` 被食谱、清单、体重测量和共享本餐记录以 ID 引用，同时保存 snapshots。共享本餐一次只引用一只狗狗。
2. 营养关系：`foods` → `food_nutrients` / `food_localized_name`；`food_nutrition_profiles` 将同一食物的营养明细聚合成一次读取；`ingredient_catalog.variant_id` → `food_id`。
3. 审核关系：`ingredient_concept` → `ingredient_alias` / `ingredient_variant`；策略优先匹配 variant，缺失时回退 concept；排行必须同时兼容 catalog 和 policy 版本。
4. 发布关系：一个 `release_id` 绑定一组 `catalog_version`、`policy_version`、`ranking_version` 和各集合计数。旧快照不可修改，生产切换应通过活动版本指针完成。
5. 权限：`users`、`dogs`、`customRecipes`、`mealPlans`、`weight_measurements`、`shared_meal_records` 仅云函数访问；体重和共享本餐写入都会复核狗狗归属。共享本餐保存还会复核活动数据版本和当前食材策略。公共营养集合客户端可读不可写；策略集合按当前设计由云函数读取，不能直接暴露原始审核字段。

## 6. 当前需要优先收口的地方

- **旧档案数据迁移仍需统计**：当前客户端、云函数和缓存已经统一使用 `dogProfile/v3`，并把 `birthDate`、`dailyActivityHours`、`specialNutritionNeeds` 作为可信输入；仍需单独统计线上旧文档缺失字段的规模，再决定是否执行一次性迁移。
- **用户主键命名不一致**：`users` 使用 `openId`，其他集合使用 `_openid`。这是 CloudBase 约定与业务字段混用，建议保留 `_openid` 做权限，统一业务层只暴露 `userId`。
- **写入白名单不足**：`saveCustomRecipe` 和 `saveMealPlan` 直接展开 payload，可能写入未定义字段或覆盖审计字段；应改为显式字段白名单和服务端枚举校验。
- **关系没有服务端校验**：保存食谱/清单时尚未确认 `targetDogIds` 属于当前用户，也没有验证 `recipeId`、`customRecipeId` 与 `sourceType` 的一致性。
- **历史字段兼容未显式化**：`updatedAt`、`ageStage`、`activityLevel` 等存在历史数据可能缺失的情况；应在读取归一化之外增加版本号或一次性迁移统计。
- **离线与线上边界容易混淆**：`human_recipe` 等来源/审核表只在 SQLite；CloudBase 只查询经过版本化映射和安全过滤的复数集合 `human_recipes`。

## 7. 建议的收口顺序

1. 先冻结本文件中的集合契约，并用脚本扫描线上/测试 fixture 的实际字段。
2. 给四个业务集合增加服务端 DTO 白名单、枚举和归属校验。
3. 统计 `dogs` 中缺少 `dogProfile/v3` 必需字段的旧文档；继续在读取边界显式降级，不从派生字段反推可信输入。
4. 为公共投影统一要求 `release_id` + 兼容版本，所有查询显式带活动版本。
5. 最后再考虑删除冗余字段或拆集合；历史清单和食谱必须继续依赖快照，不做破坏性回填。
