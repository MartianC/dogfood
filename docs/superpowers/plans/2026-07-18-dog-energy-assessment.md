# 本餐能量与营养密度评估实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 逐任务执行本计划。Figma 阶段必须加载 `figma:figma-use` 和 `figma:figma-generate-design`；小程序 UI 验证阶段必须加载项目 `wechat-devtools` skill。步骤使用复选框（`- [ ]`）追踪。

**Goal:** 先在 Figma 补齐狗狗档案与本餐双轴评估设计并取得用户确认，再实现出生日期派生生命周期、全生命周期能量需求、本餐能量供给、独立营养密度结论和按比例调整整餐份量。

**Architecture:** 使用 `lifeStageEstimator` 统一派生生命周期，使用独立的 `energyRequirementService` 和 `mealEnergyService` 计算需求与供给，保留 `nutritionAssessmentService` 负责营养密度，再由 `mealAssessmentService` 组合为允许单侧降级的双轴展示模型。Figma 设计与用户评审是代码阶段的强制前置门禁；设计未确认时不得修改业务代码。

**Tech Stack:** Figma Design、Figma MCP、微信小程序原生框架、JavaScript、CloudBase 云函数与云数据库、Node.js `node:test`、TDesign Miniprogram 1.15.3、项目 UI Kernel。

## Global Constraints

- 设计依据固定为 `docs/superpowers/specs/2026-07-18-dog-energy-assessment-design.md`。
- 先完成 Figma Task 1–3，并由用户明确回复设计通过；此前禁止执行 Task 4 及后续代码任务。
- Figma 文件固定使用 `fileKey=CHUlIiWUhuXHA0IUwQe6Qe`；保留现有页面 `狗饭 · 营养评估改版`（Page ID `19726:38`）和 A01–A06 原稿。
- 用户只填写出生日期，不选择年龄阶段；`ageStage` 只能作为运行时兼容派生值，不能继续作为持久化计算依据。
- 品种必须从受控列表选择，允许“混血/不确定”；预计成年体重由版本化品种数据源估算并只读展示，任何页面不得要求用户手工填写。
- 活动只通过横向 Slider 输入 `dailyActivityHours`：0–6 小时、步进 0.5 小时；`activityLevel` 由时长阈值派生并只作内部/旧数据兼容字段。
- 四档阈值固定为 `<1 → low`、`1–<2 → moderateLowImpact`、`2–<3 → moderateHighImpact`、`3–6 → high`。这是产品对 FEDIAF 系数的时长映射，用户不选择强度。
- 档案 UI 暂时隐藏过敏源和忌口；保存其他字段时必须原样保留已有 `allergens` 与 `avoidIngredients`，不得因控件隐藏而清空。
- 小于 8 周不自动评估；8–14 周为幼犬早期，14 周至不足 1 岁为幼犬晚期，1–7 岁为成年犬，7 岁及以上使用老年犬能量口径和成年犬营养标准。
- 能量与营养密度必须独立展示和独立降级，不生成单一综合分数或模糊总体状态。
- 固定目标使用 90%–110% 展示容差；高活动犬原生范围不叠加容差。
- 零食、营养膏和其他餐次不纳入本餐评估，界面必须展示该口径。
- 页面和业务组件不得直接使用 TDesign 标签；优先组合 `ui-button`、`ui-card`、`ui-field`、`ui-tag` 和 `ui-notice`。
- 普通 WXSS 不新增裸色值或泛名选择器；所有点击目标默认不小于 `88rpx`。
- 不新增运行时依赖、构建工具或医学诊断文案。
- 每次代码或文档改动后更新当日 `docs/work-logs/YYYY-MM-DD.md`。
- 不执行 Git 暂存或提交；如需提交，必须在全部验证完成后另行取得用户明确允许。

---

## Phase A：Figma 设计与评审门禁

### Task 1：补齐狗狗档案设计稿

**Files:**
- Modify: `docs/ui/figma-implementation-notes.md`
- Reference: `docs/ui/design-system.md`
- Reference: `docs/ui/ai-frontend-rules.md`
- Reference: `docs/superpowers/specs/2026-07-18-dog-energy-assessment-design.md`

**Interfaces:**
- Consumes: 既有 Figma 文件 `CHUlIiWUhuXHA0IUwQe6Qe` 的狗饭变量、排版和表单视觉骨架。
- Produces: 新 Figma 页面 `狗饭 · 本餐评估 · 能量扩展`，其中 C01、C02 是代码实施的档案页面唯一视觉依据。

- [ ] **Step 1：加载 Figma 技能并审计目标文件。**

  完整读取 `figma:figma-use` 与 `figma:figma-generate-design` 后，使用 Figma 工具打开 `fileKey=CHUlIiWUhuXHA0IUwQe6Qe`。检查当前页面、变量、文字样式、A01–A06 和工程交接标记，不写入原页面 `19726:38`。

- [ ] **Step 2：创建独立设计页面和产品口径区。**

  在同一 Figma 文件中新建页面 `狗饭 · 本餐评估 · 能量扩展`，创建页面级产品口径区，记录出生日期为唯一年龄输入、年龄阶段由系统估算、老年犬沿用成年犬营养标准、能量与营养密度独立、零食与额外喂食不计入。C01/C02 业务界面内不得出现尺寸、点击区、实现方式或功能描述备注。

- [ ] **Step 3：绘制 C01 成年/老年犬档案。**

  创建 `C01 · 狗狗档案 · 成年犬`，画板固定 `375 × 812`。字段顺序固定为：头像、名字、出生日期、品种、系统估算阶段、当前体重、每日餐数、日均活动时长 Slider、体况、绝育状态、饮食目标。出生日期和品种使用选择器；系统估算阶段为只读结果；活动 Slider 为 0–6 小时、0.5 小时步进，背景以四种颜色区分 `<1`、`1–<2`、`2–<3`、`3–6` 四档，并实时显示“日均 X 小时 · 水平名称”；体况三档。隐藏过敏源与忌口控件。页面包含保存操作；未来出生日期错误作为独立字段状态展示，不能与 C01 的有效日期正常态混用。

- [ ] **Step 4：绘制 C02 幼犬动态档案。**

  复制 C01 的工程可复用结构创建 `C02 · 狗狗档案 · 幼犬`。出生日期示例使系统估算为“幼犬晚期”；品种选择后，在当前体重旁显示“系统估算 X kg”的只读预计成年体重。不得出现预计成年体重输入框、必填提示或“小于当前体重”错误。为“混血/不确定”或无可靠估算保留只读不可用状态，但不阻断保存。

- [ ] **Step 5：验证档案稿并记录交接。**

  分别生成 C01、C02、出生日期错误状态和品种估算不可用状态截图，检查字段层级、长文案、底部安全区、点击目标和 375 px 宽度内的溢出。确认界面无实现/尺寸/功能备注、无过敏源/忌口控件、无活动强度选择。将页面 Node ID、C01/C02 Frame Node ID、Slider 状态、字段与工程 `ui-field`/原生 `picker`/原生 `slider` 的映射写入 `docs/ui/figma-implementation-notes.md`。

**验收：** 用户不再看到年龄阶段选择、活动强度选择、预计成年体重输入或过敏源/忌口控件；品种为必填选择，幼犬只读展示系统估算或不可用状态，Slider 只按时长实时派生四档；A01–A06 没有被修改。

### Task 2：补齐本餐双轴评估与份量调整设计稿

**Files:**
- Modify: `docs/ui/figma-implementation-notes.md`
- Reference: `components/nutrition-assessment/index.wxml`
- Reference: `components/nutrition-assessment/index.wxss`
- Reference: `docs/ui/component-contracts.md`

**Interfaces:**
- Consumes: Task 1 新页面、现有 A01–A06 白底报告式、B02 v2 营养食材入口和当前工程组件边界。
- Produces: C03–C09 Frame、原型连线和状态矩阵，供 Task 11、Task 12 实施。

- [ ] **Step 1：绘制 C03 收起态双轴卡片。**

  创建 `C03 · 本餐评估 · 收起`，沿用当前食谱编辑页背景和底部悬浮结构。卡片标题改为“本餐评估”，固定展示两组信息：

  ```text
  能量接近估算目标
  当前约 286 kcal · 估算目标 310 kcal

  营养密度需要调整
  钙低于成年犬参考要求
  ```

  两组状态必须依靠标题和文字区分，颜色只作辅助；整卡仍可点击进入展开态。

- [ ] **Step 2：绘制 C04 展开态。**

  创建 `C04 · 本餐评估 · 展开`，顺序固定为“份量与能量 → 营养密度 → 国标 → FEDIAF → 全部元素入口 → 计算依据”。份量区示例使用成年犬、10 kg、日均 1.5 小时、一般活动、每日 2 餐、每日约 619 kcal、本餐目标约 310 kcal；营养密度区继续使用 A02 的白底报告式和状态细线，不复制一套新视觉语言。

- [ ] **Step 3：绘制 C05 高活动范围。**

  创建 `C05 · 本餐评估 · 高活动范围`，验证目标范围而非单值的排版。必须同时显示本餐实际值、目标范围、活动口径和“从范围下界作为起始参考”的说明，不把范围中点伪装成唯一答案。

- [ ] **Step 4：绘制 C06 按比例调整预览。**

  创建 `C06 · 调整整餐份量 · 预览`，使用底部弹层或等价模式展示：当前总重与能量、建议总重与能量、各食材调整前后克重、取消、确认调整。明确写出“食材比例不变，营养密度结论不变”。示例固定为 `240 g / 286 kcal → 约 260 g / 310 kcal`。

- [ ] **Step 5：绘制 C07–C09 降级状态。**

  创建三个独立 Frame：

  - `C07 · 能量不可用 · 营养密度可用`：列出缺少能量数据的食材，继续展示国标/FEDIAF 密度结论。
  - `C08 · 能量可用 · 营养密度不可用`：显示能量状态，同时说明水分或标准数据不足。
  - `C09 · 档案待完善`：覆盖出生日期缺失，以及幼犬因“混血/不确定”或品种数据源无可靠预计成年体重而只能评估营养密度的状态；提供完善品种入口但不提供成年体重输入，不丢失当前食谱。

- [ ] **Step 6：连接原型路径。**

  配置 C03 → C04；C04“按目标调整整餐份量”→ C06；C06“取消”→ C04；C06“确认调整”→ C04 的重算后状态；C04 营养偏低入口 → 既有 B02 v2 定稿 Frame `19788:136`。无法跨页面直接连线时，在同一新页面放置只读目标快照并在交接文档记录真实目标 Node ID。

