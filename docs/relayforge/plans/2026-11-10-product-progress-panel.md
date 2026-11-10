# 产品工作流可视化进度面板开发方案

- 方案版本：v1
- 日期：2026-11-10（Asia/Shanghai）
- 状态：T1–T6 已实现并验证；T7 当前 macOS 正式工具验收及用户现场可见性／刷新确认通过
- 当前基线：relayforge-product 0.1.5，Git `a438d78f1956970a9db2b43cd55e88c2f96f264c`
- 参考基线：relayforge-development 0.1.20
- 授权范围：用户已追加授权按本方案执行开发；未授权提交或发布

## 1. 目标、范围和约束

在当前插件中提供与 development 0.1.20 一致的聊天内嵌紧凑卡片，用于查看产品需求的实际阶段、当前动作、产物版本、审批状态、依赖有效性和后续动作。用户无需从连续对话中拼接产品进度。

已选方向：沿用 0.1.20 的卡片、步骤条、折叠详情、刷新与故障恢复交互，适配产品工作流。首版包含编写中、等待确认、快速模式最终确认、上游变更使审批失效、产品完成、同步中断六个代表场景；同时覆盖初始化、明确跳过原型、取消和状态不可用等边界。

交付验收必须满足：

1. 卡片直接嵌入聊天；不默认打开侧栏，也不启动浏览器 visual companion。
2. 保留 `using-relayforge-product` 的控制器职责，六个现有 Skill 的产品范围不变。
3. 产品状态源自所选需求的工作流记录及只读核对结果；当前动作和等待对象可由 Agent 申报，界面明确区分来源。
4. 标准模式按现有检查点确认；快速模式只显示一个最终规格确认目标，且明确包含引用范围。
5. 已读取 Skill、阶段工作完成、产物已批准、完整产品流程完成是四件不同的事。
6. 上游内容变化、文件缺失或输入不匹配时，不继续展示为有效批准。
7. 工具、运行时或 MCP Apps 不可用时，现有产品工作仍可通过文字和人工维护状态继续。

本方案是插件自身的维护文档，不作为对外新增的开发工作流或 Skill。插件产品工作仍终止于规格批准，不增加实施计划、编码、测试、部署、发布、任务票据或开发交付阶段。首版不提供面板内批准按钮，不实现跨需求总览、全局任务列表、文件监听或原始工具日志。

## 2. 已核对的依据与复用边界

当前仓库依据：

- [控制器](../../../skills/using-relayforge-product/SKILL.md)
- [产品工作流契约](../../../skills/using-relayforge-product/references/workflow-contract.md)
- [状态命令](../../../skills/using-relayforge-product/references/state-commands.md)
- [状态辅助程序](../../../skills/using-relayforge-product/scripts/workflow-state.cjs)
- [现有工作流回归](../../../test/workflow-state.test.cjs)
- [插件清单](../../../plugin.json)和[统一检查器](../../../scripts/check.py)

参考源码来自已安装的 `relayforge-development/0.1.20` 包；执行实现时必须固定这个版本，不能从会变化的“最新版本”复制。已核对模块如下：

| 参考模块 | 首版处理 |
| --- | --- |
| `progress_panel/server.py` | 复用 stdio MCP、封闭参数、UI 资源、错误处理；改工具名、说明和产品参数 |
| `progress_panel/state.py` | 复用 UUID、SQLite、revision、幂等重试、有界历史、清理和终态约束；增加产品快照及任务范围 |
| `progress_panel/skills.py` | 复用真实文件读取与 SHA-256 凭据；工作流集合仅保留产品控制器 |
| `web/src/card.html`、`card.css` | 沿用 0.1.20 结构与基础视觉，替换产品字段 |
| `web/src/view.mjs`、`render.mjs` | 替换开发模式、验证、方法阶段的视图映射，保留展开状态和安全文本渲染 |
| `web/src/poller.mjs`、`main.js` | 保留任务绑定、刷新、可见性和连接状态；适配产品快照版本与工具名 |
| `web/src/preview*`、构建脚本 | 正式渲染器与模拟预览共享；预览使用产品 fixture |
| 注册与测试文件 | 借鉴结构，按本仓库的 portable、Codex、Claude 校验规则重新接入 |

关键参考文件 SHA-256，用于执行前核对来源：

```text
4b65d618f7dd6b074b6dcb795b1f19156e28a00ef843ae164b741e08e528c1b2  progress_panel/server.py
e5374501d4568ae4a92e4e207194a8375055713bb67c24c936fc1ed9853c28ca  progress_panel/state.py
72c667297e317cf0e8709c3ac04d7638b374427fa5f7532fad552e439b4b4b04  progress_panel/web/src/card.html
2a9ba9fa52ebeae45a1ad8f1e207062bcacba4bca1b674f93f5d71039debf5a1  progress_panel/web/src/card.css
8dc201466caf5f29205080251bc14079680d49bf1f6b33b8af3b61cf559b28d6  progress_panel/web/src/render.mjs
aef27e3064fc08be5f9bd1372ffb24a9ae082699f5267c3f350186c5367e6652  progress_panel/web/src/poller.mjs
5238bc53f104580586f85d4a060dadacaec185463710760986aa0c31100baefc  progress_panel/web/package-lock.json
```

复制时保留所需第三方声明，记录实际移入的文件与修改点。参考包目前未发现根级 LICENSE；核实仓库自身源码的复用归属和许可，再引入原文件；保留已打包 SDK 等第三方许可。此核实归属开发任务 T1，不预先声称许可已验证。

不能直接照搬的内容：`L1/L2/L3`、`sdd/tdd/coordination`、开发验证数量、五个开发工作流名、development 的工具／资源名及默认数据目录。产品插件不读取 development 数据库，也不迁移其历史任务。

## 3. 展示内容和视觉规范

### 3.1 首屏

