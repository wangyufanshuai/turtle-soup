import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerProjection } from "@turtle-soup/mystery-core";
import { deriveInvestigationMomentum } from "./investigation-momentum.ts";

function projection(overrides: Partial<PlayerProjection> = {}): PlayerProjection {
  return {
    case: { id: "c01-cold-room-knock", version: 1, contentHash: "frozen", title: "测试", surface: "公开谜面", difficulty: "easy", targetMinutes: { min: 5, max: 15 }, contentTags: [], presentation: { layoutId: "cold-room", sceneAsset: "/scene.svg", palette: "archive", accent: "#fff", questionPromptMode: "hybrid", evidenceVisualMode: "cards", mobileNavigation: ["现场", "提问", "推理"] } },
    transcript: [], evidence: [
      { id: "public-e1", title: "甲", observation: "公开观察", state: "available", sourceLabel: "公开", isNew: false },
      { id: "public-e2", title: "乙", observation: "公开观察", state: "available", sourceLabel: "公开", isNew: false },
      { id: "public-e3", title: "丙", observation: "公开观察", state: "available", sourceLabel: "公开", isNew: false },
      { id: "public-e4", title: "丁", observation: "公开观察", state: "available", sourceLabel: "公开", isNew: false },
    ], locations: [{ id: "public-location", label: "现场", visited: false }], questionScaffolds: [], eventOptions: [], theoryOptions: [],
    theoryDrafts: [{ id: "theory-a", title: "解释 A", hypothesisId: "public-option", eventIds: [], evidenceIds: [] }, { id: "theory-b", title: "解释 B", hypothesisId: "public-option", eventIds: [], evidenceIds: [] }],
    activeTheoryId: "theory-a", canSubmit: false, solved: false, replay: [], chapters: [], reasoningBoards: [], replayMode: "standard", replayChallenges: [],
    ...overrides,
  };
}

test("momentum leads the first three operations without correctness claims", () => {
  const opening = deriveInvestigationMomentum(projection());
  assert.equal(opening.stage, "observe");
  assert.equal(opening.nextArea, "scene");
  const observed = deriveInvestigationMomentum(projection({ locations: [{ id: "public-location", label: "现场", visited: true }] }));
  assert.equal(observed.stage, "verify");
  const verified = deriveInvestigationMomentum(projection({
    locations: [{ id: "public-location", label: "现场", visited: true }],
    transcript: [{ id: "answer-1", rawQuestion: "公开问题", interpretedAs: "公开解释", answerCode: "yes", answerText: "确定性回答", repeated: false }],
    evidence: projection().evidence.map((item, index) => ({ ...item, state: index < 2 ? "examined" : item.state })),
  }));
  assert.equal(verified.stage, "model");
  assert.equal(verified.beats.filter((beat) => beat.done).length, 2);
});

test("momentum discourages exhaustive collection and favors an early reversible proof", () => {
  const base = projection();
  const result = deriveInvestigationMomentum(projection({
    locations: [{ id: "public-location", label: "现场", visited: true }],
    transcript: [{ id: "answer-1", rawQuestion: "公开问题", interpretedAs: "公开解释", answerCode: "no", answerText: "确定性回答", repeated: false }],
    evidence: base.evidence.map((item) => ({ ...item, state: "examined" })),
  }));
  assert.equal(result.collectionRisk, true);
  assert.equal(result.headline, "停止收集，开始取舍");
  assert.match(result.detail, /1–2 件/);
});

test("momentum output remains free of hidden implementation vocabulary", () => {
  const serialized = JSON.stringify(deriveInvestigationMomentum(projection()));
  for (const token of ["solutionCertificate", "canonicalHypothesis", "requiredFactIds", "fact-", "event-"]) {
    assert.equal(serialized.includes(token), false, token);
  }
});