- [ ] **Step 7：执行视觉和结构检查。**

  为 C03–C09 生成截图，检查固定底部卡片、展开滚动区、弹层安全区、长文案、双轴状态、范围排版、部分可用状态和所有点击目标。结构审计不得发现 placeholder、默认英文文案、零尺寸文字、节点溢出或不可读对比度。

**验收：** 设计稿覆盖收起、展开、高活动范围、调整预览和三类降级状态；能量与营养密度没有被合并；现有营养密度操作仍可识别。

### Task 3：完成 Figma 评审并执行阻塞门禁

**Files:**
- Modify: `docs/ui/figma-implementation-notes.md`
- Modify: `docs/work-logs/2026-07-19.md`

**Interfaces:**
- Consumes: Task 1–2 的 C01–C09、截图、原型连线和组件映射。
- Produces: 用户明确确认的设计基线，以及允许开始 Task 4 的门禁记录。

- [ ] **Step 1：形成设计交付清单。**

  在 `docs/ui/figma-implementation-notes.md` 记录新页面 URL、Page Node ID、C01–C09 Node ID、每个 Frame 的用途、工程组件映射、原型路径、状态矩阵和已知差异。交付记录不得保留未决状态。

- [ ] **Step 2：记录设计验证。**

  在 `docs/work-logs/2026-07-19.md` 追加 Figma 改动、原因、截图检查结果、是否修改代码和提交信息。此时提交信息必须为“未提交（按要求等待用户允许）”。

- [ ] **Step 3：向用户展示并请求评审。**

  向用户提供 Figma 链接、C01/C02 档案截图、C03/C04 双轴评估截图、C06 份量调整截图和 C07–C09 状态总览，并明确询问是否通过设计。

- [ ] **Step 4：执行强制停止。**

  如果用户没有明确回复“设计通过”或等价确认，立即停止，不读取实现技能、不修改 Task 4 及后续列出的业务代码。用户要求改稿时，只回到 Task 1–3，更新设计、截图、交接和工作日志后重新评审。

**Gate A（阻塞）：** 只有用户明确确认 Figma 设计后，才能开始 Phase B。执行者自检、截图通过或文档完成均不能替代用户确认。

---

## Phase B：代码实施（仅在 Gate A 通过后）

### Task 4：建立统一生命周期估算服务

**Files:**
- Create: `services/lifeStageEstimator.js`
- Create: `tests/life-stage-estimator.test.js`

**Interfaces:**
- Consumes: `{ birthDate: 'YYYY-MM-DD', today?: 'YYYY-MM-DD' }`。
- Produces: `estimateLifeStage(input)` 和 `decorateDog(dog, today)`；结果字段固定为 `available`、`reason`、`ageDays`、`ageWeeks`、`ageYears`、`nutritionStage`、`energyStage`、`legacyAgeStage`、`label`。

- [ ] **Step 1：编写生命周期边界失败测试。**

  新建 `tests/life-stage-estimator.test.js`：

  ```js
  const test = require('node:test')
  const assert = require('node:assert/strict')
  const { estimateLifeStage, decorateDog } = require('../services/lifeStageEstimator')

  test('按 8 周、14 周、1 岁和 7 岁推导内部阶段', () => {
    assert.equal(estimateLifeStage({ birthDate: '2026-05-24', today: '2026-07-18' }).reason, 'under_minimum_age')
    assert.equal(estimateLifeStage({ birthDate: '2026-05-23', today: '2026-07-18' }).nutritionStage, 'early_growth')
    assert.equal(estimateLifeStage({ birthDate: '2026-04-12', today: '2026-07-18' }).nutritionStage, 'early_growth')
    assert.equal(estimateLifeStage({ birthDate: '2026-04-11', today: '2026-07-18' }).nutritionStage, 'late_growth')
    assert.equal(estimateLifeStage({ birthDate: '2025-07-19', today: '2026-07-18' }).energyStage, 'puppy')
    assert.equal(estimateLifeStage({ birthDate: '2025-07-18', today: '2026-07-18' }).energyStage, 'adult')
    assert.equal(estimateLifeStage({ birthDate: '2019-07-18', today: '2026-07-18' }).energyStage, 'senior')
  })

  test('拒绝未来日期并用派生阶段覆盖旧 ageStage', () => {
    assert.equal(estimateLifeStage({ birthDate: '2026-07-19', today: '2026-07-18' }).reason, 'future_birth_date')
    const dog = decorateDog({ name: '布丁', birthDate: '2025-07-18', ageStage: 'senior' }, '2026-07-18')
    assert.equal(dog.ageStage, 'adult')
    assert.equal(dog.lifeStageLabel, '成年犬')
  })
  ```

- [ ] **Step 2：运行测试并确认按预期失败。**

  Run: `node --test tests/life-stage-estimator.test.js`

  Expected: FAIL，错误包含 `Cannot find module '../services/lifeStageEstimator'`。

- [ ] **Step 3：实现日期解析和阶段推导。**

  `services/lifeStageEstimator.js` 必须使用日期字符串的本地自然日语义，周龄使用相差天数，1 岁和 7 岁使用日历周年边界。实现骨架固定为：

  ```js
  const DAY_MS = 24 * 60 * 60 * 1000
  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

  function localDateText(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function parseDateText(value) {
    const match = String(value || '').match(DATE_PATTERN)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const stamp = Date.UTC(year, month - 1, day)
    const checked = new Date(stamp)
    if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null
    return { year, month, day, stamp }
  }

  function fullYearsBetween(birth, current) {
    let years = current.year - birth.year
    if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) years -= 1
    return years
  }

  function unavailable(reason) {
    return {
      available: false,
      reason,
      ageDays: null,
      ageWeeks: null,
      ageYears: null,
      nutritionStage: null,
      energyStage: null,
      legacyAgeStage: '',
      label: reason === 'under_minimum_age' ? '幼龄犬' : '阶段待完善'
    }
  }

  function estimateLifeStage({ birthDate, today = localDateText() }) {
    const birth = parseDateText(birthDate)
    const current = parseDateText(today)
    if (!birth || !current) return unavailable('invalid_birth_date')
    if (birth.stamp > current.stamp) return unavailable('future_birth_date')
    const ageDays = Math.floor((current.stamp - birth.stamp) / DAY_MS)
    const ageWeeks = Math.floor(ageDays / 7)
    const ageYears = fullYearsBetween(birth, current)
    if (ageDays < 56) return { ...unavailable('under_minimum_age'), ageDays, ageWeeks, ageYears }
    if (ageDays < 98) return { available: true, reason: '', ageDays, ageWeeks, ageYears, nutritionStage: 'early_growth', energyStage: 'puppy', legacyAgeStage: 'puppy', label: '幼犬早期' }
    if (ageYears < 1) return { available: true, reason: '', ageDays, ageWeeks, ageYears, nutritionStage: 'late_growth', energyStage: 'puppy', legacyAgeStage: 'puppy', label: '幼犬晚期' }
    if (ageYears < 7) return { available: true, reason: '', ageDays, ageWeeks, ageYears, nutritionStage: 'adult', energyStage: 'adult', legacyAgeStage: 'adult', label: '成年犬' }
    return { available: true, reason: '', ageDays, ageWeeks, ageYears, nutritionStage: 'adult', energyStage: 'senior', legacyAgeStage: 'senior', label: '老年犬' }
  }

  function decorateDog(dog, today) {
    const lifeStage = estimateLifeStage({ birthDate: dog && dog.birthDate, today })
    return {
      ...(dog || {}),
      lifeStage,
      ageStage: lifeStage.legacyAgeStage,
      lifeStageLabel: lifeStage.label,
      profileIncomplete: !lifeStage.available && lifeStage.reason !== 'under_minimum_age'
    }
  }

  module.exports = {
    estimateLifeStage,
    decorateDog
  }
  ```

  阶段映射固定为：不足 56 天不可评估；56–97 天 `early_growth/puppy`；98 天至首个生日 `late_growth/puppy`；首个生日至第七个生日前 `adult/adult`；第七个生日起 `adult/senior`。`decorateDog` 只能从估算结果生成运行时 `ageStage` 和 `lifeStageLabel`，不能信任输入中的旧 `ageStage`。

- [ ] **Step 4：增加闰年和日期格式测试。**

  增加 `2024-02-29` 周年、空日期、非法格式和当前日出生用例；非法输入必须返回 `{ available: false, reason: 'invalid_birth_date' }`，不得抛出未捕获异常。

- [ ] **Step 5：运行生命周期测试。**

  Run: `node --test tests/life-stage-estimator.test.js`

  Expected: PASS，覆盖 8 周、14 周、1 岁、7 岁、闰年和非法日期。

### Task 5：扩展档案数据与持久化

**Files:**
- Create: `data/breedAdultWeightCatalog.js`
- Modify: `data/options.js`
- Create: `services/dogProfileDerivations.js`
- Modify: `services/dogService.js`
- Modify: `services/adapters/mock.js`
- Modify: `cloudfunctions/dogProfile/index.js`
- Create: `cloudfunctions/dogProfile/profileValidation.js`
- Create: `tests/dog-profile-derivations.test.js`
- Create: `tests/dog-profile-service.test.js`

**Interfaces:**
- Consumes: Task 4 `estimateLifeStage()`、`decorateDog()`。
- Produces: 保存字段 `birthDate`、`breed`、`weightKg`、`dailyMeals`、`dailyActivityHours`、派生 `activityLevel`、`bodyCondition`、`neutered`；运行时只读字段 `expectedAdultWeightKg`、`adultWeightEstimateReason`、`breedCatalogVersion`；`listDogs/createDog/updateDog` 返回带运行时派生阶段和品种估算的狗狗对象。