按以下顺序展示，正常情况下不再堆叠其他信息区：

| 位置 | 产品字段 | 来源与规则 |
| --- | --- | --- |
| 顶栏 | `RelayForge · 产品进度`、任务状态 | 进度运行状态与核对结果的组合文案 |
| 标题 | 用户可识别的需求名称 | 所选需求名称；Agent 可提供简短显示标题 |
| 步骤条 | 实际纳入本次范围的产品阶段 | 产品阶段与明确的任务范围；不能因加载 Skill 推导 |
| 当前行 | 当前动作／等待原因／最终结果 | Agent 申报；终态清除旧动作，等待须有真实对象与原因 |
| 提示行 | 审批失效、缺失输入、关键确认范围 | 工作流快照与有绑定的当前确认目标；有问题时保持可见 |
| 元数据 | 工作模式、当前阶段、当前产物、当前工作流、已加载 Skill | 模式／阶段／产物来自快照，加载来自真实读取凭据 |
| 页脚入口 | 查看详情／收起详情 | 同一任务刷新保留展开状态 |

`工作模式` 使用 `standard → 标准模式`、`fast → 快速模式`。缺失或非法值显示“未记录”，不由步骤数、材料完整程度或“继续”推测。新的需求仍由现有控制器默认记录为 standard。

当前产物显示类型、版本、状态，例如“PRD v2 · 待评审”。还未生成时显示“尚未生成”；没有记录不等于未使用。当前工作流只显示具有加载凭据的 `using-relayforge-product`；专项 Skill 单独显示，长名称换行。

### 3.2 展开详情

1. **进展与下一步**：已发生的变化、下一动作；产品完成后显示批准交接范围，不启动开发。
2. **产物与审批**：PRD、原型、规格的类型、版本、状态；当前唯一确认目标及确认范围。
3. **就绪检查与待确认项**：六项 readiness 的 present／assumed／missing、待确认假设、问题、阻断及依赖状态。
4. **阶段记录**：默认最近 3 条，最多保留 20 条，可展开当前保留的全部记录；不重建未保存的历史。
5. **输入版本与审批依据**：二级折叠，显示输入产物 ID、版本、指纹摘要及审批范围、时间、有效／失效状态。保留原始记录，不展示用户确认原话。
6. **工作流与 Skill 加载记录**：二级折叠，显示读取名称、时间、摘要；声明“已读取不代表执行或成功”。
7. **刷新信息**：阶段申报时间、源状态核对时间、连接状态和暂停／恢复。三者分别显示。

摘要不能可靠计数时显示“未记录”，不从 Markdown 列表行数猜测假设／问题数量。正文内容超长使用显式截断与“更多”展示，不静默丢弃可能阻断的项。审批失效总数须覆盖全部受影响记录，不能只计算首屏列表。

### 3.3 视觉与交互

- 沿用 0.1.20：系统字体，正文 12px，标题 16px，最大宽度 640px，卡片圆角 14px，细分隔线。
- 已完成步骤绿色并带勾；当前步骤蓝色；待处理灰色；明确跳过用虚线及“已跳过”；受阻红色并带文字。颜色不是唯一状态信号。
- 较多步骤在卡片内横向滚动；只有当前阶段变化时自动居中，其余刷新保留手动滚动位置。
- 支持 320px 窄屏与浅／深色；工作流和 Skill 名称不省略关键内容。
- 同一 run 的详情、二级折叠、已展开历史及滚动位置保持；切换 run 重置。
- 审批失效、关键输入缺失、快速模式确认包含的范围、等待／受阻原因不能只放在折叠内容中。
- 可键盘操作，阶段条有明确语义，动态状态使用适当的 live region；不抢焦点，不循环播报无变化快照。
- 进度、连接和记录时间分别呈现，不显示推算百分比、ETA、虚构工具活动或测试通过数。

之前的交互草案仅是样式与信息示例；正式实现须使用共享渲染器，不能把含示例数据的草案直接打包成真实卡片。

## 4. 架构与状态权威

```text
控制器／专项 Skill
  ├─ 按现有规则写 state.md、register、approve、check 等
  └─ 在真实里程碑调用产品进度 MCP
          ↓
Python stdio MCP（产品专用命名与私有缓存）
  ├─ source.py：固定参数调用 Node snapshot，只读核对所绑定需求
  ├─ state.py：Agent 进度声明 + 源快照 + 真实加载凭据 + 有界历史
  └─ MCP Apps UI：每 2 秒读取这个 run 的缓存并渲染

workflow-state.cjs snapshot
  └─ state.md / Artifact records / 实际产物及输入指纹
     只读；不 register、不 approve、不 saveContext、不更新活动指针
```

### 4.1 三类数据

| 数据 | 权威来源 | 面板职责 |
| --- | --- | --- |
| 模式、产物、版本、审批、依赖 | 工作流记录与只读核对 | 保存有时间与内容指纹的只读投影，不作为第二个审批数据库 |
| 当前动作、下一步、等待对象、当前确认请求 | Agent 按实际工作申报 | 保留短摘要并验证确认请求的产物绑定；不声称宿主审计 |
| Skill 加载凭据 | 服务端实际读取本插件文件 | 记录名称、时间、SHA-256；不能由调用方伪造 |

MCP 不接受调用方直接写入 `approved`、审批日志或伪造源快照。产品快照只能由服务端读取绑定的源生成。服务端对源进行核对，不负责判断对话中的确认是否真实、明确；这一职责仍属于控制器和现有审批流程。

### 4.2 新增只读快照命令

在现有 helper 中新增 `snapshot` 子命令及可测试的导出函数。当前 `check`、`gate` 都会 `saveContext`，不能直接作为读取接口，也不能由卡片轮询调用。

拟定调用：

```text
node <plugin-root>/skills/using-relayforge-product/scripts/workflow-state.cjs snapshot --project-dir <project-root> --state <project-relative-state-file>
```

