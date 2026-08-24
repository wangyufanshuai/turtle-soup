export interface GoldenExperienceSpec {
  cadence: string;
  sceneLabel: string;
  sceneHint: string;
  evidenceBehavior: string;
  evidenceAction: string;
  insight: string;
  replayTone: string;
}

export const GOLDEN_CASE_IDS = [
  "c01-cold-room-knock", "c03-second-shadow", "c06-nonexistent-ticket",
  "c13-second-waterline", "c17-twelve-strikes", "c24-turned-painting",
  "c25-silent-second-bell", "c33-early-late-arrival", "c36-no-one-left-terminal",
  "c37-zeroed-pressure-gauge", "c48-two-point-calibration", "c60-last-sample-before-stop",
] as const;

export const GOLDEN_EXPERIENCE: Readonly<Record<string, GoldenExperienceSpec>> = {
  "c01-cold-room-knock": { cadence: "observe-ask-unlock", sceneLabel: "02:00 · 冷藏室封闭走廊", sceneHint: "声音是真的；门内有人仍需证明", evidenceBehavior: "freeze-frame", evidenceAction: "逐帧核对", insight: "门的状态、声音来源与人的位置可以同时为真，却不必来自同一事件。", replayTone: "three-knocks" },
  "c03-second-shadow": { cadence: "witness-identity-crosscheck", sceneLabel: "00:00 · 剧院后台交接", sceneHint: "证人看见的是外观，不是身份证明", evidenceBehavior: "role-overlay", evidenceAction: "叠合身份层", insight: "把角色、服装和真实人物拆开后，“同一个演员”不再是可靠前提。", replayTone: "curtain-reveal" },
  "c06-nonexistent-ticket": { cadence: "scan-cache-display", sceneLabel: "23:52 · 离线码头闸机", sceneHint: "屏幕时间与扫描时间来自不同层", evidenceBehavior: "ledger-sync", evidenceAction: "校对时间戳", insight: "记录写入得晚，不代表人行动得晚；先确定数据在哪一层产生。", replayTone: "harbor-sync" },
  "c13-second-waterline": { cadence: "level-weight-release", sceneLabel: "密闭容器 · 第二条水线", sceneHint: "没有加水，也可能改变排水体积", evidenceBehavior: "fluid-level", evidenceAction: "比对液面", insight: "液面变化证明浸没体积改变，不自动证明容器增加了液体。", replayTone: "weight-release" },
  "c17-twelve-strikes": { cadence: "dial-gear-strike", sceneLabel: "11:00 · 分离的钟面与报时轮", sceneHint: "两套机构各自真实，却不再同步", evidenceBehavior: "gear-phase", evidenceAction: "对齐轮系", insight: "钟面与敲击不是同一个计时输出；脱耦后，两条记录可以同时真实。", replayTone: "gear-desync" },
  "c24-turned-painting": { cadence: "gallery-service-panorama", sceneLabel: "闭馆展厅 · 服务侧旋转墙", sceneHint: "先固定墙、画与镜头各自的参照系", evidenceBehavior: "wall-pivot", evidenceAction: "旋转参照", insight: "画框没有在墙上转动；是承载它的墙体改变了朝向。", replayTone: "wall-turn" },
  "c25-silent-second-bell": { cadence: "trigger-debounce-output", sceneLabel: "门铃控制器 · 双触发窗口", sceneHint: "声响次数不是触发次数", evidenceBehavior: "debounce-trace", evidenceAction: "展开触发沿", insight: "控制器合并了输出，却没有抹去两次物理触发。", replayTone: "debounce-pulse" },
  "c33-early-late-arrival": { cadence: "clock-source-alignment", sceneLabel: "三套时钟 · 同一到场事件", sceneHint: "先标出每条记录使用的时间基准", evidenceBehavior: "clock-alignment", evidenceAction: "对齐时基", insight: "“先到”与“迟到”分别来自不同的钟；矛盾存在于比较方式，而非行动本身。", replayTone: "clock-lock" },
  "c36-no-one-left-terminal": { cadence: "count-card-route", sceneLabel: "终点站 · 换轨后的乘降记录", sceneHint: "计数、刷卡与调度各自只看见一层", evidenceBehavior: "passenger-count", evidenceAction: "核对计数口径", insight: "“无人下车”只描述某个计数边界，不等于车上没有人完成转移。", replayTone: "terminal-count" },
  "c37-zeroed-pressure-gauge": { cadence: "zero-reference-temperature", sceneLabel: "压力校准台 · 温漂零点", sceneHint: "指针回零，只说明回到了当时的显示基准", evidenceBehavior: "zero-drift", evidenceAction: "检查零点漂移", insight: "零点也会移动；显示为零不等于真实量为零。", replayTone: "needle-return" },
  "c48-two-point-calibration": { cadence: "endpoints-midcurve-band", sceneLabel: "两点校准 · 未被约束的中段", sceneHint: "端点重合不能证明整条曲线正确", evidenceBehavior: "curve-fit", evidenceAction: "拟合中段曲线", insight: "两个相同校准点只能约束两端；真正的偏差藏在没有被测量的中段。", replayTone: "curve-bend" },
  "c60-last-sample-before-stop": { cadence: "command-buffer-sample-display", sceneLabel: "终止链 · 最后一窗采样", sceneHint: "停止命令、执行、采样与显示并非同一拍", evidenceBehavior: "buffer-window", evidenceAction: "展开缓存窗口", insight: "最后一条样本可以晚于停止命令，却早于停止真正生效。", replayTone: "final-window" },
};

export function goldenExperience(caseId: string): GoldenExperienceSpec | undefined {
  return GOLDEN_EXPERIENCE[caseId];
}