- [ ] **Step 1：编写档案规范化与校验失败测试。**

  `tests/dog-profile-derivations.test.js` 覆盖 Slider 边界和品种估算；`tests/dog-profile-service.test.js` 覆盖出生日期与品种必填、0–6 小时和 0.5 小时步进、输入 `ageStage` 不作为保存依据、输入 `expectedAdultWeightKg` 不被信任，以及隐藏字段保留。

  ```js
  const test = require('node:test')
  const assert = require('node:assert/strict')
  const dogService = require('../services/dogService')
  const {
    deriveActivityLevel,
    estimateExpectedAdultWeight
  } = require('../services/dogProfileDerivations')

  const puppy = {
    name: '布丁',
    birthDate: '2026-01-18',
    breed: 'shiba-inu',
    weightKg: 8,
    dailyMeals: 3,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal'
  }

  test('活动水平只按日均时长派生', () => {
    assert.equal(deriveActivityLevel(0.5), 'low')
    assert.equal(deriveActivityLevel(1), 'moderateLowImpact')
    assert.equal(deriveActivityLevel(2), 'moderateHighImpact')
    assert.equal(deriveActivityLevel(3), 'high')
    assert.equal(deriveActivityLevel(6), 'high')
  })

  test('预计成年体重来自版本化品种目录且不能由请求覆盖', () => {
    const estimate = estimateExpectedAdultWeight('shiba-inu')
    assert.equal(estimate.available, true)
    assert.equal(estimate.expectedAdultWeightKg, 10.5)
    const normalized = dogService.normalizeDog({ ...puppy, expectedAdultWeightKg: 99 }, '2026-07-18')
    assert.equal(normalized.expectedAdultWeightKg, undefined)
  })

  test('幼犬档案保存品种和日均活动时长', () => {
    const normalized = dogService.normalizeDog(puppy, '2026-07-18')
    assert.equal(normalized.birthDate, '2026-01-18')
    assert.equal(normalized.breed, 'shiba-inu')
    assert.equal(normalized.dailyActivityHours, 1.5)
    assert.equal(normalized.activityLevel, 'moderateLowImpact')
    assert.equal(normalized.ageStage, undefined)
    assert.doesNotThrow(() => dogService.validateDog(normalized, '2026-07-18'))
  })

  test('混血或未知品种允许保存但预计成年体重不可用', () => {
    const normalized = dogService.normalizeDog({ ...puppy, breed: 'mixed-or-unknown' }, '2026-07-18')
    assert.doesNotThrow(() => dogService.validateDog(normalized, '2026-07-18'))
    const estimate = estimateExpectedAdultWeight(normalized.breed)
    assert.equal(estimate.available, false)
    assert.equal(estimate.adultWeightEstimateReason, 'breed_estimate_unavailable')
  })

  test('编辑隐藏字段时不因表单缺少控件而清空旧值', async () => {
    const stored = { ...puppy, id: 'dog-1', allergens: ['鸡蛋'], avoidIngredients: ['洋葱'] }
    const updated = await dogService.mergeDogForUpdate(stored, { ...puppy, name: '布丁新档案' })
    assert.deepEqual(updated.allergens, ['鸡蛋'])
    assert.deepEqual(updated.avoidIngredients, ['洋葱'])
  })
  ```

- [ ] **Step 2：运行档案测试并确认失败。**

  Run: `node --test tests/dog-profile-derivations.test.js tests/dog-profile-service.test.js`

  Expected: FAIL，错误包含缺少 `dogProfileDerivations` 或新品种/时长字段尚未实现。

- [ ] **Step 3：建立版本化品种目录和纯派生函数。**

  `data/breedAdultWeightCatalog.js` 使用稳定 `value`、中文 `label`、单点 `expectedAdultWeightKg` 和可审计来源元数据；目录版本随数值变更递增。首版必须包含设计夹具和“混血/不确定”，且所有可估算条目都要在实现前由项目确认数据来源，不能把示例值扩展成未经验证的完整目录：

  ```js
  const BREED_CATALOG_VERSION = '2026-07-19.v1'
  const breedAdultWeightCatalog = [
    { value: 'shiba-inu', label: '柴犬', expectedAdultWeightKg: 10.5 },
    { value: 'labrador-retriever', label: '拉布拉多犬', expectedAdultWeightKg: 30 },
    { value: 'mixed-or-unknown', label: '混血/不确定', expectedAdultWeightKg: null }
  ]

  module.exports = { BREED_CATALOG_VERSION, breedAdultWeightCatalog }
  ```

  `services/dogProfileDerivations.js` 是唯一派生入口：

  ```js
  const {
    BREED_CATALOG_VERSION,
    breedAdultWeightCatalog
  } = require('../data/breedAdultWeightCatalog')

  function deriveActivityLevel(value) {
    if (value === '' || value === null || value === undefined) return ''
    const hours = Number(value)
    if (!Number.isFinite(hours) || hours < 0 || hours > 6) return ''
    if (hours < 1) return 'low'
    if (hours < 2) return 'moderateLowImpact'
    if (hours < 3) return 'moderateHighImpact'
    return 'high'
  }

  function estimateExpectedAdultWeight(breed) {
    const item = breedAdultWeightCatalog.find((option) => option.value === breed)
    if (!item || !(item.expectedAdultWeightKg > 0)) {
      return {
        available: false,
        adultWeightEstimateReason: 'breed_estimate_unavailable',
        expectedAdultWeightKg: null,
        breedCatalogVersion: BREED_CATALOG_VERSION
      }
    }
    return {
      available: true,
      adultWeightEstimateReason: '',
      expectedAdultWeightKg: item.expectedAdultWeightKg,
      breedCatalogVersion: BREED_CATALOG_VERSION
    }
  }

  module.exports = { deriveActivityLevel, estimateExpectedAdultWeight }
  ```

  在 `data/options.js` 导出 `breedOptions` 和用于显示的四档 `activityDurationBands`，不再导出供档案页点选的活动水平胶囊：

  ```js
  const activityDurationBands = [
    { min: 0, maxExclusive: 1, value: 'low', label: '低活动' },
    { min: 1, maxExclusive: 2, value: 'moderateLowImpact', label: '一般活动' },
    { min: 2, maxExclusive: 3, value: 'moderateHighImpact', label: '较多活动' },
    { min: 3, maxInclusive: 6, value: 'high', label: '高活动' }
  ]

  const bodyConditionOptions = [
    { value: 'thin', label: '偏瘦' },
    { value: 'ideal', label: '理想' },
    { value: 'overweight', label: '偏胖' }
  ]
  ```

  旧 `ageStageOptions` 可以暂时保留导出供非档案筛选使用，但档案页面不得再消费。

- [ ] **Step 4：实现客户端规范化、校验、隐藏字段保留和运行时装饰。**

  `services/dogService.js` 的 `normalizeDog(payload)` 不返回输入的 `ageStage` 或 `expectedAdultWeightKg`，根据 `dailyActivityHours` 派生 `activityLevel`。`validateDog(dog, today)` 要求受控品种值和有效 Slider 数值，但不因品种估算不可用拒绝保存。`listDogs/createDog/updateDog` 对适配器返回值调用生命周期与品种装饰，确保档案卡、风险提示和食谱服务收到同一派生结果。编辑时用已存对象合并可见字段；缺少 `allergens`/`avoidIngredients` 键表示保留，不能规范化为空数组覆盖。

  ```js
  const { estimateLifeStage, decorateDog } = require('./lifeStageEstimator')

  const { breedAdultWeightCatalog } = require('../data/breedAdultWeightCatalog')
  const { deriveActivityLevel, estimateExpectedAdultWeight } = require('./dogProfileDerivations')

  const BREEDS = new Set(breedAdultWeightCatalog.map((item) => item.value))
  const BODY_CONDITIONS = new Set(['thin', 'ideal', 'overweight'])

  function normalizeActivityLevel(value) {
    if (value === 'normal') return 'moderateLowImpact'
    return String(value || '').trim()
  }

  function optionalHalfHour(value) {
    if (value === '' || value === null || value === undefined) return null
    const hours = Number(value)
    return Number.isFinite(hours) ? hours : null
  }

  function normalizeDog(payload = {}) {
    return {
      name: String(payload.name || '').trim(),
      birthDate: String(payload.birthDate || '').trim(),
      breed: String(payload.breed || '').trim(),
      weightKg: Number(payload.weightKg || 0),
      dailyMeals: Number(payload.dailyMeals || 0),
      dailyActivityHours: optionalHalfHour(payload.dailyActivityHours),
      activityLevel: deriveActivityLevel(payload.dailyActivityHours),
      bodyCondition: String(payload.bodyCondition || '').trim(),
      avatarUrl: payload.avatarUrl || '',
      neutered: Boolean(payload.neutered),
      dietGoal: payload.dietGoal || 'daily',
      ...(Object.hasOwn(payload, 'allergens') ? { allergens: payload.allergens } : {}),
      ...(Object.hasOwn(payload, 'avoidIngredients') ? { avoidIngredients: payload.avoidIngredients } : {}),
      healthNotes: payload.healthNotes || ''
    }
  }

  function validateDog(dog, today) {
    if (!dog.name) throw new Error('请填写狗狗名字')
    const stage = estimateLifeStage({ birthDate: dog.birthDate, today })
    if (stage.reason === 'invalid_birth_date') throw new Error('请填写正确的出生日期')
    if (stage.reason === 'future_birth_date') throw new Error('出生日期不能晚于今天')
    if (!BREEDS.has(dog.breed)) throw new Error('请选择狗狗品种')
    if (!(dog.weightKg > 0)) throw new Error('请填写狗狗体重')
    if (!(dog.dailyMeals > 0)) throw new Error('请填写每日餐数')
    if (!(dog.dailyActivityHours >= 0 && dog.dailyActivityHours <= 6 && Number.isInteger(dog.dailyActivityHours * 2))) {
      throw new Error('请选择 0–6 小时的日均活动时长')
    }
    if (!BODY_CONDITIONS.has(dog.bodyCondition)) throw new Error('请选择体况')
  }

  function decorateSavedDog(dog) {
    const estimate = estimateExpectedAdultWeight(dog && dog.breed)
    const derivedLevel = deriveActivityLevel(dog && dog.dailyActivityHours)
    return decorateDog({
      ...dog,
      activityLevel: derivedLevel || normalizeActivityLevel(dog && dog.activityLevel),
      ...estimate
    })
  }
  ```