职责与约束：

- 复用 `loadContext`、指纹及依赖校验规则，在独立内存上下文上核对；`checkArtifacts` 的内存失效结果可投影，禁止写回或修改真实产物元数据。
- 将读取、纯核对和持久化边界明确分开，保留现有命令的写入语义与退出行为。
- 返回当前记录、有效审批、需复核记录、源指纹、核对时间及有效视图。发现新变化时，即使原 state.md 尚写 approved，也输出有效视图“需复核／原审批失效”。
- 业务上发现失效仍返回合法 snapshot，`integrity.status=invalid`；只有读取、格式、超时等技术故障返回非零退出及有界错误码。不能将合法业务失效误报为 MCP 存储错误。
- 兼容 BOM、LF、CRLF 及已有自定义文档根。旧表格格式只报告 `migration_required`；不自动迁移、初始化或重写文档。
- 首次初始化没有 Artifact records 且无旧产物表时，返回合法空产物集合。
- 明确校验源文件、各产物和目录内文件均在项目边界内，拒绝符号链接逃逸；固定读取记录中的路径，不扫描项目、聊天或用户日志。
- 同一次采集中前后核对源及被引用内容；有并发变化则一次有界重试，仍变化返回 `source_changed`，不输出混合版本的有效批准。
- 输出仅保留展示所需字段，不传原始请求、确认原话、完整 PRD、完整说明或任意日志。默认最多 64 个产物、128 个输入边、64 条审批摘要，源输出上限 256 KiB。超限返回 `source_too_large`，不把不完整集合判为审批有效。
- readiness 使用现有 YAML 块；复用项目已有解析方式或只实现受限已知枚举格式，不引入 YAML 运行时依赖。不符合格式则显示未记录，不推断通过。
- 假设、问题和阻断列表使用已知章节投影；仅接受明确的空标记或可解析列表。无法判定是否为空时保持 unknown，不将占位符误计成业务项。

首版仅提取已有产品规则，不顺便改写门禁算法、审批语义或元数据变更时的指纹刷新规则。任何抽取必须以原有行为回归通过为前提。

### 4.3 读取绑定、缓存和刷新边界

创建任务时显式绑定当前工作区的绝对 `project_root` 与项目内相对 `state_path`。这是适配产品事实读取所必需的、相对 development 的明确接口扩展。路径只用于绑定已有需求，工具不接收命令、可执行文件路径、任意日志路径或原始文件内容。

服务端仅通过固定的 Node 可执行命令和固定 helper 脚本、参数数组启动读取，不经过 shell。单次采集默认 5 秒超时、256 KiB 输出上限；超时不中止产品工作。读取路径与错误输出不进入卡片，公开快照使用需求 slug 和相对产物标识。

源快照在 start、真实里程碑 update、用户要求 reopen 时重新采集；读取工具只读取缓存，2 秒轮询不启动 Node、不读工作区、不触发模型。外部编辑在下一次源采集前不会被自动发现，因此 UI 标明“最近核对时间”，连接同步正常不表示源文件此刻仍无变化。首版不承诺实时文件检测。

采集失败时保留最后快照，但增加明确的 source 状态提示，不继续把旧审批表述为“当前有效”。Agent 即使此时更新了动作，也不能清除源失败提示；只有成功采集能恢复。Node 不可用时卡片仍可展示 Agent 动作和“产品状态不可用”，不能改成 Agent 自报批准。

## 5. 接口契约

### 5.1 命名及工具职责

- MCP server key：`relayforge-product-progress`
- Python module：`progress_panel.server`
- UI URI：`ui://relayforge-product/progress-v1.html`
- UI 名称：`RelayForge Product Progress`
- 产品快照：`schema_version: 1`，独立于 development 的同号 schema；不接受 development 快照。

| 工具 | 必填字段与主要行为 | 可见性 |
| --- | --- | --- |
| `start_product_progress` | `title`、`scope`、`source_binding`、`steps`；新建 UUID，采集源快照，显示卡片 | model/app，关联 UI |
| `update_product_progress` | `run_id`、`expected_revision`、`status`、完整 `steps`；可选 `details`、`confirmation_request`、终态 `outcome`；重新采集源 | model；不重复渲染卡片 |
| `load_product_skill` | `run_id`、`expected_revision`、`skill`；实际读取产品 Skill、返回说明及新 revision | model |
| `open_product_progress` | `run_id`；仅用户要求重新展示／恢复时调用；重新采集源后返回完整卡片 | model/app，关联 UI |
| `read_product_progress` | `run_id`；仅返回绑定任务缓存，不提供 latest/list，也不接收路径 | app-only |

`scope` 为 `{kind: product_workflow | stage_delivery, target_stage: <stage-or-null>}`。完整流程 target_stage 为 null；只做 PRD 等局部请求使用 stage_delivery。source_binding 首版为必填；需求选择尚未解决时继续最少必要文字澄清，不创建与猜测需求绑定的面板。

封闭 schema 拒绝额外属性与伪造 `source`、`skill_loads`、`product`。长度沿用参考值：标题 80、摘要 240、步骤 1–12 项、标签 80、普通短详情 120。确认范围是独立结构化字段，总摘要不超过 600 字，避免被普通 120 字限制截断。详情／确认显式置 null 可清除，省略保留仍适用的字段；离开等待、源版本变化、终态时主动清除过期绑定。

工作流始终由真实加载凭据选择；仅 `using-relayforge-product` 记为 workflow，其他五个记为 skill。已加载一次且内容未变则重用凭据；计划使用、宿主自动加载、直接读文件均不伪造记录。工具返回的说明正常应用，但不得递归重复加载自己。

### 5.2 服务端快照结构

以下字段结构为实施契约；带省略说明的值使用表格定义，不将示例当成真实运行数据：

