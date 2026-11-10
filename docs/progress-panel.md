# 产品进度面板

RelayForge Product 0.1.6 提供聊天内嵌产品进度卡片，参照 development 0.1.20
的紧凑结构、步骤状态色、折叠详情及刷新交互，适配标准／快速产品流程。
不默认打开侧栏，不启动原型讨论使用的浏览器 visual companion。

## 查看内容

首屏展示任务、状态、实际步骤、当前动作／结果、工作模式、当前阶段、产物版本、
工作流与真实读取的 Skill。审批失效、源读取失败与当前确认范围保持可见。
详情包含进展与下一步、产物与审批、就绪检查、待确认项、最近三条阶段历史；
输入版本和审批依据、Skill 加载凭据二级折叠。历史最多 20 条，可展开全部保留记录。

正文 12px、标题 16px、最大宽度 640px，浅深色适配。步骤可横向滚动，阶段切换
才自动定位；其他更新保留滚动和折叠状态。完成标记表示阶段工作完成，产物是否
批准另行显示。只交付 PRD 的完成与完整产品规格获批的完成分别显示。

## 数据来源与审批

所选需求的 state.md 与 Artifact records 是产品事实来源；面板数据库只是缓存。
服务端通过固定 Node helper 的 `snapshot` 命令只读核对文件和依赖。该命令不调用
saveContext、不写产物、不改变活动需求。`check` 和 `gate` 有写入行为，仍由
控制器按原工作流调用，不能用作界面轮询。

快照发现内容／输入变化时显示有效视图中的“需复核”，不会自行写回失效记录。
控制器推进前仍须完成现有 check／register／approve 流程。已持久化的 stale 审批
不会因为恢复旧内容而自动生效。两次采集之间未记录、又恢复的编辑历史不重建。

动作、等待对象及确认请求由 Agent 申报；产品事实由固定 helper 导入；Skill 凭据
由实际文件读取生成。加载不等于执行或批准，面板不审计对话真实性。用户必须在
对话中确认明确版本及范围，再由原审批命令持久化，卡片随后读取结果。

快速模式最终确认包含引用的 PRD 目标／范围及相关原型交互，不会把输入产物
单独标为已批准。源不可用时，上次记录明确标为未核对，不能完成全产品任务。
产品流程止于有效规格批准；不新增开发、测试、发布或部署阶段。

## 工具与更新

服务 `relayforge-product-progress` 提供 start_product_progress、update_product_progress、
load_product_skill、open_product_progress 和仅供 app 调用的 read_product_progress。
UI 资源为 `ui://relayforge-product/progress-v1.html`，仅 inline 展示。
每个任务绑定显式项目根及项目内 state 路径，不提供全局最近任务或任务列表。

可见界面每两秒读取对应 run 的缓存，不额外调用模型、不运行 Node、也不监视文件。
源在开始、里程碑更新、用户请求重显时采集，并标注核对时间；同步正常不能证明
源文件此刻未变化。隐藏时暂停，手动暂停独立保留；临时连接错误退避重试，记录
缺失停止轮询。相同 revision 不重绘，迟到响应不能覆盖另一任务。

revision 与 source 核对时间、阶段申报时间分开。终态不可改写；完成后修订需求
使用新 run，保留旧快照历史。有可靠 ID 时可恢复同一非终态任务，没有时为明确
选择的需求建立新卡片，不虚构历史。工具更新后通常需要新聊天才能发现新工具，
不能依靠反复重启或修改配置填充当前卡片。完整约定见
[技能进度契约](../skills/using-relayforge-product/references/progress-panel.md)。

## 运行与隔离

运行卡片需要 PATH 中的 Python 3.11+；产品事实读取需要 Node.js 18+。二者都是
本地进程，Python 仅标准库。卡片和 SDK 已打包，运行无 npm、CDN、Key 或云服务。
缺 Node 可显示动作与源不可用提示，缺 Python／MCP Apps 时使用文字工作流。
核心产品工作仍能人工维护状态，不因可视化能力缺失而阻塞。

portable 使用 mcp.json，Codex／Claude 兼容配置使用 .mcp.json，各自相对插件根
启动 `python3 -m progress_panel.server`。不同时启动两个注册入口。
Windows 需宿主 PATH 能解析该命令；未验证的自动解释器适配不作支持声明。

状态优先使用 RELAYFORGE_PRODUCT_PROGRESS_DATA_DIR；其次为 PLUGIN_DATA 或
CLAUDE_PLUGIN_DATA 下的 product-progress-panel。缺省使用：

- macOS：~/Library/Application Support/RelayForge/product-progress-panel。
- Windows：LOCALAPPDATA/RelayForge/product-progress-panel。
- Linux：XDG_STATE_HOME/relayforge-product/progress-panel，缺省 ~/.local/state。