- [ ] **Step 5：同步 Mock 与 CloudBase 数据。**

  `services/adapters/mock.js` 删除静默注入 `activityLevel: 'normal'`。新建档案保存 `dailyActivityHours` 及其派生 `activityLevel`；旧档案的 `normal` 在读取时映射为 `moderateLowImpact`，但不反推伪造时长，也不批量回写。`expectedAdultWeightKg` 只在客户端运行时由版本化目录装饰，不接受请求体中的同名字段。

  将云端校验提取到纯函数文件 `cloudfunctions/dogProfile/profileValidation.js`，避免只能依赖页面拦截。新建或编辑请求必须有受控品种、0–6 小时且为 0.5 小时步进的 `dailyActivityHours`，但“混血/不确定”合法。服务端从时长重新派生 `activityLevel`，忽略请求中的冲突值。历史档案仍允许被读取；再次保存时要求补齐品种和时长。更新请求缺少隐藏数组时，写入对象不得包含对应键；Mock 与云端测试均要证明旧数组不会被清空。

  云函数的字段白名单和调用方式使用：

  ```js
  const BODY_CONDITIONS = ['thin', 'ideal', 'overweight']
  const { validateProfilePayload } = require('./profileValidation')

  function deriveActivityLevel(hours) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 6) return ''
    if (hours < 1) return 'low'
    if (hours < 2) return 'moderateLowImpact'
    if (hours < 3) return 'moderateHighImpact'
    return 'high'
  }

  function normalizedFields(doc) {
    const hasActivityHours = doc.dailyActivityHours !== ''
      && doc.dailyActivityHours !== null
      && doc.dailyActivityHours !== undefined
    const dailyActivityHours = hasActivityHours ? Number(doc.dailyActivityHours) : null
    return {
      birthDate: String(doc.birthDate || ''),
      breed: String(doc.breed || ''),
      weightKg: Number(doc.weightKg || 0),
      dailyMeals: Number(doc.dailyMeals || 0),
      dailyActivityHours,
      activityLevel: deriveActivityLevel(dailyActivityHours),
      bodyCondition: String(doc.bodyCondition || ''),
      neutered: Boolean(doc.neutered)
    }
  }

  function fieldsForWrite(payload) {
    const fields = normalizedFields(payload)
    validateProfilePayload({ ...payload, ...fields }, { BODY_CONDITIONS })
    return fields
  }
  ```

  `create/update` 必须先取得 `fieldsForWrite(event.payload)`，数据库写入只展开该结果及 `name/avatarUrl/dietGoal/healthNotes` 白名单，不能继续直接展开整个 `event.payload`。创建时可将缺失 `allergens`/`avoidIngredients` 初始化为空数组；更新时只有请求显式携带数组才写入，否则省略字段以保留数据库原值。

- [ ] **Step 6：运行档案测试。**

  Run: `node --test tests/dog-profile-derivations.test.js tests/dog-profile-service.test.js`

  Expected: PASS，且时长边界、品种估算不可用、旧 `ageStage`/`activityLevel` 兼容和隐藏数组保留均有确定断言。

### Task 6：按 Figma 实现完整与快速建档表单

**Files:**
- Modify: `subpackages/dog-profile/dog-edit/index.js`
- Modify: `subpackages/dog-profile/dog-edit/index.wxml`
- Modify: `subpackages/dog-profile/dog-edit/index.wxss`
- Modify: `subpackages/dog-profile/dog-quick-create/index.js`
- Modify: `subpackages/dog-profile/dog-quick-create/index.wxml`
- Modify: `subpackages/dog-profile/dog-quick-create/index.wxss`
- Create: `tests/dog-profile-ui.test.js`

**Interfaces:**
- Consumes: Task 1 C01/C02 Node ID、Task 4 `estimateLifeStage`、Task 5 品种目录、派生函数和保存接口。
- Produces: 不含年龄阶段、活动强度、预计成年体重输入及过敏/忌口控件的两个档案表单；幼犬时只读展示品种估算结果。

- [ ] **Step 1：编写档案 UI 静态失败测试。**

  测试读取两个 WXML/JS 文件，断言不再包含 `ageStageOptions`、`onAge`、“年龄阶段” picker、活动胶囊、预计成年体重 `<input>`、过敏源或忌口控件；必须包含 `mode="date"`、出生日期、品种 picker、`slider min="0" max="6" step="0.5"`、四段背景、实时活动反馈、体况和幼犬只读预计成年体重。

- [ ] **Step 2：运行 UI 测试并确认失败。**

  Run: `node --test tests/dog-profile-ui.test.js`

  Expected: FAIL，指出仍存在旧活动/成年体重输入控件，或缺少品种与 Slider。

- [ ] **Step 3：实现统一表单状态。**

  两个页面的 `data.form` 至少包含：

  ```js
  form: {
    name: '',
    birthDate: '',
    breed: '',
    weightKg: '',
    dailyMeals: 2,
    dailyActivityHours: 1.5,
    bodyCondition: 'ideal',
    neutered: false,
    avatarUrl: '',
    dietGoal: 'daily',
    allergens: [],
    avoidIngredients: []
  },
  lifeStageLabel: '',
  isPuppy: false,
  expectedAdultWeightKg: null,
  adultWeightEstimateReason: '',
  activityLevel: 'moderateLowImpact',
  activityLevelLabel: '一般活动',
  birthDateError: '',
  breedError: '',
  dailyActivityHoursError: ''
  ```

  `onBirthDate` 只更新生命周期显示；`onBreed` 调用 `estimateExpectedAdultWeight` 更新只读结果；`onActivityHours` 调用 `deriveActivityLevel` 实时更新时长和水平名称。预计成年体重不进入 `form`，无法被用户输入或随保存请求覆盖。

  ```js
  onBirthDate(event) {
    const birthDate = event.detail.value
    const stage = estimateLifeStage({ birthDate })
    const isPuppy = stage.available && stage.energyStage === 'puppy'
    this.setData({
      'form.birthDate': birthDate,
      lifeStageLabel: stage.label,
      isPuppy,
      birthDateError: stage.reason === 'future_birth_date' ? '出生日期不能晚于今天' : ''
    })
  },

  onBreed(event) {
    const breed = this.data.breedOptions[Number(event.detail.value)].value
    const estimate = estimateExpectedAdultWeight(breed)
    this.setData({
      'form.breed': breed,
      expectedAdultWeightKg: estimate.expectedAdultWeightKg,
      adultWeightEstimateReason: estimate.adultWeightEstimateReason,
      breedError: ''
    })
  },

  onActivityHours(event) {
    const dailyActivityHours = Number(event.detail.value)
    const activityLevel = deriveActivityLevel(dailyActivityHours)
    this.setData({
      'form.dailyActivityHours': dailyActivityHours,
      activityLevel,
      activityLevelLabel: activityLabel(activityLevel),
      dailyActivityHoursError: ''
    })
  },

  onBodyCondition(event) {
    this.setData({ 'form.bodyCondition': event.currentTarget.dataset.value })
  }
  ```

- [ ] **Step 4：按 C01/C02 替换表单布局。**

  使用 `ui-field` 包装原生日期 picker、品种 picker、体重、餐数、活动 Slider、体况和幼犬只读估算结果。体况可继续使用已有 `ui-tag`；活动不得使用 `ui-tag` 或按钮，必须是横向 Slider。出生日期下展示“系统估算：幼犬早期 / 幼犬晚期 / 成年犬 / 老年犬”。四段背景和只读估算核心结构使用：

  ```xml
  <ui-field label="日均活动时长" errorText="{{dailyActivityHoursError}}">
    <view class="dog-profile-activity-slider">
      <view class="dog-profile-activity-slider__bands" aria-hidden="true">
        <view class="dog-profile-activity-slider__band dog-profile-activity-slider__band--low" />
        <view class="dog-profile-activity-slider__band dog-profile-activity-slider__band--general" />
        <view class="dog-profile-activity-slider__band dog-profile-activity-slider__band--active" />
        <view class="dog-profile-activity-slider__band dog-profile-activity-slider__band--high" />
      </view>
      <slider min="0" max="6" step="0.5" value="{{form.dailyActivityHours}}" bindchanging="onActivityHours" bindchange="onActivityHours" />
    </view>
    <view>日均 {{form.dailyActivityHours}} 小时 · {{activityLevelLabel}}</view>
  </ui-field>

  <ui-field wx:if="{{isPuppy}}" label="预计成年体重">
    <view wx:if="{{expectedAdultWeightKg}}">系统估算 {{expectedAdultWeightKg}} kg</view>
    <view wx:else>当前品种暂无可靠估算</view>
  </ui-field>
  ```

  四段宽度按 0–1、1–2、2–3、3–6 小时分别占轨道 `1/6`、`1/6`、`1/6`、`3/6`，使用设计 token 对应的四级活动色。页面不得出现实现说明、尺寸备注或向用户解释控件技术细节的文字。

- [ ] **Step 5：实现字段级错误和保存。**

  保存前先清空旧错误，再根据 `dogService.validateDog` 的确定性错误映射到出生日期、品种或日均活动时长字段；其他错误继续使用 toast。快速建档必须收集同样的品种与 Slider 字段。编辑页从已存档案载入 `allergens`/`avoidIngredients` 到内部 `form`，但不渲染控件；保存 payload 直接保留数组，不能从不存在的文本输入重新生成空数组。

  ```js
  function profileErrors(message) {
    if (/出生日期/.test(message)) return { birthDateError: message, breedError: '', dailyActivityHoursError: '' }
    if (/品种/.test(message)) return { birthDateError: '', breedError: message, dailyActivityHoursError: '' }
    if (/活动时长/.test(message)) return { birthDateError: '', breedError: '', dailyActivityHoursError: message }
    return { birthDateError: '', breedError: '', dailyActivityHoursError: '' }
  }

  async onSave() {
    const payload = {
      ...this.data.form,
      weightKg: Number(this.data.form.weightKg),
      dailyMeals: Number(this.data.form.dailyMeals),
      dailyActivityHours: Number(this.data.form.dailyActivityHours)
    }
    try {
      dogService.validateDog(dogService.normalizeDog(payload))
      this.setData({ birthDateError: '', breedError: '', dailyActivityHoursError: '' })
      if (this.data.id) await dogService.updateDog(this.data.id, payload)
      else await dogService.createDog(payload)
      wx.navigateBack()
    } catch (error) {
      const fieldErrors = profileErrors(error.message)
      this.setData(fieldErrors)
      if (!fieldErrors.birthDateError && !fieldErrors.breedError && !fieldErrors.dailyActivityHoursError) {
        wx.showToast({ title: error.message, icon: 'none' })
      }
    }
  }
  ```

- [ ] **Step 6：运行档案 UI 和 UI 系统检查。**

  Run: `node --test tests/dog-profile-ui.test.js`

  Expected: PASS。

  Run: `npm run check:ui`

  Expected: PASS，不出现裸色值、直接第三方标签、泛名选择器、过小点击目标或隐藏字段被清空。

### Task 7：迁移年龄阶段消费者

**Files:**
- Modify: `pages/profile/index/index.js`
- Modify: `pages/profile/index/index.wxml`
- Modify: `components/dog-card/index.js`
- Modify: `components/dog-card/index.wxml`
- Modify: `utils/risk.js`
- Modify: `subpackages/custom-recipe/services/ingredientAdvice.js`
- Modify: `tests/risk-advice.test.js`
- Modify: `tests/storage-structure.test.js`

