import type {
  GameEvent,
  PlayerProjection,
  ReasoningBoardProjection,
} from "@turtle-soup/mystery-core";

/** These are public wording choices, not additional query aliases or truth rules. */
export function questionStarters(scaffolds: PlayerProjection["questionScaffolds"]) {
  const seen = new Set<string>();
  return scaffolds
    .filter((candidate) => {
      if (candidate.starterEligible === false) return false;
      const label = candidate.label.trim();
      if (!label || seen.has(label) || /是否成立[？?]?$|限定角度\d|按第\d+种理解/u.test(label))
        return false;
      seen.add(label);
      return true;
    })
    .slice(0, 3);
}

export function questionPlaceholder(scaffolds: PlayerProjection["questionScaffolds"]): string {
  const first = questionStarters(scaffolds)[0];
  return first ? `例如：${first.label}` : "写下你想验证的一个动作、时间或来源关系…";
}

export interface QuestionAttempt {
  rawText: string;
  answered: boolean;
}

export function shouldPrepareQuestionRecovery(
  event: GameEvent,
  lastRouted: GameEvent | undefined,
  mode: PlayerProjection["replayMode"],
): boolean {
  return event.type === "question_rejected" && event !== lastRouted && mode !== "no-scaffolds";
}

/** Pending core interpretations can outlive a rejected newer question. The
 * recovery UI follows the last submitted attempt, never the currently edited
 * draft; an unsubmitted edit must not discard a valid confirmation. */
export function questionRecoverySurface(
  interpretation: PlayerProjection["interpretation"],
  attempt: QuestionAttempt | undefined,
  offeredRawText?: string,
): "native" | "offered" | "none" {
  if (attempt?.answered) return "none";
  if (
    interpretation?.status === "ambiguous" &&
    interpretation.candidates.length > 0 &&
    (!attempt || interpretation.rawText === attempt.rawText)
  )
    return "native";
  if (offeredRawText && (!attempt || offeredRawText === attempt.rawText)) return "offered";
  return "none";
}

/** A stable board-local editor must discard selections removed from this board. */
export function validConnectionSelection(
  board: ReasoningBoardProjection,
  from: string,
  to: string,
) {
  const placed = new Set(board.slots.flatMap((slot) => (slot.itemId ? [slot.itemId] : [])));
  const fromItemId = placed.has(from) ? from : "";
  const toItemId = fromItemId && placed.has(to) && to !== fromItemId ? to : "";
  return { fromItemId, toItemId };
}

export const DEFAULT_EVENT_CHAIN_COPY = {
  mode: "timeline",
  title: "我的事件链",
  guide: "从已经公开的事件中选择与你的解释有关的片段，按发生顺序排列；再用证据说明它们为什么相连。",
  roles: ["事件"],
};
