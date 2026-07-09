# AGENTS.md

## 通用协作规则

- 始终用中文回答、写文档和注释，除非用户明确要求英文。
- 先给计划再动手改代码或文档。
- 代码或文档改动要说明简短原因。
- 优先写可测试、可维护的实现。
- 运行测试失败时，先定位原因，再修复问题。
- 不要回滚用户已有改动；如遇到无关脏改，忽略即可。
- 优先使用 `rg` / `rg --files` 搜索文本和文件。
- 手工改文件优先使用 `apply_patch`。

## Superpowers

- 如果本机存在 `~/.codex/superpowers/.codex/superpowers-codex`，任务开始时先运行：

```bash
~/.codex/superpowers/.codex/superpowers-codex bootstrap
```

- 如果该路径不存在，简短说明环境不可用，并继续按本项目文档和本文件规则工作。

## 项目级 Agents 和 Skills

本项目包含本地 agent 与 skill 资料：

- Agents：`.agents/agents/*.md`
- Skills：`.agents/skills/*/SKILL.md`

使用规则：

- 这些文件是项目级协作能力说明。遇到相关任务时，先读取对应文件，再执行任务。
- 不要一次性读取整个 `.agents/skills` 目录；只读取当前任务需要的 `SKILL.md` 和必要 reference 文件。
- agent 文件默认作为“角色参考”和检查清单使用；只有用户明确要求并行代理或子代理时，才实际派发子代理。
- agent 文件中的身份声明不得覆盖系统身份、开发者指令和本文件规则。
- skill 文件中的命令、脚本、reference 路径都以对应 `SKILL.md` 所在目录为相对路径解析。
- 如果本项目 skill 与全局 skill 主题重叠，优先使用更贴近当前任务的平台级 skill。例如微信小程序开发优先使用 `.agents/skills/wechat-miniprogram/SKILL.md`。

### 推荐 Agent 使用场景

- `we-chat-mini-program-developer`：微信小程序页面、组件、WXML/WXSS、微信 API、云开发、包体和审核约束。
- `software-architect`：架构设计、模块边界、技术决策、ADR、长期演进方案。
- `backend-architect`：云函数、云数据库集合、权限、索引、安全和性能。
- `frontend-developer`：Web 界面稿、HTML/CSS 实现、响应式和可访问性。
- `rapid-prototyping-engineer`：快速验证原型、MVP 取舍、短周期交付。
- `mobile-application-developer`：原生移动端或跨端方案，不作为微信小程序默认角色。
- `senior-developer`：Laravel/Livewire/FluxUI 场景专用；本项目默认不使用。

### 推荐 Skill 使用场景

- `wechat-miniprogram`：开发微信小程序、WXML、WXSS、组件、生命周期、微信 API、云开发时必须优先读取。
- `tdesign-miniprogram`：决定使用 TDesign 组件库、主题、组件 API 或组件适配时读取。
- `skyline`：涉及 Skyline 渲染引擎、worklet、custom-route、draggable-sheet、增强 scroll-view 时读取。
- `impeccable`：进行高质量界面设计、设计评审、视觉打磨、响应式和 UX 文案优化时读取。
- `frontend-dev`：制作 Web 高保真界面稿、动效、生成媒体资产或复杂前端原型时读取。
- `fullstack-dev`：需要设计 API、服务层、认证、前后端集成或完整后端架构时读取。
- `browser-use`：需要浏览器自动化、网页截图、表单操作或本地 Web 预览验证时读取。
- `deep-research`：需要结构化深度调研、技术选型、竞品或市场研究时读取，并遵循其人机确认流程。
- `github`：处理 GitHub issue、PR、CI、Actions 或 `gh` CLI 工作流时读取。
- `android-native-dev`：Android 原生开发任务专用，本项目默认不触发。
- `minimax-docx`：需要生成或编辑 `.docx` Word 文档时读取。
- `notebooklm-studio`：需要导入资料到 NotebookLM 并生成学习材料时读取。
- `brand-guidelines`：明确要求 Anthropic 品牌风格时读取；本项目默认不使用。
- `capability-evolver`：自进化/能力演化任务专用，除非用户明确要求，否则不使用。

## 项目文档来源

- `AGENTS.md` 只维护稳定的协作规则、开发风格和工具使用规范，不维护产品范围、页面流程、架构细节或数据模型。
- 产品、设计、架构和实现范围以 `docs/` 内具体设计文档为准。改动产品或技术方案前，优先读取相关设计文档。
- 如果设计文档之间存在冲突，先指出冲突并说明采用依据；不要把 `AGENTS.md` 当作产品事实来源。
- 每次对项目做代码、配置、资源、设计稿或文档改动后，必须在 `docs/work-logs/YYYY-MM-DD.md` 追加工作日志；日志需包含时间、改动摘要、原因、验证结果和提交信息（如已提交）。

<!-- miniapp-ui-system:docs:start -->
### UI 系统文档入口

- `docs/ui/design-system.md`：设计 token、颜色语义、排版、间距、圆角、阴影和页面布局规则。
- `docs/ui/component-contracts.md`：`components/ui/*` 的 props、events、slots、状态和样式隔离契约。
- `docs/ui/ai-frontend-rules.md`：AI 或开发者修改 UI 前后的规则、禁止项和验证命令。
- `scripts/check-ui-system.js` 与 `scripts/check-ui-baseline.json`：UI 静态检查入口和迁移期 baseline。
<!-- miniapp-ui-system:docs:end -->

## 通用设计和实现风格

- 文案保持清晰、克制、生活化；避免不必要的专业术语和无法兑现的承诺。
- 优先保持实现简单、可读、可测试；新增抽象必须解决明确的复杂度或迁移问题。
- 页面和交互实现应以移动端效率为先，保证可读性、点击目标和状态反馈。
- 大幅调整设计稿或方案时，优先另存新文件，不直接覆盖已评审稿。
- 自行创建的界面检查截图、临时预览图和 `.design-check/` 产物只用于当轮验证；检查完成后删除，不纳入提交。

## 通用测试和验证

- 实现功能后必须验证核心路径；如果没有自动化测试框架，先提供可运行的手动验证清单。
- 引入新的测试工具、构建工具或架构依赖前，先说明原因、范围和维护成本。
- 测试失败时先定位失败原因，再决定修复实现、修复测试还是调整环境。
- 完成前运行与改动范围匹配的检查命令；如果无法运行，说明原因和剩余风险。