**Interfaces:**
- Consumes: Task 4 `decorateDog` 和 Task 5 已装饰的 dog 对象。
- Produces: 所有狗狗展示和阶段风险均以出生日期派生值为准；旧 `ageStage` 只保留为运行时兼容字段。

- [ ] **Step 1：把测试夹具改为已装饰档案并增加冲突用例。**

  风险与建议测试先调用 `decorateDog(rawDog, '2026-07-18')`，再把结果传给被测函数。加入 `birthDate` 推导成年但旧 `ageStage='senior'` 的冲突夹具，期望按成年犬处理。固定计算日期只存在于测试装饰步骤，避免测试随真实日期漂移。

- [ ] **Step 2：运行相关测试并确认失败。**

  Run: `node --test tests/risk-advice.test.js tests/storage-structure.test.js`

  Expected: FAIL，旧实现仍直接读取夹具中的 `ageStage` 或卡片仍依赖 `ageStageLabels`。

- [ ] **Step 3：更新档案卡和“我的”页面。**

  移除页面与组件对 `ageStageLabels` 的直接依赖，展示 `item.lifeStageLabel` / `dog.lifeStageLabel`。缺少出生日期的旧档案显示“档案待完善”，不能显示默认成年犬。

  ```xml
  <view class="dog-meta">
    {{item.lifeStageLabel || '档案待完善'}}｜{{item.weightKg}}kg｜每日 {{item.dailyMeals}} 餐｜{{dietGoalLabels[item.dietGoal] || '日常'}}饮食
  </view>
  ```

- [ ] **Step 4：更新风险与食材建议。**

  `utils/risk.js` 和 `ingredientAdvice.js` 只消费 `dogService` 返回的运行时 `dog.ageStage` 与 `dog.lifeStage`，不再自行计算日期，保证同一次会话只有一套阶段结果。兼容食谱的 `suitableAgeStages` 枚举不变；幼犬和老年犬谨慎提示文案继续保留。直接调用这些纯函数的测试必须传入 Task 4 已装饰对象。

  ```js
  function derivedAgeStage(dog) {
    return dog && dog.lifeStage && dog.lifeStage.legacyAgeStage || dog && dog.ageStage || ''
  }

  function derivedAgeStageLabel(dog) {
    return dog && dog.lifeStageLabel || ageStageLabels[derivedAgeStage(dog)] || '阶段待完善'
  }
  ```

  `checkRisk` 和 `buildAdviceForDog` 内部只使用以上结果，不重新解析 `birthDate`。

- [ ] **Step 5：运行消费者回归测试。**

  Run: `node --test tests/risk-advice.test.js tests/storage-structure.test.js`

  Expected: PASS，冲突 `ageStage` 不影响出生日期推导结果。

### Task 8：实现能量需求服务

**Files:**
- Create: `subpackages/custom-recipe/services/energyRequirementService.js`
- Create: `tests/energy-requirement-service.test.js`
- Modify: `project.config.json`
- Modify: `tests/miniapp-runtime.test.js`

**Interfaces:**
- Consumes: `{ dog, lifeStage }`，其中 `lifeStage` 来自 Task 4，`dog.expectedAdultWeightKg` 和 `dog.activityLevel` 是 Task 5 的运行时派生结果。
- Produces: `calculateEnergyRequirement({ dog, lifeStage })`，返回 `available`、`reason`、`dailyTarget`、`mealTarget`、`factorRange`、`provisional`、`basisCode`。

- [ ] **Step 1：编写公式和范围失败测试。**

  ```js
  const test = require('node:test')
  const assert = require('node:assert/strict')
  const service = require('../subpackages/custom-recipe/services/energyRequirementService')

  test('幼犬按品种估算的成年体重计算每日和本餐目标', () => {
    const result = service.calculateEnergyRequirement({
      dog: { weightKg: 8, expectedAdultWeightKg: 10.5, dailyMeals: 2 },
      lifeStage: { available: true, energyStage: 'puppy' }
    })
    const expectedDaily = (254.1 - 135 * (8 / 10.5)) * Math.pow(8, 0.75)
    assert.equal(result.available, true)
    assert.ok(Math.abs(result.dailyTarget.min - expectedDaily) < 0.01)
    assert.ok(Math.abs(result.mealTarget.min - expectedDaily / 2) < 0.01)
  })

  test('成年和老年犬使用日均时长派生活动水平', () => {
    const adult = service.calculateEnergyRequirement({
      dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 1.5 },
      lifeStage: { available: true, energyStage: 'adult' }
    })
    const senior = service.calculateEnergyRequirement({
      dog: { weightKg: 10, dailyMeals: 2, dailyActivityHours: 3.5 },
      lifeStage: { available: true, energyStage: 'senior' }
    })
    assert.deepEqual(adult.factorRange, { min: 110, max: 110 })
    assert.deepEqual(senior.factorRange, { min: 150, max: 175 })
  })
  ```

- [ ] **Step 2：运行测试并确认失败。**

  Run: `node --test tests/energy-requirement-service.test.js`

  Expected: FAIL，错误包含缺少 `energyRequirementService`。

- [ ] **Step 3：实现需求计算。**

  固定系数：`low=95`、`moderateLowImpact=110`、`moderateHighImpact=125`、`high=150–175`。四档仅由 `dailyActivityHours` 的 `<1`、`1–<2`、`2–<3`、`3–6` 阈值派生；这是产品对 FEDIAF 系数的时长映射，服务不接收用户选择的强度。幼犬使用设计说明公式；品种估算不可用时返回 `breed_estimate_unavailable`。旧档案没有时长时才兼容现有 `activityLevel`；两者都缺失时成年犬临时 110、老年犬临时 95，并设置 `provisional=true`。所有目标保存未格式化数值，界面格式化不进入服务。

  ```js
  const ACTIVITY_FACTORS = {
    low: { min: 95, max: 95 },
    moderateLowImpact: { min: 110, max: 110 },
    moderateHighImpact: { min: 125, max: 125 },
    high: { min: 150, max: 175 }
  }

  const { deriveActivityLevel } = require('../../../services/dogProfileDerivations')

  function unavailable(reason) {
    return {
      available: false,
      reason,
      dailyTarget: null,
      mealTarget: null,
      factorRange: null,
      provisional: false,
      basisCode: ''
    }
  }

  function targetsFromFactor(weightKg, dailyMeals, factorRange, provisional, basisCode) {
    const metabolicWeight = Math.pow(weightKg, 0.75)
    const dailyTarget = {
      min: factorRange.min * metabolicWeight,
      max: factorRange.max * metabolicWeight
    }
    return {
      available: true,
      reason: '',
      dailyTarget,
      mealTarget: {
        min: dailyTarget.min / dailyMeals,
        max: dailyTarget.max / dailyMeals
      },
      factorRange,
      provisional,
      basisCode
    }
  }

  function calculateEnergyRequirement({ dog = {}, lifeStage = {} }) {
    const weightKg = Number(dog.weightKg)
    const dailyMeals = Number(dog.dailyMeals)
    if (!lifeStage.available) return unavailable(lifeStage.reason || 'life_stage_unavailable')
    if (!(weightKg > 0)) return unavailable('invalid_weight')
    if (!(dailyMeals > 0)) return unavailable('invalid_daily_meals')
    if (lifeStage.energyStage === 'puppy') {
      const expectedAdultWeightKg = Number(dog.expectedAdultWeightKg)
      if (!(expectedAdultWeightKg > 0)) return unavailable(dog.adultWeightEstimateReason || 'breed_estimate_unavailable')
      if (expectedAdultWeightKg < weightKg) return unavailable('breed_estimate_inconsistent')
      const factor = 254.1 - 135 * (weightKg / expectedAdultWeightKg)
      return targetsFromFactor(weightKg, dailyMeals, { min: factor, max: factor }, false, 'fediaf_growth')
    }
    const derivedLevel = deriveActivityLevel(dog.dailyActivityHours)
    const compatibleLevel = derivedLevel || dog.activityLevel
    const configured = ACTIVITY_FACTORS[compatibleLevel]
    const fallback = lifeStage.energyStage === 'senior'
      ? { min: 95, max: 95 }
      : { min: 110, max: 110 }
    return targetsFromFactor(
      weightKg,
      dailyMeals,
      configured || fallback,
      !configured,
      configured ? (derivedLevel ? 'fediaf_activity_duration' : 'fediaf_activity_legacy') : 'fediaf_age_default'
    )
  }

  module.exports = {
    ACTIVITY_FACTORS,
    calculateEnergyRequirement
  }
  ```

- [ ] **Step 4：补充无效输入测试。**

  覆盖体重或餐数无效、幼犬品种估算不可用、品种估算值与当前体重不一致、生命周期不可用、Slider 的 0/0.5/1/1.5/2/2.5/3/6 小时、时长与旧 `activityLevel` 冲突、旧档案仅有兼容值。品种估算异常只降级能量，不生成用户输入字段；时长存在时必须覆盖冲突兼容值；不可用返回稳定 `reason`，不得产生 `NaN`。

- [ ] **Step 5：加入分包清单并运行测试。**

  将新服务加入 `project.config.json > packOptions.include`，并在 `tests/miniapp-runtime.test.js` 的必需服务数组加入路径。

  Run: `node --test tests/energy-requirement-service.test.js tests/miniapp-runtime.test.js`

  Expected: PASS。

### Task 9：实现本餐能量供给与缩放建议

**Files:**
- Create: `subpackages/custom-recipe/services/mealEnergyService.js`
- Create: `tests/meal-energy-service.test.js`
- Modify: `project.config.json`
- Modify: `tests/miniapp-runtime.test.js`

**Interfaces:**
- Consumes: `{ ingredients, nutrientRecords }` 和 `{ ingredients, currentKcal, mealTarget }`。
- Produces: `calculateMealEnergy(input)`、`evaluateEnergyStatus(input)`、`buildScaleSuggestion(input)`。

