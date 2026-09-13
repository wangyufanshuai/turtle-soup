import type { CaseMasteryChallengeResult, CaseMasteryRecord, ChallengeRotation, MasteryChallenge, PlayerProjection, ReplayMode } from "./types.ts";

export const MASTERY_SEQUENCE: readonly MasteryChallenge[] = ["limited-questions", "minimal-proof", "no-scaffolds"];

export function emptyMasteryRecord(identity: Pick<PlayerProjection["case"], "id" | "version" | "contentHash">): CaseMasteryRecord {
  return { caseId: identity.id, caseVersion: identity.version, canonicalHash: identity.contentHash, standardSolved: false, challengeResults: {}, totalSolves: 0, lastPlayedAt: new Date(0).toISOString() };
}

export function normalizeMasteryRecord(value: unknown, identity: Pick<PlayerProjection["case"], "id" | "version" | "contentHash">): CaseMasteryRecord {
  const fallback = emptyMasteryRecord(identity);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  if (raw.caseId !== identity.id || raw.caseVersion !== identity.version || raw.canonicalHash !== identity.contentHash) return fallback;
  const challengeResults: CaseMasteryRecord["challengeResults"] = {};
  for (const mode of MASTERY_SEQUENCE) {
    const candidate = raw.challengeResults && typeof raw.challengeResults === "object" ? (raw.challengeResults as Record<string, unknown>)[mode] : undefined;
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.solved !== "boolean" || typeof item.completedAt !== "string") continue;
    challengeResults[mode] = {
      solved: item.solved,
      ...(typeof item.bestQuestionCount === "number" ? { bestQuestionCount: Math.max(0, Math.floor(item.bestQuestionCount)) } : {}),
      ...(typeof item.bestProofCompleteness === "number" ? { bestProofCompleteness: Math.max(0, Math.min(100, item.bestProofCompleteness)) } : {}),
      ...(typeof item.hintFree === "boolean" ? { hintFree: item.hintFree } : {}),
      completedAt: item.completedAt,
    };
  }
  return {
    ...fallback,
    standardSolved: raw.standardSolved === true,
    challengeResults,
    totalSolves: typeof raw.totalSolves === "number" ? Math.max(0, Math.floor(raw.totalSolves)) : 0,
    lastPlayedAt: typeof raw.lastPlayedAt === "string" ? raw.lastPlayedAt : fallback.lastPlayedAt,
  };
}

export function challengeRotation(record: CaseMasteryRecord): ChallengeRotation {
  if (!record.standardSolved) return { caseId: record.caseId, nextChallenge: "complete", completedCount: 0 };
  const completedCount = MASTERY_SEQUENCE.filter((mode) => record.challengeResults[mode]?.solved).length;
  return { caseId: record.caseId, nextChallenge: MASTERY_SEQUENCE[completedCount] ?? "complete", completedCount };
}

export function recordMasterySolve(record: CaseMasteryRecord, projection: Pick<PlayerProjection, "case" | "replayMode" | "solved" | "debrief">, completedAt = new Date().toISOString(), hintFree = true): CaseMasteryRecord {
  const next = normalizeMasteryRecord(record, projection.case);
  if (!projection.solved) return { ...next, lastPlayedAt: completedAt };
  if (projection.replayMode === "standard" && next.standardSolved) return next;
  if (projection.replayMode !== "standard" && next.challengeResults[projection.replayMode]?.solved) return next;
  const totalSolves = next.totalSolves + 1;
  if (projection.replayMode === "standard") return { ...next, standardSolved: true, totalSolves, lastPlayedAt: completedAt };
  const mode = projection.replayMode as MasteryChallenge;
  const previous = next.challengeResults[mode];
  const result: CaseMasteryChallengeResult = {
    solved: true,
    bestQuestionCount: Math.min(previous?.bestQuestionCount ?? Number.POSITIVE_INFINITY, projection.debrief?.questionCount ?? Number.POSITIVE_INFINITY),
    bestProofCompleteness: Math.max(previous?.bestProofCompleteness ?? 0, projection.debrief?.proofCompleteness ?? 0),
    hintFree: (previous?.hintFree ?? true) && hintFree,
    completedAt,
  };
  if (!Number.isFinite(result.bestQuestionCount)) delete result.bestQuestionCount;
  return { ...next, challengeResults: { ...next.challengeResults, [mode]: result }, totalSolves, lastPlayedAt: completedAt };
}

export function nextReplayMode(record: CaseMasteryRecord): ReplayMode | "complete" {
  return challengeRotation(record).nextChallenge;
}
