import type { ReasoningBoardMode } from "@turtle-soup/mystery-core";

export const REASONING_BOARD_MODES = [
  "timeline", "state-trace", "spatial-map", "provenance-chain", "identity-matrix", "measurement-model", "sampling-window", "aggregate-constraint",
  "calibration-curve", "control-loop", "signal-chain", "network-topology", "uncertainty-band", "reference-frame", "queue-model",
  "causal-graph", "material-balance", "threshold-ladder", "occlusion-map", "acoustic-path", "interval-logic", "counterfactual-tree", "capacity-model",
] as const satisfies readonly ReasoningBoardMode[];

export const REASONING_BOARD_UI: Record<ReasoningBoardMode, { label: string; guide: string; direct: boolean }> = {
  timeline: { label: "时间链", guide: "把事件直接放入时间槽；使用箭头调整先后，再连接关键因果。", direct: true },
  "state-trace": { label: "状态转换", guide: "选择事件，再放入触发、保持、复位或观察状态；相邻状态必须由公开证据支持。", direct: true },
  "spatial-map": { label: "空间参照", guide: "先固定参照物，再把路径与位置放到对应区域；位置标签不等于真实移动。", direct: true },
  "provenance-chain": { label: "来源保管链", guide: "沿来源与保管顺序追踪记录，确认每次转移由谁证明。", direct: true },
  "identity-matrix": { label: "身份矩阵", guide: "逐格分开人物、外观、岗位与凭证；同一标签不能替代人物身份。", direct: true },
  "measurement-model": { label: "测量基准", guide: "区分真实量、基准和显示值，标出校正关系。", direct: true },
  "sampling-window": { label: "采样窗口", guide: "排列采集、缓冲与显示窗口，避免把呈现时间当作发生时间。", direct: true },
  "aggregate-constraint": { label: "聚合约束", guide: "把各分量接入总体约束，检查单项合规是否仍导致总量超限。", direct: true },
  "calibration-curve": { label: "校准曲线", guide: "把公开事件放到参考点、中段和误差区，再连接校准与插值关系。", direct: true },
  "control-loop": { label: "控制回路", guide: "沿命令、反馈和稳定状态追踪控制回路，不把界面状态当成执行结果。", direct: true },
  "signal-chain": { label: "信号链", guide: "从采集端开始逐段放置信号，直接连接缓冲、传输、回放与显示边界。", direct: true },
  "network-topology": { label: "网络拓扑", guide: "把数据包放回路由拓扑，检查去重、确认和重传关系。", direct: true },
  "uncertainty-band": { label: "不确定性带", guide: "把估计值和不确定性范围一起排列，避免把连续图形当成连续采样。", direct: true },
  "reference-frame": { label: "参照系", guide: "先固定坐标和基准，再比较位置、方向或高度。", direct: true },
  "queue-model": { label: "队列模型", guide: "排列进入、合并和离开队列的事件，验证一次输出是否代表多个来源。", direct: true },
  "causal-graph": { label: "因果图", guide: "从可观察原因出发，经过中介状态连接结果；相关不等于因果。", direct: true },
  "material-balance": { label: "物质守恒", guide: "分别放置流入、保留与流出，检查计数变化能否由同一批物质闭合。", direct: true },
  "threshold-ladder": { label: "阈值阶梯", guide: "把观测、阈值与状态放上阶梯，区分达到、跨过与滞回保持。", direct: true },
  "occlusion-map": { label: "遮挡图", guide: "依次固定观察者、遮挡物与目标，重建当时真正可见的路径。", direct: true },
  "acoustic-path": { label: "声学路径", guide: "连接声源、传播介质与接收端，比较直达、反射和抵消路径。", direct: true },
  "interval-logic": { label: "区间逻辑", guide: "排列开始、重叠与结束区间；同一时段不代表同一瞬间。", direct: true },
  "counterfactual-tree": { label: "反事实树", guide: "先放置错误假设，再沿如果/否则分支附上能够排除它的公开证据。", direct: true },
  "capacity-model": { label: "容量模型", guide: "把需求、处理容量与积压分开，追踪重试如何改变队列而不改变实体。", direct: true },
};

export const REASONING_RELATION_LABELS: Record<string, string> = {
  causes: "导致", precedes: "先于", explains: "解释", "transitions-to": "转换为", synchronizes: "同步于", "moves-to": "移动至", overlaps: "重叠",
  "transfers-to": "转移至", "recorded-by": "记录于", verifies: "验证", "appears-as": "呈现为", "assigned-to": "分配给", excludes: "排除",
  "measured-against": "相对测量", corrects: "校正", "sampled-before": "先采样", buffers: "缓冲至", "contributes-to": "计入", "sums-with": "合计", exceeds: "超过",
  calibrates: "校准", interpolates: "插值", bounds: "界定", commands: "命令", "feeds-back": "反馈", settles: "稳定", propagates: "传播", reconstructs: "重建",
  "routes-through": "经过路由", deduplicates: "去重", acknowledges: "确认", reframes: "重设参照", projects: "投影", aligns: "对齐", enqueues: "入队", merges: "合并", dequeues: "出队",
  triggers: "触发", "flows-in": "流入", retains: "保留", "flows-out": "流出", reaches: "达到", crosses: "跨过", holds: "保持", sees: "看到", occludes: "遮挡", reveals: "显露",
  "propagates-to": "传播至", "reflects-at": "反射于", "arrives-at": "抵达", "ends-at": "结束于", if: "如果", otherwise: "否则", enters: "进入", "bounded-by": "受限于", "backs-up": "积压为",
};

export function reasoningBoardUi(mode: ReasoningBoardMode) {
  return REASONING_BOARD_UI[mode];
}
