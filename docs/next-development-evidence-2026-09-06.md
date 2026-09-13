# 下一阶段开发规划：本轮证据

日期：2026-09-06。工作目录 `E:\xuexi\turtle-soup`。本轮为审查与规划，没有修改游戏实现、案件或发行制品，没有提交或推送。默认零子代理。

## 读取范围

读取指定任务“规划TURTLE SOUP推理游戏”（`01a02905-0258-7b90-ab21-f6161965170e`）的原始项目需求、关键 v1.9 创始人反馈与实施计划、v2.x 迭代结果、9 月 6 日审查及 v2.12 断点。该历史很长，部分旧回合工具仅返回空条目；不宣称完整逐字读取所有历史工具输出。

关键判断：早期“48 条完整流程通过”的说法已经在后续审查中纠正。当前计划采用较新的缺口记录，不把过往高评分或大批测试数字当作成熟度证明。

本轮读了 Browser 技能，以及 Game Studio 的总入口、web-game-foundations、game-ui-frontend、game-playtest。它们用于当前架构、玩家界面和真实操作检查。项目 apps/web/AGENTS.md 要求编码前阅读已安装 Next.js 相关文档；本轮未进行前端编码，后续实现需要遵守。

## 当前构建身份

使用已有 `loadRun()` 只读校验实现，对当前源码、profile 与静态构建重新计算并比较，结果通过。

```text
runId: v212-2026-09-06T10-08-11-942Z-f54095c9
sourceHead: 29673463024b036d9ad7eeb1aeba6973113f635a
sourceTreeDigest: 0ce774e89eed48aaabf625fe3c36f64ce8460fd852951f8834803cd3157f3eb8
profileSha256: 0c58dc769f45bb9d29232b9774bc6d01a06ff1e97229446a224131ce12bf658c
buildHash: a88f90d18c47fd26bdeceb3cbc90d190a5acd02925dc7c6f0dc02a2db5fbc823
profile: v2.12-internal-rc
```

现有报告 `docs/v2.12-release-verification.json` 为 28 项门禁：7 项通过、21 项未执行、0 项记录为 failed。这里的“0 failed”不代表发行通过：未执行项仍不满足门禁。

本轮仅重跑 `npm run test:core`：145 tests，145 pass，0 fail，0 skipped，退出码 0。原始日志：[core-tests.log](../output/planning-2026-09-06/core-tests.log)。未重建整个产品、未重跑历史存档/全案离线检查、未改已有 v2.12 收据。

## 浏览器方法

通过用户指定的内置浏览器检查，使用现有静态目录 `apps/web/out`，在独立测试 origin `http://127.0.0.1:8098` 服务。启动前该端口无监听。沿用已有静态服务器脚本，以隐藏窗口启动本轮自己的进程。

实际操作：桌面 1440×900 首页 → C01 开场 → 零提问推断 → 提问 → 输入自然问句 → 输入规范对照句 → 手机 390×844 提问 → 查看证据；另开 C61 → 手机提问 → 展开改写工具。均通过可见 AX 控件操作，并保存截图/DOM。

这是局部已知上下文的 UI 审查，不是完整调查、不计盲玩、没有结案收据。没有向浏览器注入存档或 Worker 命令，没有读取浏览器存储或隐藏状态。没有测试真实手机、Firefox/WebKit、系统断网、AI API 或辅助阅读器。

## 发现与复现

### F01：自然命题错配

在 C01 没有检查证据的提问页输入：

```text
原问题：敲门时冷藏室里有人吗？
实际系统理解：敲门声是人敲的吗？
实际回答：信息不足 / 目前公开的来源不足以确认或否定。
计数：1 次有效提问
```

没有经过歧义确认。随后输入规范对照：

```text
原问题：敲击发生时，冷藏室里是否有人？
实际系统理解：敲击发生时，冷藏室里是否有人？
实际回答：信息不足 / 目前公开的来源不足以确认或否定。
计数：2 次有效提问
```

可确认“位置存在”被错误映射到“声音施动者”。当时两个查询都是信息不足，故不能从这次观察宣称已复现错误 yes/no 答案；仍是足以误导后续调查的语义缺陷。

- [错误理解 DOM](../output/planning-2026-09-06/05-c01-routing-mismatch.contains-hints.dom.txt)
- [错误理解截图](../output/planning-2026-09-06/05-c01-routing-mismatch.contains-hints.png)
- [正确对照 DOM](../output/planning-2026-09-06/06-c01-routing-control.dom.txt)

