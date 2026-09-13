```text
/make-plan Redesign 深汤 v2.11 的调查体验，并优先建立 v2.12 Integrity Baseline。

主要用户：中文单人推理玩家。目标：通过问答和证据自主形成并证明解释。
基线：E:\xuexi\turtle-soup，HEAD 2967346；84案；正式真人0，创始人探索会话1。

Verdict：当前调查体验在Rams启发式审查中为14/30，应重设计公开信息与证明交互，并先修复恢复和曝光缺陷；保留84案冻结基线、Worker裁决、四工作区概念、档案室视觉方向和玩家自由总结。
为什么不只是微调：关键命题、恢复链、预先曝光和测试口径都有结构性问题，总分低于20；不是因为追求新风格。

Preserve：
- 冻结manifest/案件真相/证明证书/旧ZIP；新增版本不覆盖旧轨道。
- mystery-core、Worker与公共projection边界（runtime.ts:483/657，mystery-runtime.worker.ts）。
- 四工作区和自由总结（investigation-shell.tsx:212/333）；玩家的解释不交AI裁决。
- 档案室色彩/字体和无强制解锁方向（globals.css:1，case-select.tsx:125）。

Discard：
- 同一状态下重复候选条/多处建议（shell253–256/333），损害#4/#10。
- 所有后期案回C01“敲击因果时间链”（legacy-theory-workbench.tsx:14），损害#4。
- 把已结案存档注入称为完整UI通关（tools/v25-browser-audit.ts:183），损害#6。

按优先级原样落实：
1. #2/#6 — 修复歧义确认与重放不等价、84案归档导入限制、开场正确解释曝光；先用失败反例锁定行为。证据：E2/E3/E4。
2. #6/#8 — 将注入存档测试、源码契约、截图存在性与真实UI通关分别报告，绑定源码和构建身份，禁止跳过也算通过。证据：E5/E8。
3. #4/#10 — 将公共问题和证据改成具体命题与观察，合并重复候选/指导，并让“对应证据”真正定位材料。证据：E6/06/09截图。
4. #2/#3 — 把23种板语义归入少数实质操作家族，统一可读字号和token，取消跨案C01展示回退，保留全部证明义务。证据：E6/E7。
5. #7/#9 — 保留档案质感和低动态方向，做显式按案/按季离线下载与真实交互性能测量；音景要么接线可测试，要么不显示无效控制。证据：E7/E8。

关键实证（本提示自包含）：
- C61默认非AI歧义确认后显示1次有效提问，真实浏览器刷新后变0；Worker只记accepted日志，pending accepted=false；replay又丢pending。旧日志只有confirm/queryId时缺原问，不能保证无损迁移或伪造还原。
- save-envelope.ts:246拒绝>50条；当前真实84案件identity生成归档50通过、51/84失败。
- 对实际84案叠加当前presentation patches创建初态，83案theoryOptions第一项为canonical完整标签；浏览器C61零问推断页实证。只扫内部字段不够。
- board-ui全部23模式direct:true，多数使用同一选片/填槽/连接；C61引导8px、time7px，--accent computed为空。
- 48“full flow”=8案×3引擎×2视口，但只问首例/看证据架/注入已解存档；非Chromium axe分支空列表passed=true。
- production SW install cache.addAll 1178资源；currentCaseOnly:true是报告硬编码。首页672904字节不包含这批预取。

Phase 0读取复用API：useMysteryRuntime、GameCommand、reduceGameCommand/projectPlayerState/replayCommands、validateSaveEnvelope/validateSaveArchive、CasePresentationPatch、deriveProofReadiness、loadReleaseContent；不发明第二套UI胜负规则。

每阶段交付：范围/源码引用/状态图或低保真流/错误状态清单/验收断言/回滚点。先做失败测试，再修复，再重跑。只在下一阶段真实需要时读取其API。
v2.12首批范围：三项P0及可信门禁、C01/C61/C84无存档注入真实UI通关；不同时制作84案美术和23个新编辑器。
建议后续顺序：代表案交互样板→84案公开语义清理→板家族操作→离线/性能/音景→独立无人审计RC。
不能静默改变旧胜负逻辑。若bug修复或新机制确需行为版本，单独设计runtime/命令兼容与新release轨道；旧CaseFile不改。若公开文案缺事实支持，标明阻断并请求新版本授权，不编造事实。
无真人条件：模型只作启发式审查和公开界面测试，不冒充真人、不写理解率/满意度。状态internal-rc / human-evaluation-pending；不外部发布、不配置付费服务。
验收不准降门槛、不准跳过伪装passed、不准覆写旧证据。没有证据的指标是unknown/not-run。
```