| 字段 | 类型／内容 | 来源 |
| --- | --- | --- |
| `schema_version`、`panel_kind` | `1`、`relayforge_product` | server |
| `run_id`、`revision`、`status`、`scope` | UUID、正整数、运行状态、任务范围 | server + validated declarations |
| `title`、`steps`、`summary`、`details` | 短文本与状态 | `agent_declared` |
| `product.requirement` | slug、名称；公开结果不暴露绝对工作区路径 | source snapshot |
| `product.workflow_mode`、`current_stage`、`workflow_status` | 已知值或 null | source snapshot |
| `product.artifacts[]` | ID、kind、相对 path、version、recorded_status、effective_status、sha256、review_required、inputs | source snapshot |
| `product.approvals[]` | artifact、version、sha256、scope、at、state、includes_input_scope、inputs | source snapshot；省略 by/confirmation 等非必需信息 |
| `product.readiness` | 六项 present／assumed／missing／unknown | source snapshot |
| `product.assumptions/questions/blockers` | 有界摘要及明确 total 或 null | source snapshot |
| `product.integrity` | valid／invalid／unknown、affected IDs、原因码 | read-only inspection |
| `product.observed_stage` | 依据失效影响投影的重评审阶段 | read-only inspection；不覆盖原始 current_stage |
| `source_state` | available／unavailable／migration_required／changed，state_sha256、checked_at、error_code、保留快照标识 | server |
| `confirmation_request` | 当前唯一确认目标，详见下节；无请求为 null | agent declaration，按 source 校验 |
| `workflow`、`skill_loads[]` | 名称、kind、loaded_at、sha256、source | actual bundled file reads |
| `outcome` | stage_delivered／product_approved／cancelled／blocked 及有界摘要 | validated declaration |
| `history[]`、`created_at`、`updated_at` | 最多 20 条，每条保存当时详情和源版本摘要 | server |

`effective_status` 是显示结果（unknown／draft／ready-for-review／approved／needs-review／missing），不回写现有产物 status 枚举。审批还应单独标明 none／valid／stale／superseded，避免把“草案已产出”和“审批有效”压成一个状态。

### 5.3 确认请求绑定

只允许一个 `confirmation_request`，结构包括 `target_kind`、`artifact_id`、`version`、`sha256`、`scope_summary`、`included_inputs[]`。artifact 请求必须匹配最近成功核对的产物及其版本／指纹；没有可匹配快照时不显示可用确认目标。

需求边界确认使用 `target_kind=boundary`，有登记 boundary 时绑定其记录；没有登记时绑定 state 文件指纹和明确的检查点版本，显示为“需求边界检查点”，不能伪装成产物审批。下一次状态内容变化后重新核对或重新发起，不静默沿用旧提示。

快速模式最终确认的 included_inputs 必须精确引用规格当前的 PRD 及相关原型输入版本／指纹，并列明纳入的目标、范围和核心交互。接口只检查绑定完整性，不替代控制器判断用户确认文字是否覆盖范围。标准模式不能通过声明 included_inputs 绕过现有审批门禁。

收到实际确认后顺序固定：控制器判断确认有效 → 原有 helper approve 成功 → 重新采集 → 清除确认请求并更新卡片。批准失败时保留待评审／失效状态，不先显示成功再补写记录。

## 6. 产品阶段、审批及生命周期映射

### 6.1 阶段条

| 原阶段 | 默认标签 | 说明 |
| --- | --- | --- |
| discovery | 探索 | 明确场景与问题 |
| clarifying | 澄清 | 需求边界、关键决定与检查点 |
| prd | PRD | 编写／评审；草案产出不代表已批准 |
| prototype | 原型 | 需要时纳入；不相关时依据已记录理由显示跳过 |
| spec | 规格 | 草案、行为规则和验收标准；等待最终确认时仍为当前阶段 |
| completed | 完成 | 仅完整产品范围已获有效规格批准时完成 |

步骤是实际选定范围的阶段，不一律套完整流程。完整产品请求可显示全部阶段；只请求 PRD 时仅显示当前工作所需步骤和“PRD 交付”，完成文案为“本次 PRD 范围已完成，待评审”，不能点亮全产品“完成”。中途进入已有 PRD 的需求，先检查源记录，再显示已有阶段事实，缺失阶段不补造完成。

快速模式中 PRD／原型阶段可因草案工作完成而显示完成标记，产物仍为待评审；等待最终规格确认时首屏明确提示这些输入尚未单独批准。由此避免将步骤勾选误解为阶段产物获批。

### 6.2 运行状态与产品状态独立

| 条件 | run 状态／显示 | 是否终态 |
| --- | --- | --- |
| 正常探索、编写、复核 | running／进行中 | 否 |
| 真正等待用户当前唯一确认 | waiting + waiting_for=user／等待你确认 | 否 |
| 等待外部资料 | waiting + waiting_for=external／等待外部资料 | 否 |
| 普通审批门禁缺失或上游需复核 | 保持 running 或真实 waiting；首屏显示需复核与下一步 | 否；不能直接用终态 blocked |
| 本次尝试确实无法继续并结束 | blocked，明确原因与恢复动作 | 是，仅该次尝试 |
| 用户明确取消 | cancelled | 是 |
| 局部请求交付完成 | completed + outcome=stage_delivered | 是；不代表产品完成 |
| 规格批准且输入核对有效 | completed + outcome=product_approved | 是 |
| 仅同步／源读取失败 | 保留已有运行状态 + 独立故障提示 | 不由故障自动结束 |

完整产品完成校验：源可用，整体依赖核对 valid，所选规格存在有效且匹配版本／指纹的批准记录，工作流已完成；快速模式的未单独批准输入必须被有效规格审批的 includes_input_scope 和匹配输入快照覆盖。标准模式沿用上游批准要求。mode 切换本身不授予任何批准。

