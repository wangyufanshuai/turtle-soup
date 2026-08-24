import type { GameEvent, PlayerProjection } from "@turtle-soup/mystery-core";

export type MomentumStage = "observe" | "verify" | "triage" | "model" | "test" | "closed";
export type MomentumArea = "scene" | "questions" | "theory";

export interface MomentumBeat {
  id: "observe" | "verify" | "commit";
  label: string;
  done: boolean;
}

export interface InvestigationMomentum {
  stage: MomentumStage;
  score: number;
  headline: string;
  detail: string;
  nextArea: MomentumArea;
  nextAction: string;
  beats: MomentumBeat[];
  inspectedEvidenceCount: number;
  linkedEvidenceCount: number;
  heldEvidenceCount: number;
  collectionRisk: boolean;
  proofReady: boolean;
  friction: "none" | "repeat" | "ambiguity" | "rejected" | "proof-gap";
}

type PublicProjection = Pick<PlayerProjection,
  "transcript" | "evidence" | "locations" | "theoryDrafts" | "activeTheoryId" |
  "reasoningBoards" | "canSubmit" | "solved"
>;

const DEFAULT_OPENING_MOVES = ["固定现场", "验证事实", "提交取舍"] as const;

function latestFriction(events: readonly GameEvent[]): InvestigationMomentum["friction"] {
  const event = events.at(-1);
  if (event?.type === "question_rejected") return "rejected";
  if (event?.type === "interpretation_required") return "ambiguity";
  if (event?.type === "question_answered" && event.entry.repeated) return "repeat";
  if (event?.type === "theory_judged" && event.judgement !== "solved") return "proof-gap";
  return "none";
}

/**
 * Public-only experience proxy. It deliberately measures interaction momentum,
 * never correctness: no hidden facts, proof sets, canonical hypotheses or IDs
 * are accepted by this function.
 */
export function deriveInvestigationMomentum(
  projection: PublicProjection,
  events: readonly GameEvent[] = [],
  openingMoves: readonly [string, string, string] = DEFAULT_OPENING_MOVES,
): InvestigationMomentum {
  const active = projection.theoryDrafts.find((draft) => draft.id === projection.activeTheoryId);
  const inspectedEvidenceCount = projection.evidence.filter((item) => !["available", "discovered", "dismissed"].includes(item.state)).length;
  const linkedEvidenceCount = active?.evidenceIds.length ?? 0;
  const heldEvidenceCount = projection.evidence.filter((item) => item.state !== "dismissed").length;
  const visited = projection.locations.some((location) => location.visited);
  const observed = visited || inspectedEvidenceCount > 0;
  const uniqueAnswers = projection.transcript.filter((entry) => !entry.repeated).length;
  const verified = uniqueAnswers > 0;
  const boardPlacements = projection.reasoningBoards.reduce((sum, board) => sum + board.slots.filter((slot) => slot.itemId).length, 0);
  const modeled = Boolean(active?.eventIds.length || linkedEvidenceCount || boardPlacements);
  const proofReady = projection.canSubmit;
  const collectionRisk = inspectedEvidenceCount >= Math.min(4, Math.max(2, projection.evidence.length - 1)) && linkedEvidenceCount === 0 && !projection.solved;

  const beats: MomentumBeat[] = [
    { id: "observe", label: openingMoves[0], done: observed },
    { id: "verify", label: openingMoves[1], done: verified },
    { id: "commit", label: openingMoves[2], done: modeled },
  ];

  const score = projection.solved ? 100 : Math.min(96,
    (observed ? 18 : 0)
    + Math.min(24, uniqueAnswers * 8)
    + Math.min(18, inspectedEvidenceCount * 6)
    + Math.min(16, linkedEvidenceCount * 8)
    + Math.min(12, (active?.eventIds.length ?? 0) * 3 + boardPlacements * 2)
    + (proofReady ? 8 : 0));

  if (projection.solved) return {
    stage: "closed", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk: false, proofReady: true, friction: "none", nextArea: "theory",
    headline: "证明已经闭合",
    detail: "回放会把每一拍重新连接到公开证据；这次结案来自证明，不是猜中一句谜底。",
    nextAction: "查看证明回放",
  };

  const friction = latestFriction(events);
  if (!observed) return {
    stage: "observe", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk, proofReady, friction, nextArea: "scene", headline: "先制造第一处确定性",
    detail: "检查一个位置即可。你不需要先读完全部档案，也不会因第一次操作进入错误路线。",
    nextAction: "检查现场",
  };
  if (!verified) return {
    stage: "verify", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk, proofReady, friction, nextArea: "questions", headline: "把观察变成可判定问题",
    detail: friction === "ambiguity" || friction === "rejected" ? "缩小到一个对象、动作、时间或来源；安全关闭不会消耗调查状态。" : "现在验证一个事实。答案会确认或排除前提，不会直接替你写出谜底。",
    nextAction: "验证一个事实",
  };
  if (inspectedEvidenceCount < 2) return {
    stage: "triage", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk, proofReady, friction, nextArea: "scene", headline: "只比较两份来源",
    detail: "找一份支持当前想法的材料，再找一份可能推翻它的材料；无需清空证据架。",
    nextAction: "比较证据",
  };
  if (!modeled) return {
    stage: "model", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk, proofReady, friction, nextArea: "theory", headline: collectionRisk ? "停止收集，开始取舍" : "把一条证据接入暂定解释",
    detail: collectionRisk ? "你已经检查了足够多的公开材料。先选 1–2 件接入证明，失败反馈会指出缺口类别。" : "暂定理论可以被撤销。先放入一个事件或一件证据，再用矛盾检验它。",
    nextAction: "建立暂定解释",
  };

  return {
    stage: "test", score, beats, inspectedEvidenceCount, linkedEvidenceCount, heldEvidenceCount,
    collectionRisk, proofReady, friction, nextArea: "theory",
    headline: proofReady ? "已有可检验结构" : "继续闭合当前关系",
    detail: proofReady
      ? "可以先提交一次。若证明不足，系统只返回时间、空间、来源、身份、测量、状态或替代路径类别。"
      : "保留已成立部分，补齐当前板或事件链；不必继续检查全部证据。",
    nextAction: proofReady ? "检验证明" : "继续推理",
  };
}
