export interface GoldenExperienceSpec {
  cadence: string;
  sceneLabel: string;
  sceneHint: string;
  evidenceBehavior: string;
  evidenceAction: string;
  insight: string;
  replayTone: string;
  openingMoves: readonly [string, string, string];
  closureLine: string;
}

export interface GoldenPathHints {
  concept: string;
  evidenceCategory: string;
  proofObligation: string;
}

export interface GoldenPathStep {
  step: number;
  caseId: string;
  tier: "起步" | "辨析" | "系统" | "交叉验证" | "综合证明";
  estimatedMinutes: { min: number; max: number };
  prerequisiteSkill: string;
  nextSkill: string;
  hints: GoldenPathHints;
}

export const GOLDEN_CASE_IDS = [
  "c01-cold-room-knock", "c03-second-shadow", "c06-nonexistent-ticket",
  "c13-second-waterline", "c17-twelve-strikes", "c24-turned-painting",
  "c25-silent-second-bell", "c33-early-late-arrival", "c36-no-one-left-terminal",
  "c37-zeroed-pressure-gauge", "c48-two-point-calibration", "c60-last-sample-before-stop",
] as const;

// Curated first-play progression. This is intentionally separate from
// GOLDEN_CASE_IDS, which defines broad browser/visual regression coverage.
// Every case remains directly accessible; this list is guidance, not a lock.
export const GOLDEN_PATH_CASE_IDS = [
  "c01-cold-room-knock",
  "c03-second-shadow",
  "c13-second-waterline",
  "c06-nonexistent-ticket",
  "c17-twelve-strikes",
  "c24-turned-painting",
  "c33-early-late-arrival",
  "c48-two-point-calibration",
  "c60-last-sample-before-stop",
] as const;

export const GOLDEN_PATH: readonly GoldenPathStep[] = [
  { step: 1, caseId: "c01-cold-room-knock", tier: "起步", estimatedMinutes: { min: 5, max: 15 }, prerequisiteSkill: "无需前置", nextSkill: "把观察拆成可验证事实", hints: { concept: "先区分声音、门与人的位置，它们不必属于同一事件。", evidenceCategory: "检查门的状态、声音来源与人员位置三类来源。", proofObligation: "你的证明还需要闭合时间关系。" } },
  { step: 2, caseId: "c03-second-shadow", tier: "辨析", estimatedMinutes: { min: 8, max: 20 }, prerequisiteSkill: "事实提问", nextSkill: "分离外观、角色与人物", hints: { concept: "证词可以准确描述外观，却未必证明人物身份。", evidenceCategory: "比较证词来源、服装物件与后台位置记录。", proofObligation: "你的证明还需要闭合身份关系。" } },
  { step: 3, caseId: "c13-second-waterline", tier: "辨析", estimatedMinutes: { min: 8, max: 18 }, prerequisiteSkill: "身份与表象分离", nextSkill: "追踪状态转换与守恒量", hints: { concept: "液面变化并不只由加入液体造成。", evidenceCategory: "检查浸没物、温度条件与容器状态。", proofObligation: "你的证明还需要闭合状态转换或测量关系。" } },
  { step: 4, caseId: "c06-nonexistent-ticket", tier: "系统", estimatedMinutes: { min: 10, max: 22 }, prerequisiteSkill: "状态转换", nextSkill: "区分行动时间与记录时间", hints: { concept: "一条真实记录可能在行动之后才被写入。", evidenceCategory: "核对扫描端、缓存层与显示端的来源。", proofObligation: "你的证明还需要闭合来源或时间关系。" } },
  { step: 5, caseId: "c17-twelve-strikes", tier: "系统", estimatedMinutes: { min: 10, max: 20 }, prerequisiteSkill: "来源与时间", nextSkill: "建立机械因果链", hints: { concept: "同一设备可以包含彼此脱耦的输出机构。", evidenceCategory: "检查表针传动、报时轮与维修状态。", proofObligation: "你的证明还需要闭合状态转换关系。" } },
  { step: 6, caseId: "c24-turned-painting", tier: "交叉验证", estimatedMinutes: { min: 15, max: 25 }, prerequisiteSkill: "机械因果", nextSkill: "同时处理空间与来源", hints: { concept: "先固定你用来描述方向的参照物。", evidenceCategory: "检查墙体结构、服务侧路径与监控成像方式。", proofObligation: "你的证明还需要闭合空间或替代路径。" } },
  { step: 7, caseId: "c33-early-late-arrival", tier: "交叉验证", estimatedMinutes: { min: 13, max: 24 }, prerequisiteSkill: "多来源交叉验证", nextSkill: "校准不同时间基准", hints: { concept: "互相矛盾的先后顺序可能来自不同的钟。", evidenceCategory: "给门禁、录像与人员记录分别标注时间来源。", proofObligation: "你的证明还需要闭合时间基准或来源关系。" } },
  { step: 8, caseId: "c48-two-point-calibration", tier: "交叉验证", estimatedMinutes: { min: 10, max: 20 }, prerequisiteSkill: "多时间基准", nextSkill: "理解测量模型与不确定区间", hints: { concept: "两个端点正确，不能约束中间整条曲线。", evidenceCategory: "检查校准点、中段样本与误差范围。", proofObligation: "你的证明还需要闭合测量关系。" } },
  { step: 9, caseId: "c60-last-sample-before-stop", tier: "综合证明", estimatedMinutes: { min: 15, max: 25 }, prerequisiteSkill: "时间、来源与测量综合", nextSkill: "完成多板因果证明", hints: { concept: "命令发出、执行生效、采样和显示是四个时刻。", evidenceCategory: "分别追踪控制链、信号链与采样窗口。", proofObligation: "你的证明还需要闭合当前缺口类别对应的推理板。" } },
] as const;