- [ ] **Step 1：编写能量来源和缺失失败测试。**

  测试固定使用 USDA nutrient ID：能量 `1008/KCAL`、蛋白质 `1003/G`、脂肪 `1004/G`、碳水 `1005/G`。覆盖直接能量、`4/9/4` 回退、部分食材完全缺失和已知能量下限。

  ```js
  test('优先汇总每 100g 能量记录', () => {
    const result = service.calculateMealEnergy({
      ingredients: [{ ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 150 }],
      nutrientRecords: [{ food_id: 'food_a', nutrient_id: 1008, unit_name: 'KCAL', amount: 120 }]
    })
    assert.equal(result.available, true)
    assert.equal(result.totalKcal, 180)
    assert.equal(result.ingredientEnergies[0].source, 'direct')
  })
  ```

- [ ] **Step 2：运行测试并确认失败。**

  Run: `node --test tests/meal-energy-service.test.js`

  Expected: FAIL，错误包含缺少 `mealEnergyService`。

- [ ] **Step 3：实现食材能量汇总。**

  每种食材先查 `1008/KCAL`；缺失时只有在 `1003/G`、`1004/G`、`1005/G` 都有效时才计算 `4 × protein + 9 × fat + 4 × carbohydrate`。任一有效食材两种来源都不可用时返回：

  ```js
  {
    available: false,
    totalKcal: null,
    knownKcal: 180,
    missingIngredients: [{ id: 'food_b', name: '南瓜', reason: '缺少能量和完整宏量营养数据' }]
  }
  ```

  核心实现按食材建立记录索引，不允许用另一种食材的数据补齐：

  ```js
  const ENERGY_ID = 1008
  const PROTEIN_ID = 1003
  const FAT_ID = 1004
  const CARBOHYDRATE_ID = 1005

  function amountGramOf(ingredient) {
    const value = Number(ingredient && ingredient.perMealAmountGram)
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  function recordsByFood(nutrientRecords) {
    return (nutrientRecords || []).reduce((result, record) => {
      const foodId = String(record.food_id || '')
      const nutrientId = Number(record.nutrient_id)
      const amount = Number(record.amount)
      if (!foodId || !Number.isFinite(amount)) return result
      if (!result[foodId]) result[foodId] = {}
      result[foodId][nutrientId] = { amount, unit: String(record.unit_name || '').toUpperCase() }
      return result
    }, {})
  }

  function energyPer100g(foodRecords) {
    const direct = foodRecords && foodRecords[ENERGY_ID]
    if (direct && direct.unit === 'KCAL') return { value: direct.amount, source: 'direct' }
    const protein = foodRecords && foodRecords[PROTEIN_ID]
    const fat = foodRecords && foodRecords[FAT_ID]
    const carbohydrate = foodRecords && foodRecords[CARBOHYDRATE_ID]
    if (![protein, fat, carbohydrate].every((item) => item && item.unit === 'G')) return null
    return {
      value: 4 * protein.amount + 9 * fat.amount + 4 * carbohydrate.amount,
      source: 'macro_estimate'
    }
  }

  function calculateMealEnergy({ ingredients = [], nutrientRecords = [] }) {
    const index = recordsByFood(nutrientRecords)
    let knownKcal = 0
    const ingredientEnergies = []
    const missingIngredients = []
    ingredients.filter((item) => amountGramOf(item) > 0).forEach((ingredient) => {
      const id = String(ingredient.ingredientId || ingredient.id || '')
      const per100g = energyPer100g(index[id])
      if (!per100g) {
        missingIngredients.push({ id, name: ingredient.name, reason: '缺少能量和完整宏量营养数据' })
        return
      }
      const kcal = per100g.value * amountGramOf(ingredient) / 100
      knownKcal += kcal
      ingredientEnergies.push({ id, name: ingredient.name, kcal, source: per100g.source })
    })
    return {
      available: missingIngredients.length === 0 && ingredientEnergies.length > 0,
      totalKcal: missingIngredients.length ? null : knownKcal,
      knownKcal,
      ingredientEnergies,
      missingIngredients
    }
  }
  ```

- [ ] **Step 4：实现状态与等比例调整。**

  固定目标 `min===max` 时使用 90%–110%；范围目标直接比较 `min/max`。`buildScaleSuggestion` 按目标下界生成默认预览，并同时返回目标范围：

  ```js
  {
    available: true,
    scale: 1.0833,
    currentTotalGram: 240,
    suggestedTotalGram: 260,
    suggestedIngredients: [
      { ingredientId: 'food_a', name: '鸡胸肉', perMealAmountGram: 162.5 },
      { ingredientId: 'food_b', name: '南瓜', perMealAmountGram: 97.5 }
    ]
  }
  ```

  单项克重保留 1 位小数，最后一项吸收舍入差，保证各项之和等于建议总重。

  ```js
  function evaluateEnergyStatus({ currentKcal, mealTarget }) {
    if (!Number.isFinite(currentKcal) || !mealTarget) return 'unavailable'
    const isRange = mealTarget.min !== mealTarget.max
    const lower = isRange ? mealTarget.min : mealTarget.min * 0.9
    const upper = isRange ? mealTarget.max : mealTarget.max * 1.1
    if (currentKcal < lower) return 'below_target'
    if (currentKcal > upper) return 'above_target'
    return 'near_target'
  }

  function roundOne(value) {
    return Math.round(value * 10) / 10
  }

  function buildScaleSuggestion({ ingredients = [], currentKcal, mealTarget }) {
    if (!(currentKcal > 0) || !mealTarget || !(mealTarget.min > 0)) return { available: false }
    const scale = mealTarget.min / currentKcal
    const active = ingredients.filter((item) => amountGramOf(item) > 0)
    const currentTotalGram = active.reduce((sum, item) => sum + amountGramOf(item), 0)
    const suggestedTotalGram = roundOne(currentTotalGram * scale)
    let assigned = 0
    const suggestedIngredients = active.map((item, index) => {
      const amount = index === active.length - 1
        ? roundOne(suggestedTotalGram - assigned)
        : roundOne(amountGramOf(item) * scale)
      assigned = roundOne(assigned + amount)
      return { ...item, perMealAmountGram: amount }
    })
    return { available: true, scale, currentTotalGram, suggestedTotalGram, suggestedIngredients }
  }
  ```

- [ ] **Step 5：验证比例不变和状态边界。**

  增加 89.99%、90%、110%、110.01%、高活动范围内外，以及缩放前后每项占比误差小于 `0.001` 的测试。

- [ ] **Step 6：加入分包清单并运行测试。**

  Run: `node --test tests/meal-energy-service.test.js tests/miniapp-runtime.test.js`

  Expected: PASS。

### Task 10：让营养密度选择使用派生阶段

**Files:**
- Modify: `subpackages/custom-recipe/services/nutritionAssessmentService.js`
- Modify: `tests/nutrition-assessment-service.test.js`
- Modify: `tests/nutrition-assessment-missing-nutrient.test.js`

**Interfaces:**
- Consumes: `buildAssessment({ ..., lifeStage })`，`lifeStage.nutritionStage` 取值 `early_growth | late_growth | adult`。
- Produces: 现有营养密度结果结构不变；自动 profile 选择不再读取持久化 `dog.ageStage`。

- [ ] **Step 1：增加早期、晚期、成年和老年 profile 失败测试。**

  构造包含 FEDIAF `early_growth_reproduction`、`late_growth`、`adult_mer_95`、`adult_mer_110` 的标准。断言早期和晚期分别命中对应 profile；成年/老年低活动命中 95，其他活动命中 110；GB 的两类幼犬都命中生长繁殖 profile。

- [ ] **Step 2：运行营养密度测试并确认失败。**

  Run: `node --test tests/nutrition-assessment-service.test.js tests/nutrition-assessment-missing-nutrient.test.js`

  Expected: FAIL，早期幼犬仍被旧逻辑选择为晚期或测试接口不接受 `lifeStage`。

- [ ] **Step 3：替换自动 profile 逻辑。**

  将自动选择签名改为：

  ```js
  function firstProfileCode(profiles, pattern) {
    const profile = profiles.find((item) => pattern.test(String(item.profile_code || '')))
    return profile && profile.profile_code
  }

  function autoProfileCode(key, dog, lifeStage, profiles) {
    const nutritionStage = lifeStage && lifeStage.nutritionStage
    if (key === 'gb') {
      if (nutritionStage === 'early_growth' || nutritionStage === 'late_growth') {
        return firstProfileCode(profiles, /growth_gestation_lactation/)
      }
      return firstProfileCode(profiles, /(^|_)adult$/) || profiles[0] && profiles[0].profile_code
    }
    if (nutritionStage === 'early_growth') return firstProfileCode(profiles, /early_growth/)
    if (nutritionStage === 'late_growth') return firstProfileCode(profiles, /late_growth/)
    const useLowEnergyProfile = dog.activityLevel === 'low'
      || (!dog.activityLevel && lifeStage && lifeStage.energyStage === 'senior')
    return firstProfileCode(profiles, useLowEnergyProfile ? /adult_mer_95/ : /adult_mer_110/)
  }
  ```

  GB：`early_growth` 和 `late_growth` 选择 `growth_gestation_lactation`，`adult` 选择 `adult`。FEDIAF：早期选择 `/early_growth/`，晚期选择 `/late_growth/`；成年营养阶段下，低活动或缺少活动且 `energyStage==='senior'` 选择 `/adult_mer_95/`，其他已确认活动及缺少活动的成年犬选择 `/adult_mer_110/`。手动 override 优先级保持不变。

- [ ] **Step 4：更新上下文文案和标准缺失降级。**

  `contextText` 使用 `lifeStage.label`；`standards` 为空或缺少可用 profile 时返回营养密度 `available=false`，原因是“营养标准数据不完整”，不能生成空元素但标记“基本合适”。

  ```js
  if (!lifeStage || !lifeStage.available) {
    return unavailableAssessment({
      dog,
      ingredients: validIngredients,
      missingIngredients: [],
      message: lifeStage && lifeStage.reason === 'under_minimum_age'
        ? '小于 8 周暂不自动进行营养密度评估'
        : '请完善出生日期后开始营养密度评估',
      selectedStandards: []
    })
  }
  if (standards.length < 2 || selectedStandards.length < 2) {
    return unavailableAssessment({
      dog,
      ingredients: validIngredients,
      missingIngredients: [],
      message: '营养标准数据不完整',
      selectedStandards
    })
  }
  ```

- [ ] **Step 5：运行营养密度回归测试。**

  Run: `node --test tests/nutrition-assessment-service.test.js tests/nutrition-assessment-missing-nutrient.test.js`

  Expected: PASS，现有干物质、缺失值、贡献来源、手动 profile 和营养素 ID 映射断言继续通过。

### Task 11：组合可独立降级的本餐评估

