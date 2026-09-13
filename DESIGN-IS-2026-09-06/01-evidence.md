# 深汤 v2.11：证据与复现

基线 `2967346`，2026-09-06。本轮只读应用源码、运行现有核心测试、内存诊断和本地静态构建界面；未重建或改写历史发布报告。正式真人仍为 0；浏览器自动操作不是真人测试。

## E1：本轮验证及其边界

- `npm run test:core`：94 tests / 94 pass / 0 fail，约 2.84 秒（Node v24.14.0）。这不是94个独立玩法，也不代表全浏览器通过。
- `npm run verify:freeze`：Season 1 12/12 字节冻结检查通过。未把这个数字扩大到84案字节冻结。
- v2.11 ZIP SHA-256：`f5f62c917bb3e015410a05af46c21c39548301d5a662c74fb750bdf4b73a2053`，本轮核对未变。
- 既有报告 `docs/v2.11-static-performance.json:14`：目录8,221,108 bytes；首页静态脚本672,904 bytes；最大文件395,701 bytes；ZIP3,455,234 bytes。历史记录，未声称本轮重跑构建。
- 既有“504路由/48流程/59截图/0控制台错误”必须结合下文 E5 解读。

## E2：开场解释泄漏（P0）

源码 `packages/mystery-core/src/runtime.ts:425` 的候选过滤只对C01式固定ID做特殊门控，其他案件默认返回理论标签。`publicHypothesisId`（91行）还使用 `path-canonical`，事件公开编号按内部时间顺序生成（106行）。它们虽非原始隐藏ID，仍带有答案/顺序语义。

本轮对发行profile中的84案应用实际 `.generated/presentation-patch-registry.ts` 后创建初态：83案的 `theoryOptions` 包含该案 canonical hypothesis 的完整本地化label，且为首项；只有C01不符合。此为精确文本相等检查，不意味着83案都做了人工语义审查。

浏览器C61零提问时打开“推断”，当前解释默认显示完整因果解释，见 `07-c61-proof-spoiler-warning.png`、`08-c61-mobile-spoiler-warning.png`。不在本文复述答案。字段名反泄漏不能代替语义曝光审查。

## E3：歧义确认后刷新丢回答（P0）

源码链：

1. `runtime.ts:677`：歧义产生pending但accepted=false。
2. `apps/web/workers/mystery-runtime.worker.ts:107`：实时保留pending，日志仅记accepted命令。
3. `runtime.ts:698`：确认命令仅有queryId，依赖前置pending。
4. `runtime.ts:898`：重放只采纳accepted状态，中途拒绝不抛错。
5. Worker65行：只要不抛异常即可报告restored。

内存复现使用真实C61语料“关键记录是否相关，按第1种理解？”：确认后transcript=1，日志只有confirm_interpretation；重放后transcript=0，投影不相等。即使补回原ask，当前重放仍丢弃pending，不能只补日志而不修状态过渡。

真实浏览器复现：`09-c61-ambiguity.png` → 在“选择问题解释”组点第一候选 → `10-c61-confirmed.png`显示一次有效提问/事实回答 → 刷新 → `11-c61-refreshed.png`显示零次有效提问，回答消失。未调用AI、未注入存档、未接触用户原有游玩源站，测试使用127.0.0.1:8089独立来源。

已有历史日志若没有原问上下文，不可宣称总能无损重建；需保留原档、报告不可恢复项，不能猜测玩家原问或静默标记恢复成功。

## E4：84案全档案包导入上限仍是50（P0）

`packages/mystery-core/src/save-envelope.ts:246`：`item.saves.length > 50`；导出函数225行无对应上限；UI `apps/web/components/archive-tools.tsx:12` 导出全部。

使用真实发行目录的caseId/version/hash、空命令数组，在内存创建合法归档并附真实identity校验：50案ok=true，51案ok=false，84案ok=false。未写玩家存档。

## E5：测试报告口径与证明能力（P0）

