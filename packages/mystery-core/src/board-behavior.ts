import type { ReasoningBoardMode } from "./types.ts";

export interface ReasoningBoardBehavior {
  mode: ReasoningBoardMode;
  interaction: "calibrate" | "control" | "propagate" | "route" | "bound" | "reframe" | "queue" | "sequence" | "transition" | "map" | "source" | "identity" | "measure" | "sample" | "aggregate";
  slotRoles: string[];
  connectionVerbs: string[];
  requiredDistinctRoles: number;
}

const behaviors: Record<ReasoningBoardMode, Omit<ReasoningBoardBehavior, "mode">> = {
  timeline: { interaction: "sequence", slotRoles: ["事件", "先后", "同步"], connectionVerbs: ["先于", "同步于", "解释"], requiredDistinctRoles: 2 },
  "state-trace": { interaction: "transition", slotRoles: ["初态", "触发", "新态"], connectionVerbs: ["转换为", "导致", "解释"], requiredDistinctRoles: 3 },
  "spatial-map": { interaction: "map", slotRoles: ["位置", "边界", "路径"], connectionVerbs: ["移动至", "重叠", "先于"], requiredDistinctRoles: 3 },
  "provenance-chain": { interaction: "source", slotRoles: ["来源", "保管", "证明"], connectionVerbs: ["转移至", "记录于", "验证"], requiredDistinctRoles: 3 },
  "identity-matrix": { interaction: "identity", slotRoles: ["外观", "人物", "凭证"], connectionVerbs: ["呈现为", "分配给", "排除"], requiredDistinctRoles: 3 },
  "measurement-model": { interaction: "measure", slotRoles: ["真实量", "基准", "显示"], connectionVerbs: ["相对测量", "校正", "解释"], requiredDistinctRoles: 3 },
  "sampling-window": { interaction: "sample", slotRoles: ["采集", "缓冲", "呈现"], connectionVerbs: ["先采样", "缓冲至", "解释"], requiredDistinctRoles: 3 },
  "aggregate-constraint": { interaction: "aggregate", slotRoles: ["分量", "合计", "阈值"], connectionVerbs: ["计入", "合计", "超过"], requiredDistinctRoles: 3 },
  "calibration-curve": { interaction: "calibrate", slotRoles: ["端点", "中段", "误差带"], connectionVerbs: ["校准", "插值", "界定"], requiredDistinctRoles: 3 },
  "control-loop": { interaction: "control", slotRoles: ["命令", "反馈", "执行"], connectionVerbs: ["命令", "反馈", "稳定"], requiredDistinctRoles: 3 },
  "signal-chain": { interaction: "propagate", slotRoles: ["发送", "缓存", "显示"], connectionVerbs: ["传播", "缓冲", "重建"], requiredDistinctRoles: 3 },
  "network-topology": { interaction: "route", slotRoles: ["路由", "去重", "确认"], connectionVerbs: ["经过路由", "去重", "确认"], requiredDistinctRoles: 3 },
  "uncertainty-band": { interaction: "bound", slotRoles: ["估计", "范围", "排除"], connectionVerbs: ["界定", "重叠", "排除"], requiredDistinctRoles: 3 },
  "reference-frame": { interaction: "reframe", slotRoles: ["基准", "投影", "对齐"], connectionVerbs: ["重设参照", "投影", "对齐"], requiredDistinctRoles: 3 },
  "queue-model": { interaction: "queue", slotRoles: ["入队", "合并", "出队"], connectionVerbs: ["入队", "合并", "出队"], requiredDistinctRoles: 3 },
};

/**
 * A small presentation-level variant lets a multi-stage terminal board expose
 * its final hand-off explicitly. It does not change allowed relations or proof
 * obligations; it only gives the fourth visible slot a domain-appropriate role.
 */
export function reasoningBoardBehavior(mode: ReasoningBoardMode, variant: "standard" | "terminal" = "standard"): ReasoningBoardBehavior {
  const behavior = behaviors[mode];
  if (variant === "terminal") return { mode, ...behavior, slotRoles: [...behavior.slotRoles, "终止"] };
  return { mode, ...behavior };
}

export function validateBoardBehavior(mode: ReasoningBoardMode, allowedRelations: string[]): boolean {
  const behavior = reasoningBoardBehavior(mode);
  const relationMap: Record<string, string> = { "先于": "precedes", "同步于": "synchronizes", "解释": "explains", "转换为": "transitions-to", "导致": "causes", "移动至": "moves-to", "重叠": "overlaps", "转移至": "transfers-to", "记录于": "recorded-by", "验证": "verifies", "呈现为": "appears-as", "分配给": "assigned-to", "排除": "excludes", "相对测量": "measured-against", "校正": "corrects", "先采样": "sampled-before", "缓冲": "buffers", "缓冲至": "buffers", "计入": "contributes-to", "合计": "sums-with", "超过": "exceeds", "校准": "calibrates", "插值": "interpolates", "界定": "bounds", "命令": "commands", "反馈": "feeds-back", "稳定": "settles", "传播": "propagates", "重建": "reconstructs", "经过路由": "routes-through", "去重": "deduplicates", "确认": "acknowledges", "重设参照": "reframes", "投影": "projects", "对齐": "aligns", "入队": "enqueues", "合并": "merges", "出队": "dequeues" };
  return behavior.connectionVerbs.every((verb) => allowedRelations.includes(relationMap[verb] ?? verb));
}