**Files:**
- Create: `subpackages/custom-recipe/services/mealAssessmentService.js`
- Create: `tests/meal-assessment-service.test.js`
- Modify: `subpackages/custom-recipe/services/nutritionDataService.js`
- Modify: `project.config.json`
- Modify: `tests/miniapp-runtime.test.js`

**Interfaces:**
- Consumes: Task 4、8、9、10 的稳定接口，以及 `{ standards, nutrientRecords, dataErrors }`。
- Produces: `buildMealAssessment(input)`，返回 `{ lifeStage, energy, nutritionDensity, contextText, basisText }`；`loadMealAssessmentData(ingredients)` 返回部分成功的数据与错误。

- [ ] **Step 1：编写双轴组合失败测试。**

  覆盖八种组合：两侧成功、能量偏少且密度合适、能量合适且密度需调整、能量缺失但密度成功、水分缺失导致密度失败但能量成功、标准加载失败但能量成功、幼犬品种估算不可用但密度成功、小于 8 周时两侧均不可用。成年/老年夹具必须以 `dailyActivityHours` 派生活动水平；断言没有 `overallStatus` 字段。

- [ ] **Step 2：运行组合测试并确认失败。**

  Run: `node --test tests/meal-assessment-service.test.js`

  Expected: FAIL，错误包含缺少 `mealAssessmentService`。

- [ ] **Step 3：实现组合服务。**

  固定返回骨架：

  ```js
  {
    lifeStage,
    energy: {
      available,
      status,
      statusLabel,
      currentKcal,
      knownKcal,
      mealTarget,
      dailyTarget,
      provisional,
      missingIngredients,
      scaleSuggestion
    },
    nutritionDensity,
    contextText,
    basisText
  }
  ```

  `statusLabel` 仅允许“能量低于估算目标 / 能量接近估算目标 / 能量高于估算目标 / 暂无法判断本餐份量”。营养密度结果沿用自己的状态，不生成总分或合并状态。

  `dog.bodyCondition` 为 `thin` 或 `overweight` 时返回生活化 `bodyConditionNote`，提示结合体重变化和专业建议校正；该字段不得改变能量系数。`lifeStage.reason==='under_minimum_age'` 时跳过能量和营养密度计算，两侧均返回不可用。幼犬 `adultWeightEstimateReason==='breed_estimate_unavailable'` 时只把能量轴降级为不可用，不能阻断营养密度或档案保存。

  ```js
  const { estimateLifeStage } = require('../../../services/lifeStageEstimator')
  const energyRequirementService = require('./energyRequirementService')
  const mealEnergyService = require('./mealEnergyService')
  const nutritionAssessmentService = require('./nutritionAssessmentService')

  const ENERGY_STATUS_LABELS = {
    below_target: '能量低于估算目标',
    near_target: '能量接近估算目标',
    above_target: '能量高于估算目标',
    unavailable: '暂无法判断本餐份量'
  }

  function bodyConditionNote(value) {
    if (value === 'thin') return '当前体况偏瘦，请结合体重变化和专业建议校正份量'
    if (value === 'overweight') return '当前体况偏胖，请结合体重变化和专业建议校正份量'
    return ''
  }

  function buildMealAssessment({
    ingredients = [],
    dog = {},
    standards = [],
    nutrientRecords = [],
    profileOverrides = {},
    dataErrors = {},
    today
  }) {
    const lifeStage = estimateLifeStage({ birthDate: dog.birthDate, today })
    if (lifeStage.reason === 'under_minimum_age') {
      const nutritionDensity = nutritionAssessmentService.buildAssessment({
        ingredients,
        dog,
        lifeStage,
        standards,
        nutrientRecords,
        profileOverrides
      })
      return {
        lifeStage,
        energy: {
          available: false,
          status: 'unavailable',
          statusLabel: ENERGY_STATUS_LABELS.unavailable,
          currentKcal: null,
          knownKcal: 0,
          mealTarget: null,
          dailyTarget: null,
          provisional: false,
          missingIngredients: [],
          scaleSuggestion: { available: false },
          bodyConditionNote: ''
        },
        nutritionDensity,
        contextText: `${dog.name || '未选择狗狗'} · ${lifeStage.label}`,
        basisText: '小于 8 周暂不自动评估，请咨询兽医或宠物营养专业人士'
      }
    }
    const requirement = energyRequirementService.calculateEnergyRequirement({ dog, lifeStage })
    const supply = dataErrors.nutrients
      ? {
        available: false,
        totalKcal: null,
        knownKcal: 0,
        missingIngredients: ingredients.map((item) => ({
          id: item.ingredientId || item.id || item.name,
          name: item.name,
          reason: '营养数据加载失败'
        }))
      }
      : mealEnergyService.calculateMealEnergy({ ingredients, nutrientRecords })
    const status = requirement.available && supply.available
      ? mealEnergyService.evaluateEnergyStatus({ currentKcal: supply.totalKcal, mealTarget: requirement.mealTarget })
      : 'unavailable'
    const canScale = status === 'below_target' || status === 'above_target'
    const scaleSuggestion = canScale
      ? mealEnergyService.buildScaleSuggestion({ ingredients, currentKcal: supply.totalKcal, mealTarget: requirement.mealTarget })
      : { available: false }
    const nutritionDensity = nutritionAssessmentService.buildAssessment({
      ingredients,
      dog,
      lifeStage,
      standards: dataErrors.standards ? [] : standards,
      nutrientRecords: dataErrors.nutrients ? [] : nutrientRecords,
      profileOverrides
    })
    return {
      lifeStage,
      energy: {
        available: requirement.available && supply.available,
        status,
        statusLabel: ENERGY_STATUS_LABELS[status],
        currentKcal: supply.totalKcal,
        knownKcal: supply.knownKcal,
        mealTarget: requirement.mealTarget,
        dailyTarget: requirement.dailyTarget,
        provisional: requirement.provisional,
        missingIngredients: supply.missingIngredients || [],
        scaleSuggestion,
        bodyConditionNote: bodyConditionNote(dog.bodyCondition)
      },
      nutritionDensity,
      contextText: `${dog.name || '未选择狗狗'} · ${lifeStage.label} · 日均 ${Number(dog.dailyActivityHours || 0)} 小时 · 每日 ${Number(dog.dailyMeals || 0)} 餐`,
      basisText: '本餐按每日餐数等额分配；不包含零食及其他额外喂食'
    }
  }

  module.exports = { buildMealAssessment }
  ```

- [ ] **Step 4：让数据加载支持部分成功。**

  在 `nutritionDataService.js` 新增 `loadMealAssessmentData(ingredients)`，标准与食材营养查询使用 `Promise.allSettled`，返回：

  ```js
  {
    standards: [],
    nutrientRecords: [],
    dataErrors: {
      standards: null,
      nutrients: null
    }
  }
  ```

  标准失败时保留 `nutrientRecords`；营养记录失败时保留标准。旧 `loadNutritionData` 可委托给新接口，但现有调用在 Task 12 全部迁移后不得继续把标准失败升级为整个页面失败。

  ```js
  async function loadMealAssessmentData(ingredients = []) {
    if (!canUseCloudDatabase()) throw new Error('当前无法读取营养数据库')
    const foodIds = [...new Set(ingredients.map((item) => String(item.ingredientId || item.id || '')).filter(Boolean))]
    const database = wx.cloud.database()
    const [standardsResult, nutrientsResult] = await Promise.allSettled([
      loadStandards(database),
      loadFoodNutrients(database, foodIds)
    ])
    return {
      standards: standardsResult.status === 'fulfilled' ? standardsResult.value : [],
      nutrientRecords: nutrientsResult.status === 'fulfilled' ? nutrientsResult.value : [],
      dataErrors: {
        standards: standardsResult.status === 'rejected' ? standardsResult.reason : null,
        nutrients: nutrientsResult.status === 'rejected' ? nutrientsResult.reason : null
      }
    }
  }
  ```

- [ ] **Step 5：加入分包清单并运行组合测试。**

  Run: `node --test tests/meal-assessment-service.test.js tests/miniapp-runtime.test.js`

  Expected: PASS，双轴部分可用组合全部通过。

### Task 12：按已确认 Figma 落地双轴界面和份量调整

**Files:**
- Modify: `components/nutrition-assessment/index.js`
- Modify: `components/nutrition-assessment/index.wxml`
- Modify: `components/nutrition-assessment/index.wxss`
- Modify: `subpackages/custom-recipe/edit/index.js`
- Modify: `subpackages/custom-recipe/edit/index.wxml`
- Modify: `tests/miniapp-runtime.test.js`
- Create: `tests/meal-assessment-ui.test.js`

**Interfaces:**
- Consumes: Task 2 C03–C09 Node ID、Task 11 `buildMealAssessment`、Task 9 `scaleSuggestion`。
- Produces: 组件事件 `scaleconfirm`；编辑页应用建议克重、保存草稿并重新评估。

- [ ] **Step 1：编写双轴模板失败测试。**

  静态测试断言组件标题为“本餐评估”，收起态包含独立 `energy` 和 `nutritionDensity` 区块，展开态先显示“份量与能量”，存在“不包含零食及其他额外喂食”，存在“按目标调整整餐份量”，且不再使用单一 `viewAssessment.statusLabel` 作为总体结论。

- [ ] **Step 2：运行 UI 测试并确认失败。**

  Run: `node --test tests/meal-assessment-ui.test.js`

  Expected: FAIL，旧模板仍显示“营养评估”和单一评估结论。