### 6.3 失效与恢复

- 快照识别源变化后使用 effective view 显示失效，但不自行调用有副作用的 check。控制器恢复或推进时仍按原规则运行 check 并持久化失效。
- 保留历史审批，标为 stale／superseded；内容恢复为旧字节也不能恢复已失效审批。
- 上述不可恢复规则针对已经持久化到工作流记录的失效。仅在只读采集中发现、尚未写回的临时变更不构成永久审批事件；控制器收到 invalid 结果后应先按原规则运行 check 再推进。首版不重建两次采集之间发生又恢复的未记录编辑历史。
- 源核对未成功，不能基于旧缓存完成完整产品任务。
- Agent 把“生成规格”标为 done 不足以完成产品流程；必须以批准记录与有效输入为依据。
- 终态 run 不可重写。批准后源有变化，旧卡片保留“当时完成”的历史快照及核对时间；控制器重新检查时开启新 run，显式关联已知 previous_run_id，展示重新打开的产品阶段。
- 已结束的旧卡片不轮询源文件，不承诺自动发现后续变化。用户请求重开时重新核对：无变化返回原快照；有变化返回 `new_attempt_required`，由控制器创建新卡片，不能污染历史。

## 7. 技能接入和恢复策略

新增控制器参考文件 `skills/using-relayforge-product/references/progress-panel.md`，作为唯一展示契约。专项 Skill 只引用此契约并复用已有 run，不各自初始化卡片或复制整段协议。

| 触发时机 | 动作 |
| --- | --- |
| 需求消歧／初始化完成 | 对所选源 start，一次创建 |
| 进入已选控制器／专项 Skill | 可用时 load_product_skill，保留每次返回的 revision |
| 写出／登记 PRD、原型或规格 | 原状态操作成功后 update 并重新读取源 |
| 提出当前确认目标 | update waiting=user，提交绑定及范围，再在对话请求确认 |
| 收到确认但有歧义 | 保持 waiting，澄清；不调用 approve |
| 有效批准成功 | 更新并重新核对；规格批准时按完整流程规则结束 |
| check 发现上游变化 | update 需复核、受影响范围和实际下一步 |
| 明确切换模式 | 原 mode 命令成功后重新采集；不让面板直接切换 |
| 只请求阶段草案且已交付 | 以 stage_delivered 结束当前请求，保留产物待评审 |
| 用户要求重显 | open 已知 run；不把 open 当作刷新 |
| 工具缺失、卡片关闭 | 继续工作与必要文字更新；不自动重建／安装／改配置 |

同一聊天内跨 Skill 保留 run_id 与最新 revision。运行引用只存在会话上下文、已有检查点或忽略的运行时文件，不写入可提交的产品事实文档。首版不新增自动写入仓库的 run 指针。

跨聊天恢复：有明确已知 run_id 且其源绑定相符时恢复该非终态 run；没有可靠引用则读取明确选择的需求，新建当前状态卡片，不扫描全局“最近任务”，不复制造假的历史或加载凭据。同名 slug 的不同项目不能共用记录。需求存在歧义时不改变活动指针、不任意选择源。

源绑定在 run 生命周期内不可换成另一需求。自定义文档根使用原活动指针和已选 state_path，不另建默认目录。跨聊天无需重新获得产品模式切换或既有动作授权，但不继承失效审批。

## 8. 注册、运行环境与数据隔离

### 8.1 文件与清单

拟新增 `progress_panel/`（服务端、读取适配、存储、UI、测试）、`mcp.json`、`.mcp.json`、`docs/progress-panel.md` 及技能展示契约。保留现有六个 Skill，不增加技术开发 Skill 或 hooks。

- 根 `plugin.json` 继续使用固定 portable schema；通过 `extensions.com.openai.mcpServers` 引用 `.mcp.json`，不在根写不允许的顶层 `mcpServers`、`skills` 或 `hooks`。
- 原生 `.codex-plugin/plugin.json` 保持无 portable `$schema`、保留 `skills: ./skills/`，增加兼容 MCP 注册引用。
- `.claude-plugin/plugin.json` 保留原作者和身份，增加支持的 MCP 注册引用；不能把 Codex 扩展格式照搬进去。
- 根 `mcp.json` 为 portable MCP 配置；`.mcp.json` 为兼容配置。校验两者的服务名称、命令、参数、cwd 等价；宿主各自采用对应入口，不能重复启动两套服务器。
- 固定启动 `python3 -m progress_panel.server`，cwd 相对插件根。Windows 若宿主 PATH 只有 `python`，需通过真实兼容验收决定受支持启动方式；不能在文档里声称未验证的自动适配。
- 三份版本始终一致；当前计划不改 0.1.5。未来每个目标 main 的提交前 patch +1，即使仅文档提交也适用。具体发布版本由实际提交次数确定，不在此预定。

### 8.2 运行与构建

- Python 服务 3.11+，仅标准库；Node.js 18+ 仅用于现有产品 helper 与只读 snapshot。完整事实卡片需要两者；缺失时按前述规则降级。
- UI 和 SDK 本地打包，使用参考锁定的 `@modelcontextprotocol/ext-apps 2.0.4` 与 `esbuild 0.28.2` 作为构建开发依赖，记录 lockfile 与 notices；运行无 npm、CDN、Key、云服务。
- 保留当前“无 Node 也能人工维护产品状态”的核心工作能力。Python 不可用时没有卡片，文字工作仍继续。
- 沿用纯内嵌 availableDisplayModes、无外部 connectDomains/resourceDomains 的资源配置；不添加 thread 侧栏注册。

### 8.3 存储和有界记录

产品专用覆盖变量：`RELAYFORGE_PRODUCT_PROGRESS_DATA_DIR`；沿用服务 `--data-dir` 测试入口。宿主管理目录使用 `PLUGIN_DATA`／`CLAUDE_PLUGIN_DATA` 下 `product-progress-panel`。