- `tools/v25-browser-audit.ts:174`：从作者问题首例提问一次；183行注入 `createCanonicalSave` 后检查结案。48条是8案×3引擎×2视口的“首问/证据区/已解存档呈现”，不是手动UI完整证明。
- 同文件139行：非Chromium的无障碍分支返回空cases且passed=true。不能称三个引擎均完成axe扫描。
- 同文件189–205行：重玩检查模式元数据，而非在浏览器重置并重新完成。
- 同文件242行：截图通过主要看bytes>5000；生成了截图不等于像素回归或人工视觉验收。
- `tools/v27-save-compatibility.ts:13`：当前生成规范存档，两边都用当前replayCommands比较，缺历史真实日志与旧期望投影，可能共同丢数据仍自比通过。
- `tools/v27-experience-audit.ts:21`：主要检查源码includes，是静态契约，不是交互达成度。
- `tools/v27-release-audit.ts:17`：报告存在/顶层passed聚合，不绑定本次源码/构建hash、runId和断言覆盖。
- Season5测试确实枚举了两套证明集与必要证据变异（`season-five.test.ts:68`附近），应保留。不是所有测试都无效；需分清测试类型。

## E6：UI结构及文案

只读AST，计量范围是文件全部JSX分支，不是一个屏幕的同时可见控件：Shell53个原生/Link交互节点、最大JSX嵌套7、19处useState/21处useEffect（含内置子组件）；Board14/5；Evidence9/6；首页12/7。

证据位置：`investigation-shell.tsx:84`、`reasoning-board.tsx:10`、`evidence-inspector.tsx:56`、`case-select.tsx:45`。

- 四工作区已统一：`game-shell.tsx:15`。
- 条件挂载使证据分页/板上连接选择/回放展开状态可能丢失；父组件保留了问题草稿和总结。见shell212行、board12行、evidence77行。
- 顶部提示、回答后动作、调查本同时重复建议；本轮03截图可见。
- “检查对应证据”只打开证据工作区，不携带对应材料定位（shell253行）；本轮04截图可见证据列表，不能据此断言所有列表强调均错误。
- C61示例实际显示“卷盘芯径是否成立？”等名词模板（`c61-missing-tape-turn.json:1952`；本轮06截图），所有案件仍使用门锁输入占位（shell250行）。
- C84语料使用“限定角度1/2/…20”等编号变体（`c84-question-corpus.ts:6`起）；数量不代表独立自然表达。
- C61仍出现“敲击因果时间链”以及离开/锁止/声音说明：`legacy-theory-workbench.tsx:14`默认回C01；本轮C61 DOM确认。这不是未知案件路由回退，而是展示配置回退。
- README徽章HUMAN_TESTING（17行）与pending不一致；“通常5–25分钟”（73行）是作者目标而非真人分布；“AI不知道真相”应改为“不向AI发送隐藏真相”。本轮不修改README。

## E7：板型、视觉与无障碍

- `reasoning-board-ui.ts:10`–32：23模式全为direct:true。`reasoning-board.tsx:43`–70复用选片/填槽/选起终点/连接；timeline有移位特例。23种语义不等于23套独立交互。
- 多数旧样式作用于不可达的非direct `.slots` 分支；新八种模式有构图区别，非全无差异。
- 限定 globals/Shell/Board/home 四CSS文件：56种间距常量、48种字号常量（含clamp端点、rem以16换算）；77种归一RGBA字面值，非渲染颜色数。缺集中spacing/type tokens。
- 首页卡片时间8px/标签7px（case-select.module.css:13）；板引导8px、时间7px、操作说明7px（reasoning-board.module.css:3/17）。本轮浏览器C61确认引导8px、time7px。
- 主色实色对比：ink/panel约14.36:1，muted/panel约5.38:1，不能代替所有透明/渐变组合检查。已放置事件片opacity .52仍可操作，存在小字号低对比风险，未在本轮实测该状态。
- Shell206行只设--case-accent，Board CSS使用--accent；本轮computed style确认--accent为空而--case-accent存在，导致依赖前者的样式无法按预期应用。
- empty/loading/error/success/focus/disabled均有源码分支；设置/证据对话框有focus trap，`/`与1–4快捷键存在，mobile四工作区存在；不等于本轮全路径无障碍通过。
- NextStepCue位于部分inert区域之外，需模态背景焦点实测；本轮未进行屏幕阅读器验证。

## E8：音频与资源