- [ ] **Step 3：迁移编辑页评估状态。**

  `subpackages/custom-recipe/edit/index.js` 将 `nutritionAssessment` 改为 `mealAssessment`，将数据加载切换为 `loadMealAssessmentData`，再调用 `mealAssessmentService.buildMealAssessment`。缓存签名仍只由食材 ID 集合决定；克重变化不重复请求，但必须立即重算需求、供给和密度。

  页面需要保留请求序号防止旧请求覆盖新食谱，并用 `try/finally` 保证失败时结束加载态。重试操作必须先清除 `mealAssessmentDataCache` 和 `mealAssessmentDataSignature`；页面从档案编辑返回时，在 `onShow` 重新读取目标狗狗档案并刷新评估，确保补齐出生日期、选择有可靠估算的品种或更新 Slider 后 C09 自动刷新。

  ```js
  const mealAssessmentService = require('../services/mealAssessmentService')

  async refreshMealAssessment() {
    const { ingredients, targetDog: dog } = this.data
    if (!ingredients.length || !dog) {
      this.setData({ mealAssessment: null, nutritionLoading: false })
      return
    }
    const requestId = (this.mealAssessmentRequestId || 0) + 1
    this.mealAssessmentRequestId = requestId
    this.setData({ nutritionLoading: true })
    try {
      const signature = ingredients.map((item) => item.ingredientId || item.id || '').sort().join('|')
      let assessmentData = this.mealAssessmentDataCache
      if (!assessmentData || this.mealAssessmentDataSignature !== signature) {
        assessmentData = await nutritionDataService.loadMealAssessmentData(ingredients)
        if (requestId !== this.mealAssessmentRequestId) return
        this.mealAssessmentDataCache = assessmentData
        this.mealAssessmentDataSignature = signature
      }
      if (requestId !== this.mealAssessmentRequestId) return
      const mealAssessment = mealAssessmentService.buildMealAssessment({
        ingredients,
        dog,
        profileOverrides: this.data.nutritionStandardProfiles,
        ...assessmentData
      })
      this.setData({ mealAssessment })
    } catch (error) {
      if (requestId !== this.mealAssessmentRequestId) return
      const mealAssessment = mealAssessmentService.buildMealAssessment({
        ingredients,
        dog,
        standards: [],
        nutrientRecords: [],
        profileOverrides: this.data.nutritionStandardProfiles,
        dataErrors: { standards: error, nutrients: error }
      })
      this.setData({ mealAssessment })
    } finally {
      if (requestId === this.mealAssessmentRequestId) this.setData({ nutritionLoading: false })
    }
  }
  ```

- [ ] **Step 4：实现 C03 收起态和 C04/C05 展开态。**

  组件继续保留路径 `components/nutrition-assessment` 以降低迁移范围，但可见标题统一为“本餐评估”。收起态固定两组状态；展开态先渲染能量，再渲染原国标/FEDIAF 密度内容。能量不可用不得隐藏可用密度，密度不可用不得隐藏可用能量。

  收起态核心模板使用：

  ```xml
  <view class="nutrition-assessment__summary-heading">本餐评估</view>
  <block wx:if="{{viewAssessment}}">
    <view class="nutrition-assessment__axis">
      <view class="nutrition-assessment__axis-status nutrition-assessment__axis-status--{{viewAssessment.energy.status}}">
        {{viewAssessment.energy.statusLabel}}
      </view>
      <view class="nutrition-assessment__axis-description">{{viewAssessment.energy.summaryText}}</view>
    </view>
    <view class="nutrition-assessment__axis">
      <view class="nutrition-assessment__axis-status nutrition-assessment__axis-status--{{viewAssessment.nutritionDensity.status}}">
        营养密度{{viewAssessment.nutritionDensity.statusLabel}}
      </view>
      <view class="nutrition-assessment__axis-description">{{viewAssessment.nutritionDensity.primaryAdvice}}</view>
    </view>
  </block>
  ```

  `index.js` 只负责把数值格式化为 `summaryText` 和目标范围文本，不重新计算能量状态。

- [ ] **Step 5：实现 C06 调整预览。**

  组件点击“按目标调整整餐份量”时打开内部预览弹层，读取 `energy.scaleSuggestion`。确认时触发：

  ```js
  this.triggerEvent('scaleconfirm', {
    ingredients: this.data.viewAssessment.energy.scaleSuggestion.suggestedIngredients
  })
  ```

  编辑页 `onMealScaleConfirm` 使用 `applyIngredients(event.detail.ingredients)`，持久化草稿并重新计算；取消不修改任何克重。

- [ ] **Step 6：实现 C07–C09 降级状态和档案入口。**

  能量缺失列出 `missingIngredients` 和 `knownKcal`；水分或标准缺失沿用密度缺失区；档案缺少出生日期时提供完善入口。幼犬选择“混血/不确定”或品种目录无可靠预计成年体重时，显示“当前品种暂无可靠成年体重估算，暂无法判断本餐份量”，继续展示营养密度，并可跳转 `subpackages/dog-profile/dog-edit/index?id=<dogId>` 更改品种；不得显示预计成年体重输入。所有跳转前先保存当前食谱草稿。

  ```js
  onCompleteDogProfile() {
    const dog = this.data.targetDog
    if (!dog || !dog.id) return
    this.persistDraft()
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(dog.id)}` })
  }

  onMealScaleConfirm(event) {
    const ingredients = event.detail && event.detail.ingredients
    if (!Array.isArray(ingredients) || !ingredients.length) return
    this.applyIngredients(ingredients)
    this.persistDraft()
    this.refreshMealAssessment()
  }

  onNutritionRetry() {
    this.mealAssessmentDataCache = null
    this.mealAssessmentDataSignature = ''
    this.refreshMealAssessment()
  }
  ```

  ```xml
  <view wx:if="{{!viewAssessment.energy.available}}" class="nutrition-assessment__missing">
    <view class="nutrition-assessment__missing-heading">暂无法判断本餐份量</view>
    <view wx:if="{{viewAssessment.energy.knownKcalText}}">已知食材至少提供 {{viewAssessment.energy.knownKcalText}}</view>
    <view wx:for="{{viewAssessment.energy.missingIngredients}}" wx:key="id" class="nutrition-assessment__missing-item">
      {{item.name}}：{{item.reason}}
    </view>
  </view>
  ```

- [ ] **Step 7：保持既有营养交互。**

  Profile 切换、偏低营养食材入口、偏高来源调整、全部元素筛选和重试事件继续工作。`nutritionStandardProfiles` 仍只作用于当前食谱；出生日期推导的自动推荐不能覆盖当前食谱里的手动 override。

  ```xml
  <nutrition-assessment
    assessment="{{mealAssessment}}"
    loading="{{nutritionLoading}}"
    expanded="{{nutritionExpanded}}"
    bind:toggle="onNutritionToggle"
    bind:profilechange="onNutritionProfileChange"
    bind:nutrientselect="onNutritionNutrientSelect"
    bind:adjustingredients="onNutritionAdjustIngredients"
    bind:scaleconfirm="onMealScaleConfirm"
    bind:retry="onNutritionRetry"
  />
  ```

- [ ] **Step 8：运行 UI、服务和全量测试。**

  Run: `node --test tests/meal-assessment-ui.test.js tests/meal-assessment-service.test.js tests/nutrition-assessment-service.test.js tests/nutrition-assessment-missing-nutrient.test.js tests/miniapp-runtime.test.js`

  Expected: PASS。

  Run: `npm run check:ui`

  Expected: PASS。

### Task 13：完成全链路验证和文档交接

**Files:**
- Modify: `docs/ui/figma-implementation-notes.md`
- Modify: `docs/work-logs/2026-07-19.md`
- Verify: `docs/superpowers/specs/2026-07-18-dog-energy-assessment-design.md`

**Interfaces:**
- Consumes: Gate A 通过的 Figma、Task 4–12 实现和测试。
- Produces: 可复核的实现交接、验证记录和剩余风险；不产生 Git 提交。

- [ ] **Step 1：运行全量自动检查。**

  Run: `npm test`

  Expected: 所有测试通过，无失败、跳过或未处理异常。

  Run: `npm run check:ui`

  Expected: PASS。

  Run: `git diff --check`

  Expected: 无输出，退出码为 0。

- [ ] **Step 2：使用微信开发者工具验证档案。**

  加载项目 `wechat-devtools` skill，构建 npm 后检查：新建成年犬、新建幼犬、编辑旧档案、未来出生日期、品种必填、混血/不确定品种、品种无可靠估算、Slider 0/1/2/3/6 小时边界，以及隐藏过敏/忌口数据的编辑保留。确认系统估算阶段、只读成年体重、实时活动反馈、字段错误和保存返回均与 C01/C02 一致；界面没有活动强度或成年体重输入。

- [ ] **Step 3：验证六条本餐评估路径。**

  在开发者工具中验证：

  1. 能量接近目标且密度合适。
  2. 能量偏少且密度合适，按比例调整后重算。
  3. 能量接近目标且密度需调整，进入营养食材页后返回重算。
  4. 能量与密度均需调整，先调整组成再更新份量建议。
  5. 能量数据缺失但密度可用。
  6. 水分或标准缺失但能量可用。

  截图分别对照 C03–C09；临时截图和 `.design-check/` 只用于当轮验证，完成后删除，不纳入提交。

- [ ] **Step 4：检查阶段边界与口径文案。**

  使用固定模拟日期或纯函数测试确认 8 周、14 周、1 岁和 7 岁边界，以及活动时长 `<1`、`1–<2`、`2–<3`、`3–6` 的派生边界；检查“系统估算”“起始参考”“不包含零食及其他额外喂食”和专业咨询提示均可见。确认活动档位是产品对 FEDIAF 系数的时长映射，用户不选择强度；不得出现“保证吃饱”“一定超量”、老年犬独立营养标准或要求手填预计成年体重的文案。

- [ ] **Step 5：更新实现交接与工作日志。**

  `docs/ui/figma-implementation-notes.md` 记录 C01–C09 到具体页面/组件/服务的映射和与 Figma 的已知差异。`docs/work-logs/2026-07-19.md` 记录时间、改动摘要、原因、自动检查、开发者工具验证和提交信息“未提交（按要求等待用户允许）”。

- [ ] **Step 6：报告结果并停止。**

  向用户交付修改文件、核心行为、验证结果和剩余风险；不执行 `git add` 或 `git commit`。只有用户另行明确允许提交时，才能进入提交操作。

## 规格覆盖检查

| 设计要求 | 实施任务 |
| --- | --- |
| Figma 先行且用户评审后才能实施 | Task 1–3、Gate A |
| 出生日期为唯一年龄输入 | Task 1、4–7 |
| 品种必选、成年体重只读估算及无可靠估算降级 | Task 1–2、5–6、8、11–13 |
| 0–6 小时时长 Slider 与四档内部派生 | Task 1、5–6、8、11–13 |
| 隐藏过敏/忌口 UI 且保留内部数据 | Task 1、5–6、13 |
| 幼犬、成年、老年能量模型 | Task 8 |
| 食材能量、回退和缺失下限 | Task 9 |
| 早期/晚期/成年营养档案 | Task 10 |
| 双轴组合与单侧降级 | Task 11 |
| 收起、展开、范围、调整和异常状态 | Task 2、12 |
| 按比例调整不改变营养密度 | Task 9、12 |
| 旧档案与旧 `ageStage` 兼容 | Task 5–7 |
| 自动化、UI 和开发者工具验证 | Task 4–13 |
| 文档与工作日志 | Task 1、3、13 |