相关代码：`packages/mystery-core/src/engine.ts` 的 `normalizedQuestionText`、`matchRuleScore`、`normalizeQuestion`。关键词优先级/关系冲突是需要进一步隔离验证的根因方向，本轮未修复。

### F02：中性编号与默认已选状态

C01 零提问进入推断：当前解释为“待验证解释 1（先整理证据）”，另有编号 2 和 3；暂定解释步骤显示“已选解释”。

中性标签说明此前完整 canonical 文案的提前曝光已受限制；但是玩家没有可比较的解释含义，步骤也容易把系统默认状态误表述为玩家选择。不能仅为去掉编号就恢复提前显示案底。

证据：[零提问推断截图](../output/planning-2026-09-06/03-c01-neutral-theory-desktop.png)。相关代码：`runtime.ts` 的 `projectedTheoryOptions`、`proof-readiness.ts` 和 `investigation-shell.tsx` 的 `ProofContext`。

### F03：首问建议的信息时机

C01 零提问首问建议中包含明确的动机方向；它是问句而非确定事实，因此记录为启发式提示过早风险，不声称已证明玩家会被剧透。`questionStarters()` 目前过滤格式后取前三个，没有逐案语义与公开阶段配置。

证据：[首问建议截图，含提示](../output/planning-2026-09-06/04-c01-question-starters.contains-hints.png)。当前计划只描述风险，不在公开摘要复制案底。

### F04：C61 的候选仍缺少命题

C61 手机提问页没有第一问示例，只显示通用引导。展开“按对象、关系或时间改写问题”后，出现 10 个名词式候选，包括“卷盘芯径是否成立？”“剩余长度是否成立？”。这确认了候选文本问题仍存在，不应把首问过滤视为整案自然语言完成。

- [C61 首问截图](../output/planning-2026-09-06/09-c61-questions-mobile.png)
- [C61 候选 DOM](../output/planning-2026-09-06/10-c61-question-builder.dom.txt)
- [C61 候选截图](../output/planning-2026-09-06/11-c61-builder-mobile.png)

### F05～F07：证据衔接、证明表达与声音

F05：点击 C01 最新回答下“查看公开证据”，进入包含五件材料的总证据架，没有特定材料详情/定位。当前按钮只调用 `open("evidence")`。证据：[证据架 DOM](../output/planning-2026-09-06/08-c01-evidence-mobile.dom.txt)。这是衔接改进需求，不是无法使用证据功能。

F06：源码显示 `ReasoningBoard` 使用通用事件选择/放置/连接逻辑；`TheoryWorkspace` 另外提供 `LegacyTheoryWorkbench` 的事件链和证明篮。尚未测量完整任务的冗余操作数量，不能声称某个百分比的效率损失。C01/C03 冻结内容没有 reasoningBoards；C24 有 spatial-map，C25 有 state-trace/measurement-model，C61 有 calibration-curve/material-balance，C84 有 causal-graph/interval-logic/counterfactual-tree。

F07：`AudioEngine` 接线出现在旧 `VariantShell`，当前 `GameShell` 进入 `InvestigationShell`；统一 Shell 未发现 AudioEngine 接线。属于静态待修复发现，没有进行听觉或 Web Audio 输出测试。

## 视觉观察与边界

桌面档案风格、四工作区分层、手机底栏、纸张色回答卡已经形成一致方向。C01 桌面现场图较大，可检查对象靠近首屏下沿；手机提问页可读，但历史每条占用较多纵向空间。上述是本轮截图上的设计判断，没有真人视觉评分。

- [首页桌面](../output/planning-2026-09-06/01-home-desktop.png)
- [C01 桌面开场](../output/planning-2026-09-06/02-c01-opening-desktop.png)
- [C01 手机回答，含提示](../output/planning-2026-09-06/07-c01-questions-mobile.contains-hints.png)

C61 标签页本轮已捕获的 error 日志查询返回空列表，不可外推为整个产品控制台零错误。最终恢复临时视口覆盖；本轮临时服务在检查结束时只按已核对进程身份关闭，不清理浏览器存档。

原始证据文件的字节和 SHA-256 索引见 [manifest.json](../output/planning-2026-09-06/manifest.json)。这些证据用于规划，不会自动填入 v2.12 完整通关矩阵。

完整实施顺序见[开发计划](./next-development-plan-2026-09-06.md)。
