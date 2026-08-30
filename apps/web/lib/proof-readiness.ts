import type { PlayerProjection, TheoryDraft } from "@turtle-soup/mystery-core";

export type ProofStep = "claim" | "board" | "chain" | "proof";

export interface ProofReadiness {
  hypothesisLabel: string;
  boardPlaced: number;
  boardTotal: number;
  eventCount: number;
  evidenceCount: number;
  motiveRequired: boolean;
  motiveSelected: boolean;
  canSubmit: boolean;
  nextStep: ProofStep;
  nextLabel: string;
}

/**
 * UI-only summary derived exclusively from the public player projection.
 * It describes the player's current structure, never correctness or hidden obligations.
 */
export function deriveProofReadiness(projection: PlayerProjection, active: TheoryDraft): ProofReadiness {
  const option = projection.theoryOptions.find((item) => item.id === active.hypothesisId);
  const boardTotal = projection.reasoningBoards.reduce((sum, board) => sum + board.slots.length, 0);
  const boardPlaced = projection.reasoningBoards.reduce((sum, board) => sum + board.slots.filter((slot) => slot.itemId).length, 0);
  const motiveRequired = Boolean(option?.motiveOptions.length);
  const motiveSelected = !motiveRequired || Boolean(active.motiveKey);
  let nextStep: ProofStep = "proof", nextLabel = projection.canSubmit ? "可以提交检验" : "继续核对当前结构";
  if (!active.hypothesisId) { nextStep = "claim"; nextLabel = "先选择一个暂定解释"; }
  else if (boardTotal > 0 && boardPlaced < boardTotal) { nextStep = "board"; nextLabel = "继续放置推理板"; }
  else if (active.eventIds.length === 0) { nextStep = "chain"; nextLabel = "建立第一段事件链"; }
  else if (active.evidenceIds.length === 0) { nextStep = "proof"; nextLabel = "加入一件证据"; }
  else if (!motiveSelected) { nextStep = "proof"; nextLabel = "选择驱动条件"; }
  return { hypothesisLabel: option?.label ?? "尚未选择", boardPlaced, boardTotal, eventCount: active.eventIds.length, evidenceCount: active.evidenceIds.length, motiveRequired, motiveSelected, canSubmit: projection.canSubmit, nextStep, nextLabel };
}

export function hasExaminedEvidence(projection: Pick<PlayerProjection, "evidence">): boolean {
  return projection.evidence.some((item) => ["examined", "connected", "verified"].includes(item.state));
}