export function goldenPathStep(caseId: string): GoldenPathStep | undefined {
  return GOLDEN_PATH.find((step) => step.caseId === caseId);
}

export const GOLDEN_EXPERIENCE: Readonly<Record<string, GoldenExperienceSpec>> = {
  "c01-cold-room-knock": { cadence: "observe-ask-unlock", sceneLabel: "02:00 · 冷藏室封闭走廊", sceneHint: "声音是真的；门内有人仍需证明", evidenceBehavior: "freeze-frame", evidenceAction: "逐帧核对", insight: "门的状态、声音来源与人的位置可以同时为真，却不必来自同一事件。", replayTone: "three-knocks", openingMoves: ["检查门与走廊", "验证声音来源", "提交一条时间链"], closureLine: "三下敲击被拆成了可追溯的三段事件。" },
  "c03-second-shadow": { cadence: "witness-identity-crosscheck", sceneLabel: "00:00 · 剧院后台交接", sceneHint: "证人看见的是外观，不是身份证明", evidenceBehavior: "role-overlay", evidenceAction: "叠合身份层", insight: "把角色、服装和真实人物拆开后，“同一个演员”不再是可靠前提。", replayTone: "curtain-reveal", openingMoves: ["固定证词来源", "拆开外观身份", "交叉验证位置"], closureLine: "幕布落下时，角色、服装和人物终于各归其位。" },
  "c06-nonexistent-ticket": { cadence: "scan-cache-display", sceneLabel: "23:52 · 离线码头闸机", sceneHint: "屏幕时间与扫描时间来自不同层", evidenceBehavior: "ledger-sync", evidenceAction: "校对时间戳", insight: "记录写入得晚，不代表人行动得晚；先确定数据在哪一层产生。", replayTone: "harbor-sync", openingMoves: ["核对扫描端", "区分写入时间", "连接来源链"], closureLine: "同一张票的行动时间与显示时间被重新对齐。" },
  "c13-second-waterline": { cadence: "level-weight-release", sceneLabel: "密闭容器 · 第二条水线", sceneHint: "没有加水，也可能改变排水体积", evidenceBehavior: "fluid-level", evidenceAction: "比对液面", insight: "液面变化证明浸没体积改变，不自动证明容器增加了液体。", replayTone: "weight-release", openingMoves: ["确认液面变化", "追踪浸没状态", "检验体积守恒"], closureLine: "第二条水线不再是魔术，而是一段完整的状态转换。" },
  "c17-twelve-strikes": { cadence: "dial-gear-strike", sceneLabel: "11:00 · 分离的钟面与报时轮", sceneHint: "两套机构各自真实，却不再同步", evidenceBehavior: "gear-phase", evidenceAction: "对齐轮系", insight: "钟面与敲击不是同一个计时输出；脱耦后，两条记录可以同时真实。", replayTone: "gear-desync", openingMoves: ["分别记录输出", "验证维修状态", "闭合机械因果"], closureLine: "第十二声落下，两套真实却脱耦的机构重新显形。" },
  "c24-turned-painting": { cadence: "gallery-service-panorama", sceneLabel: "闭馆展厅 · 服务侧旋转墙", sceneHint: "先固定墙、画与镜头各自的参照系", evidenceBehavior: "wall-pivot", evidenceAction: "旋转参照", insight: "画框没有在墙上转动；是承载它的墙体改变了朝向。", replayTone: "wall-turn", openingMoves: ["固定空间参照", "核对服务侧来源", "排除替代路径"], closureLine: "画没有违背封馆记录；改变的是承载它的空间。" },
  "c25-silent-second-bell": { cadence: "trigger-debounce-output", sceneLabel: "门铃控制器 · 双触发窗口", sceneHint: "声响次数不是触发次数", evidenceBehavior: "debounce-trace", evidenceAction: "展开触发沿", insight: "控制器合并了输出，却没有抹去两次物理触发。", replayTone: "debounce-pulse", openingMoves: ["分开触发与声响", "检查防抖窗口", "还原状态轨迹"], closureLine: "没有响起的第二次门铃，留下了完整的触发边沿。" },
  "c33-early-late-arrival": { cadence: "clock-source-alignment", sceneLabel: "三套时钟 · 同一到场事件", sceneHint: "先标出每条记录使用的时间基准", evidenceBehavior: "clock-alignment", evidenceAction: "对齐时基", insight: "“先到”与“迟到”分别来自不同的钟；矛盾存在于比较方式，而非行动本身。", replayTone: "clock-lock", openingMoves: ["标注三套时钟", "锁定记录来源", "统一比较基准"], closureLine: "三套钟没有说谎；被纠正的是比较它们的方法。" },
  "c36-no-one-left-terminal": { cadence: "count-card-route", sceneLabel: "终点站 · 换轨后的乘降记录", sceneHint: "计数、刷卡与调度各自只看见一层", evidenceBehavior: "passenger-count", evidenceAction: "核对计数口径", insight: "“无人下车”只描述某个计数边界，不等于车上没有人完成转移。", replayTone: "terminal-count", openingMoves: ["确认计数边界", "核对刷卡来源", "连接调度路线"], closureLine: "终点站的零，并没有抹去边界之外发生的转移。" },
  "c37-zeroed-pressure-gauge": { cadence: "zero-reference-temperature", sceneLabel: "压力校准台 · 温漂零点", sceneHint: "指针回零，只说明回到了当时的显示基准", evidenceBehavior: "zero-drift", evidenceAction: "检查零点漂移", insight: "零点也会移动；显示为零不等于真实量为零。", replayTone: "needle-return", openingMoves: ["区分显示与真实量", "检查温度基准", "建立校准曲线"], closureLine: "指针回到零点，测量基准却被完整追了回来。" },
  "c48-two-point-calibration": { cadence: "endpoints-midcurve-band", sceneLabel: "两点校准 · 未被约束的中段", sceneHint: "端点重合不能证明整条曲线正确", evidenceBehavior: "curve-fit", evidenceAction: "拟合中段曲线", insight: "两个相同校准点只能约束两端；真正的偏差藏在没有被测量的中段。", replayTone: "curve-bend", openingMoves: ["锁定两个端点", "检查中段样本", "约束误差区间"], closureLine: "两点之间不再是一条想当然的直线，而是被证据约束的曲线。" },
  "c60-last-sample-before-stop": { cadence: "command-buffer-sample-display", sceneLabel: "终止链 · 最后一窗采样", sceneHint: "停止命令、执行、采样与显示并非同一拍", evidenceBehavior: "buffer-window", evidenceAction: "展开缓存窗口", insight: "最后一条样本可以晚于停止命令，却早于停止真正生效。", replayTone: "final-window", openingMoves: ["分开四类时刻", "逐板闭合链路", "统一提交终止链"], closureLine: "最后一条样本终于落在命令、执行、采样与显示之间的正确位置。" },
};

export function goldenExperience(caseId: string): GoldenExperienceSpec | undefined {
  return GOLDEN_EXPERIENCE[caseId];
}
