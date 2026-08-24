import assert from "node:assert/strict";
import test from "node:test";
import { challengeRotation, emptyMasteryRecord, normalizeMasteryRecord, recordMasterySolve } from "./mastery.ts";
import type { PlayerProjection } from "./types.ts";

const identity = { id: "c25-silent-second-bell" as const, version: 1, contentHash: "hash-c25" };
const projection = (mode: PlayerProjection["replayMode"], solved = true): Pick<PlayerProjection, "case" | "replayMode" | "solved" | "debrief"> => ({ case: { ...identity, title: "", surface: "", difficulty: "", targetMinutes: { min: 1, max: 2 }, contentTags: [], presentation: { layoutId: "cold-room", sceneAsset: "", palette: "black-soup", accent: "", questionPromptMode: "host", evidenceVisualMode: "archive-cards", mobileNavigation: [] } }, replayMode: mode, solved, debrief: solved ? { proofCompleteness: 100, questionCount: 7, repeatedQuestionCount: 1, verifiedEvidenceCount: 4, contradictionCount: 1 } : undefined });

test("mastery rotation is deterministic and version isolated", () => {
  let record = emptyMasteryRecord(identity); assert.equal(challengeRotation(record).nextChallenge, "complete");
  record = recordMasterySolve(record, projection("standard"), "2026-01-01T00:00:00.000Z"); assert.equal(challengeRotation(record).nextChallenge, "limited-questions");
  record = recordMasterySolve(record, projection("limited-questions"), "2026-01-02T00:00:00.000Z"); assert.equal(challengeRotation(record).nextChallenge, "minimal-proof");
  record = recordMasterySolve(record, projection("minimal-proof"), "2026-01-03T00:00:00.000Z"); assert.equal(challengeRotation(record).nextChallenge, "no-scaffolds");
  record = recordMasterySolve(record, projection("no-scaffolds"), "2026-01-04T00:00:00.000Z"); assert.equal(challengeRotation(record).nextChallenge, "complete");
  assert.equal(normalizeMasteryRecord({ ...record, canonicalHash: "other" }, identity).standardSolved, false);
});