缺省目录：macOS `~/Library/Application Support/RelayForge/product-progress-panel`；Windows `%LOCALAPPDATA%/RelayForge/product-progress-panel`；Linux `$XDG_STATE_HOME/relayforge-product/progress-panel`（缺省 `~/.local/state`）。不复用 development 的目录或旧 schema。

每次写入清理七天未更新的记录，最多 200 个 run、每 run 20 条历史、32 个唯一 Skill 凭据；活动与历史快照须有总大小边界。历史只存当时有界摘要及源标识，不重复存整份产品正文。保持 POSIX 当前用户权限、符号链接拒绝、UUID 及 revision 校验。

revision 冲突返回本 run 的当前快照，协调者合并后最多重试一次；相同丢响应重试不得生成重复历史。open 的源重新核对若无实质变化不增 revision；有变化需事务写入并返回新 revision，但不更新 Agent 的阶段申报时间。终态 open 仅允许无变化结果或返回新尝试提示。

工具注解须反映实际行为：read 为只读，start/update/load 仅修改面板缓存或加载凭据；open 对非终态可能更新缓存，不能照搬参考工具的只读提示。所有工具均不批准产物、不写源记录；公开参数与错误不包含命令或原始日志。源字段按文本渲染，不能作为 HTML、脚本或后续工具指令执行。

## 9. 实施任务和依赖

采用单人顺序实施；执行结果见末尾记录。不需要为执行计划再拆一套交付票据。本方案的任务 ID 只追踪插件维护，不改变产品工作流状态。

依赖图：`T1 → T2 → T3 → T4 → T5 → T6 → T7`。每个任务都消费前一个已通过的契约；修改公共接口后重新验证直接消费者。没有要求并行代理或额外检查点提交。

### T1：固定契约并提供无写入的产品快照

**依赖：** 无。**状态：** integrated。**负责边界：** helper 与源快照契约。

**文件：** `workflow-state.cjs`、`references/state-commands.md`、`test/workflow-state.test.cjs`；记录源文件复用归属。

- 为已批准快照、修改／缺失上游、快速模式包含输入范围分别先写公共行为回归，再加入 snapshot 与受限投影。
- 输入为项目根与明确 state 相对路径，输出第 5 节的源部分和明确错误码。
- 将读取与写回分离，核对前后真实文件字节、状态表、指针均未改变。
- 明确确认字段与空／旧状态处理；不顺带增强现有审批规则。

**完成证据：** snapshot 只读、invalid 仍有结构化结果、并发变化不输出有效批准、原工作流测试通过。许可／归属不明的原文件暂不复制，其余接口任务可继续。

### T2：在新聊天中看到第一张真实产品卡片

**依赖：** T1。**状态：** integrated。**负责边界：** 创建／更新／读取完整链路。

**文件：** `progress_panel/{__init__,server,state,source,skills}.py`、`progress_panel/web/`、`progress_panel/static/panel.html`、第三方声明、三份插件清单和两份 MCP 配置。

- 从固定 0.1.20 移植可复用模块，替换身份与开发专用字段；完成五个产品工具的封闭 schema。
- 接入固定 Node snapshot 调用、SQLite source 绑定及 revision。
- 实现正常编写中、当前产物、真实 Skill 凭据的卡片和详情。
- 包含最小可安装注册与静态构建；此时只证明正常进行中的纵向链路。

**完成证据：** 使用独立临时项目，start → update → app read 能看到正确需求，另一项目同名 slug 不串用；同时安装 development 工具与资源不冲突。正式 UI 显示与工具返回分别记录证据，不相互替代。

### T3：标准与快速模式的审批展示正确

**依赖：** T2。**状态：** integrated。**负责边界：** 模式、确认请求、阶段范围、完成条件。

**文件：** `state.py`、`source.py`、`web/src/{view,render}.mjs`、`card.html`、对应 Python／Node／helper 回归。

- 标准模式：草案、待评审、明确确认、真实 approve 后展示批准。
- 快速模式：连续草案不产生中间审批；唯一规格确认包含输入范围；批准后上游仍可保持未单独批准。
- 确认对象版本／指纹不匹配时清除旧提示并显示需重新发起。
- 区分 stage_delivery 与 product_workflow，避免只交付 PRD 却点亮全流程完成。

**完成证据：** 第 10 节 A1–A8 全部通过；批准前后版本和输入指纹变化按原 helper 的状态元数据规则处理。

### T4：上游变更、终态历史与重新评审保持一致

**依赖：** T3。**状态：** integrated。**负责边界：** 源有效性和重新打开流程。

**文件：** `source.py`、`state.py`、视图映射、history、集成 fixture。

- 覆盖源变更／缺失／恢复后的传递失效，保留历史审批与来源。
- 普通需复核不使用不可恢复终态 blocked；缺失来源不沿用有效批准。
- 已完成 run 不改历史，新尝试明确引用已知旧 run；源改变时重显返回 new_attempt_required。
- 未知旧格式显示未记录／需迁移，不自动执行迁移或将标签当成审批。

**完成证据：** A9–A13 通过；历史记录反映当时状态，不用当前源结果回填旧历史。

### T5：刷新、恢复及运行时降级可用

**依赖：** T4。**状态：** integrated。**负责边界：** 轮询、读取故障、恢复与数据隔离。

**文件：** `poller.mjs`、`main.js`、服务存储／错误处理及协议、状态和刷新测试。

- 保留 2 秒轮询、相同 revision 不重绘、隐藏暂停、手动暂停与退避重试。
- 采集失败与 UI 断连分开显示；卡片请求不触发 Node 或状态文件写入。
- 重试幂等、冲突合并、过期响应隔离、跨项目／跨 run 隔离及保留策略验证。
- 无 Python、无 Node、无 MCP Apps、运行引用缺失时保持可解释的降级路径。