- 当前Shell静音只改变偏好和标签（shell89/138/239/358行）；唯一AudioEngine实例在未引用的 `variant-shell.tsx:177`。静态调用链未发现统一壳音景接线；未以听音测量宣称设备无声。
- `tools/v27-static-performance.ts:11`–13：initialJS只计算首页9个script src的磁盘大小，不计Worker、动态模块、SW安装预取、传输压缩；TTI/INP未知。
- `tools/prepare-static-release.ts:39`–43把几乎全部输出纳入precache；`apps/web/out/sw.js:1185`安装时cache.addAll。共1178个URL，含84案件路由、115 JS、367 SVG，预缓存磁盘预算8,164,945 bytes。实际冷网络请求次数未知，不机械等同1178次传输。
- `v27-static-performance.ts:20` 的currentCaseOnly等三项是硬编码true。模块按需执行不等于首访只下载当前案件。
- 静态首页稳态CSS无限动画0，Shell稳态0；工具加载时有pulse。减少动态有处理，但root smooth scroll仍需覆盖。源码：Shell CSS25/71/78、globals21/52。

## 本轮截图步骤与健康状态

| 步骤 | 文件 | 健康状态/证据 |
|---|---|---|
| 01 首页 | 01-home.png | 入口与季节可见；小字号和高度需要重做阅读尺度 |
| 02 C01开场 | 02-c01-opening.png | 现场/提问/证据/推断可进入；多处指导竞争 |
| 03 C01自然问答 | 03-c01-question.png | 门锁问法即时回答；回答后有重复信息 |
| 04 进入证据 | 04-c01-evidence.png | 列表可访问；“对应”入口未精确导航 |
| 05 C01推断 | 05-c01-theory.png | 可编辑入口存在；解释/链/条件/证据层级复杂 |
| 06 C61提问 | 06-c61-question.png | 模板命题不清楚，门锁占位不匹配案件 |
| 07 C61桌面推断 | 07-c61-proof-spoiler-warning.png | P0：零提问显示完整正确解释；图片含剧透 |
| 08 C61手机推断 | 08-c61-mobile-spoiler-warning.png | 多级导航占空间；同一提前曝光问题，图片含剧透 |
| 09 C61歧义 | 09-c61-ambiguity.png | 两套候选理解同时出现，重复且按钮后果不同 |
| 10 确认解释 | 10-c61-confirmed.png | 事实回答出现；旧候选条仍存在 |
| 11 刷新 | 11-c61-refreshed.png | P0：确认后的回答消失，从1次变0次 |

截图为本轮浏览器原始字节；07/08含未结案答案，请避免作为宣传图。桌面采用当前浏览器视口约1265×728，手机390×844；本轮未执行三浏览器完整矩阵。

## Phase 0：现有API与复用位置

- `useMysteryRuntime(caseId)`：`apps/web/lib/use-mystery-runtime.ts:8`，projection/events/status/dispatch/prepareQuestionRouting。
- `RuntimeWorkerRequest/Response`：`apps/web/lib/worker-protocol.ts:5`。
- `reduceGameCommand`/`projectPlayerState`/`replayCommands`：runtime657/483/898；修复先写反例，不另建UI胜负引擎。
- `validateSaveEnvelope`/`validateCompatibleSave`/`createSaveArchive`/`validateSaveArchive`：save-envelope170/216/225/241。
- `CasePresentationPatch` + `validatePresentationPatch` + `applyPresentationPatch`：presentation-patch35/117；只修已支持的公开语义。现层还允许replayChallenges改变限问额度，不能笼统称所有patch都不改变挑战行为。
- `ReasoningBoard`：board10，现有place/remove/connect/disconnect命令可复用；模型特有交互须能映射真实义务，禁止画一个不参与任何推断的模拟器冒充板型升级。
- `deriveProofReadiness`：proof-readiness22；其反馈是公共结构，不是真相判定。
- `loadReleaseContent`、`loadCaseFile`：tools/lib/release-content.ts；案件集合从profile读取，不再新增84硬编码。

## 未知与置信度

已复现不代表全部产品缺陷已枚举。缺少真实设备INP、完整三引擎操作测试、真人理解/乐趣/节奏/重玩愿望、84案逐句编辑审查。没有同行产品基准研究，不给“行业前X%”结论。模型评审与生成器共享偏差，不能当作独立真人样本。