开发测试可传 --data-dir。写入清理七天未更新记录，最多 200 个 run；每 run
最多 20 条历史、32 个 Skill 凭据，单任务缓存上限 512 KiB。POSIX 数据为当前
用户私有，拒绝符号链接数据目标。任务 ID 是范围引用，不是同用户进程安全边界。
不读取用户日志、聊天存储或无关项目。源采集 5 秒超时、256 KiB 输出上限；
源状态文件上限 1 MiB、64 个产物、128 个输入边、64 条审批摘要。

## 开发检查与预览

```sh
npm --prefix progress_panel/web ci --ignore-scripts
npm --prefix progress_panel/web run build
npm --prefix progress_panel/web run preview
python3 scripts/check.py
```

preview 产物默认在 progress_panel/web/dist/，复用正式 card.html、card.css、
view.mjs、render.mjs，仅包含模拟数据；不调用真实工具或修改真实任务。
构建依赖固定 @modelcontextprotocol/ext-apps 2.0.4、esbuild 0.28.2，第三方声明
自动生成于 progress_panel/THIRD_PARTY_NOTICES.txt。贡献者测试环境按主 README
要求使用 Node.js 22+。统一检查不安装依赖或联网。

## 验收证据

2026-11-10（Asia/Shanghai），macOS 本地源码验证：

- `python3 scripts/check.py`：通过。6 项仓库验证、27 项原有／产品 helper 回归、
  12 项产品工具及协议回归、14 项 UI 视图／刷新回归，共 59 项自动化测试。
- npm UI build 与 preview：通过，正式静态资源与第三方声明已生成。
- Google Chrome 无头浏览器：正式共享渲染器的 9 种状态 × 736px／320px，18 组
  检查通过。已查看浅色与窄屏深色截图；页面不横向溢出，步骤条单独滚动。
- 同任务更新保留折叠和滚动位置、切换任务重置、文本安全渲染及键盘展开通过。
- stdio 子进程真实启动、工具发现、inline 资源元数据和封闭参数错误返回通过。
- 原有 companion 回环监听测试在受限沙箱曾返回 EPERM；使用允许本机回环端口的
  环境重跑全部通过。没有为环境问题削弱测试。

初次开发阶段的证据仅覆盖自动化与本地预览。下面补充正式宿主加载与验收结果；
模拟预览、正式工具调用、用户现场观察分别记录。

### 0.1.6 正式宿主验收（2026-11-10）

通过 Codex 官方 plugin 命令，将 relayforge-product-marketplace 的来源从远端
GitHub 仓库切换到当前本地工作区，并安装 0.1.6。宿主缓存中的清单、MCP 配置、
服务端和打包 UI 与当前工作区哈希一致；没有直接编辑插件缓存。
原来源为 https://github.com/mingjw6505/relayforge-product.git，保留该记录供恢复。
当前保持加载本地 0.1.6，不涉及提交、推送或发布。

新建并打开“产品面板 0.1.6 正式宿主验收”聊天，使用已安装的产品服务及独立
测试需求“宿主验收示例（测试）”。所有测试产物与测试用确认均在忽略的
`.relayforge/host-acceptance/` 内，不批准真实业务产物。

| 项目 | 结果与证据来源 |
| --- | --- |
| 加载当前插件 | 通过：新聊天实际调用 relayforge-product-progress 服务的正式工具 |
| 内嵌卡片可见 | 通过，用户现场确认；不是模拟预览或仅凭 inline 元数据推断 |
| 同一卡片自动更新 | 通过，用户现场确认“卡片可见，状态自动更新” |
| 正式工具链 | 1 次 start、1 次实际 Skill load、5 次成功 update，revision 1→7；没有 open 或重复 start |
| 标准审批状态 | PRD 草案→版本／指纹绑定的待确认→测试批准→规格待确认→有效规格批准→product_approved |
| 负向校验 | 错误审批指纹、标准规格缺少上游批准、提前完成产品流程均被拒绝 |
| 快速模式与上游失效 | 补充 helper 检查通过：规格批准不单独批准输入；修改上游使依赖及原审批失效 |
| 自动读取宿主 UI | 不可用：界面读取超时，主窗口又受宿主安全规则保护；未绕过该限制 |
| 逐字段 UI 截图审计 | 未执行；未将用户的总体可见性确认扩大为逐字段截图验收 |

主聊天保留了用户直接反馈，新聊天保留了正式工具与审批检查结果。两者的汇总
在忽略目录的 formal-acceptance.json，原工具侧 result.json 保持原貌，用户观察
单独写入 user-observation.json；精简的工具响应与源快照也保存在该测试目录。
这些运行引用和临时产物不进入插件提交内容。

本次当前 macOS 宿主所要求的可见性、自动刷新、审批链验收通过；其中 UI 可见性
和刷新依赖用户现场观察，不是自动渲染审计。原验收聊天尚未收到主聊天观察反馈，
其独立报告的 UI 未验证结论被保留；正式总结果以两类证据的明确合并为准。
Windows／Linux、Claude Code 实机行为仍未验证，Claude CLI 也未安装。

本地 marketplace 与缓存加载方式参考
[OpenAI 官方插件文档](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work)。