**完成证据：** A14–A18 通过；暂停刷新文案不能暗示产品工作暂停。

### T6：控制器和全部产品阶段自动维护卡片

**依赖：** T5。**状态：** integrated。**负责边界：** 技能说明、元数据一致性、贡献者检查。

**文件：** 控制器及其他五份 `SKILL.md`、新增 `references/progress-panel.md`、`README.md`、`docs/progress-panel.md`、`scripts/check.py`、`test/test_validation.py`。

- 控制器唯一初始化，专项技能复用；仅真实里程碑更新，等待跨轮保留。
- 文档区分服务、Node helper、UI 构建的依赖；替换 README 中不再适用的“无 MCP 配置”描述。
- 检查器加入配置 JSON、固定服务目标、两个 MCP 配置等价、静态资源／源码标识、工具集合及三个清单一致性。
- 将 Python 标准库 unittest 与 Node UI 测试纳入非 structure-only 检查；缺少开发环境时明确说明，不把跳过视为通过。
- 更新插件包排除／发现规则，确保打包资源、通知文件、helper 和 Skill 引用均存在。

**完成证据：** 统一检查通过，六个 Skill 的激活边界和产品范围未扩展，卡片不可用的文字路径仍成立。

### T7：真实宿主验收并记录边界

**依赖：** T6。**状态：** integrated（当前 macOS：正式工具检查＋用户现场观察；自动 UI 截图审计未执行）。**负责边界：** 最终可见结果及可交接证据。

**文件：** 验收证据写入 `docs/progress-panel.md` 的版本化验收章节；不写真实项目隐私、run ID 或原始日志。

- 新聊天加载插件，实际验证内嵌展示、跨里程碑自动更新、展开状态与重显。
- 在明确测试项目中跑标准、快速、失效、局部交付、终态重开和故障场景。
- 320px 窄屏、浅深色、键盘、长 Skill 名称、超过 6 个步骤的滚动验证。
- macOS Codex 为首要实机目标；Windows／Linux 和 Claude Code 分别记录服务启动、文字工具、MCP Apps 能力，不能由一种宿主结果推及其他宿主。

**完成证据：** 每个声称支持的宿主具备对应实测结果；没有设备／宿主的项目标为未验证。模拟预览、协议测试和正式宿主验收三类证据分开记录。

## 10. 验收场景矩阵

| ID | 输入／触发 | 必须观察到的结果 | 覆盖任务 |
| --- | --- | --- | --- |
| A1 | 新需求初始化，尚无产物 | 探索阶段、模式来自源、当前产物尚未生成；不补造审批 | T2、T3 |
| A2 | PRD ready-for-review | 当前 PRD 版本正确，未批准；不能仅凭该状态显示“等待你确认” | T3 |
| A3 | 显式发出唯一 PRD v1 确认请求 | waiting=user，范围匹配 v1 指纹，下一步清晰 | T3 |
| A4 | 用户泛称确认，但存在多个候选或版本变化 | 继续澄清，不写 approve、不显示已批准 | T3、T6 |
| A5 | 标准模式 PRD 未批准或相关原型未批准 | 不跨门禁标为规格可批准；保留明确需要的下一步 | T3 |
| A6 | 原型不相关且已有记录理由 | 原型明确跳过，规格输入不伪造原型 | T3 |
| A7 | 快速模式生成三类草案并确认最终规格 | 只显示一个最终目标；批准绑定输入范围，PRD／原型不被单独批准 | T3 |
| A8 | 只请求 PRD 草案并已交付 | 本次范围完成，产物仍可待评审，完整产品阶段不变 | T3 |
| A9 | 修改 PRD 或删除输入文件 | 受影响原型／规格显示失效，不能继续完成产品；只读查看不改文件 | T1、T4 |
| A10 | 将已持久化失效的产物恢复为原内容 | 原 stale 审批不自动复活，需要重新登记／确认 | T4 |
| A11 | 只有正文 approved 标签或旧表格 | 未验证批准／需迁移提示，不伪造 JSON 审批历史 | T1、T4 |
| A12 | 有效规格批准后继续同一完成需求 | 返回批准交接信息，不进入开发阶段 | T3、T6 |
| A13 | 完成后源变更并请求继续／重显 | 旧 run 不变，新 run 进入最早受影响阶段 | T4 |
| A14 | 并发 revision、相同重试、迟到读响应 | 不覆盖新状态、不重复记历史、不串任务 | T5 |
| A15 | 断连、记录删除、页面隐藏、手动暂停 | 保留最后状态；临时退避、永久停止；可见性不取消手动暂停 | T5 |
| A16 | 无 Node／source 超时／并发读取变化 | 产品事实标为不可用或需重试；不沿用旧有效结论、不阻断文字工作 | T1、T5 |
| A17 | 新聊天无可靠 run 引用／同名不同项目 | 明确选需求后创建新卡片，不找全局最近任务、不串历史 | T5、T6 |
| A18 | 伪造加载凭据、越界源、超限集合 | 封闭参数拒绝或显示不可用；不误判完整集合有效 | T1、T2、T5 |
| A19 | 窄屏／浅深色／多步骤／长名称 | 无重要内容裁切，正确聚焦当前步骤，刷新保留交互状态 | T7 |
| A20 | 全部自动化通过但未测实际宿主 | 只报告自动化证据，不宣称内嵌 UI 已通过 | T7 |

## 11. 验证命令与完成判据

以下为实现验证命令；本次实际执行结果见第 13 节，命令清单本身不作为通过证据。

```sh
python3 scripts/check.py
node --test test/workflow-state.test.cjs
python3 -m unittest discover -s progress_panel/tests -p 'test_*.py'
npm --prefix progress_panel/web ci --ignore-scripts
npm --prefix progress_panel/web run build
npm --prefix progress_panel/web test
```

实现应在 `npm ci` 后进行构建／UI 检查；已提交静态资源可用性与构建可重复性都须验证。根统一检查不隐式安装依赖或访问网络。插件运行不要求这些构建依赖。

另外运行仓库规定的三份清单 JSON、版本一致性、Skill／UI YAML 验证；新增 MCP JSON 也须解析和结构校验。每次针对 main 提交前根据实际 HEAD 版本递增 patch 后再验证。未授权提交／发布时只交付工作区变更与证据，不自动执行发布。

完成开发必须同时具备：T1–T7 实际证据、A1–A20 的结果、当前仓库回归通过、正式渲染器预览与实机结果的区分、明确的未验证宿主清单。不得因卡片任务结束而自动标记未运行检查通过。

## 12. 风险、实施决策与执行交接

| 项目 | 已选处理 | 责任任务／剩余证据 |
| --- | --- | --- |
| 读取误触发写入 | 新增纯 snapshot，不由 UI 调用 check/gate | T1：字节级无变化与原命令回归 |
| Python 与 Node 双运行时 | 仅卡片事实读取需要；核心工作仍有文字／人工路径 | T2、T5、T7：跨平台启动验证 |
| 模式／审批含义被 UI 简化 | 任务、阶段、产物和审批分开；快速输入不单独批准 | T3：标准与快速完整示例 |
| 外部变更无法立即发现 | 里程碑采集，明确核对时间；首版不做监听 | T4、T5：旧结果标识与重新打开 |
| 调整参考 UI 导致交互回退 | 正式渲染器与 preview 共用，并保留原有刷新行为 | T5、T7：状态与视觉证据 |
| 宿主工具更新不进入旧聊天 | 以新聊天验收；缺失继续文字，不反复重启 | T7：真实工具清单与内嵌结果 |
| 源码包缓存被清理／来源不固定 | 已记版本和摘要；实施前取得同版源码并核对归属 | T1：来源与必要声明 |

当前没有需要新增产品方向选择的阻断项。上述快照接口、源采集时机、任务范围区分与命名是本方案给出的实施决策，尚未在代码中落地。若实机暴露新的宿主限制，优先保持产品规则与文字降级，再针对受影响部分调整方案并记录证据。

实现已落在 `codex/product-progress-panel` 分支的工作区，插件版本统一为 0.1.6。
首次开发阶段没有提交、推送或安装／重载宿主插件；后续用户追加授权的正式加载
与验收已执行，结果见第 14 节。不得复用旧 development 面板的可见性作为通过证据。


## 13. 执行记录（2026-11-10）

- T1：增加纯只读 snapshot；真实状态／指纹、传递失效、已持久化 stale、旧格式、
  符号链接、混合版本读取、容量上限回归通过。原 helper 命令语义保留。
- T2：五个产品工具、独立数据目录和资源、固定源读取、真实 Skill 凭据、静态 UI
  及两份 MCP 注册已接通。真实 stdio 进程验证通过；实机新聊天展示交由 T7。
- T3／T4：标准／快速审批、单一版本绑定、局部交付、终态重开、旧审批失效、
  源不可用和过期确认清除已实现并通过对应工具边界回归。
- T5：revision 冲突／幂等、有界历史、无 Node／超时、只读缓存轮询、过期响应、
  隐藏和手动暂停、断连与永久不可用等场景通过。
- T6：六个 Skill、控制器契约、清单、README、面板说明和统一检查已接入。
- T7：正式共享渲染器的 18 组本地浏览器状态／尺寸检查、浅深色人工截图检查、
  键盘及同任务状态保留通过；真实 Codex 内嵌和其他宿主实机部分未验证。

最终 `python3 scripts/check.py` 通过（59 项自动化测试）；npm build／preview、
JSON／YAML、版本一致性、Markdown 结构／链接检查通过。Claude CLI 缺失的原生
校验明确跳过。验证对象为当前工作区源码，HEAD 未变，不表示已提交或已发布。

关键源码集合摘要（按本节执行时的路径＋各文件 SHA-256 组合，不含文档及测试）：

```text
7e5b0ad399c4b0b38ea4ed9dd2b472a614d53c6801e19aee2b7ad40cb9f617fd
```

该集合覆盖清单、协议／存储／源适配／Skill loader、UI 视图／渲染／轮询、构建
锁文件及 helper／snapshot。内容改变后需要重新核查受影响证据，不以同一 HEAD
推断工作区没有变化。详细环境边界见 [面板说明](../../progress-panel.md)。


## 14. 正式宿主验收补充（2026-11-10）

用户追加授权加载当前插件到新聊天验收。通过宿主 CLI 将已配置的产品 marketplace
从远端来源切换到当前工作区并安装 0.1.6；缓存关键文件与工作区一致，没有修改
缓存源文件，也没有提交、推送或发布。

新验收聊天实际使用产品服务，不使用 development 卡片替代。标准流程同一 run
经历 revision 1→7：1 次 start、1 次控制器加载、5 次成功 update，没有 reopen
或重复 start。规格有效批准后接受 product_approved；错误指纹、上游审批门禁与
提前完成均被拒绝。快速模式和传递失效的补充 helper 检查通过。

用户在主聊天直接确认“卡片可见，状态自动更新”。据此当前 macOS 的内嵌可见性
和自动刷新通过用户现场观察验收。宿主自动 UI 读取受限，未取得逐字段截图；
不把服务 revision 本身当作 UI 证据，也不声称完成自动渲染审计。

工具侧原报告、用户观察及总汇分别在忽略测试目录下的 result.json、
user-observation.json、formal-acceptance.json。原报告仍保留其自动观察未验证的
独立结论，汇总明确采用用户现场确认补充该证据。详见
[正式验收说明](../../progress-panel.md)。Windows／Linux 和 Claude Code 继续保持未验证。
