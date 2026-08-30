import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerProjection } from "@turtle-soup/mystery-core";
import { deriveProofReadiness, hasExaminedEvidence } from "./proof-readiness.ts";

function projection(overrides: Partial<PlayerProjection> = {}): PlayerProjection {
  return {
    case: { id: "c01-cold-room-knock", version: 1, contentHash: "frozen", title: "测试", surface: "公开谜面", difficulty: "easy", targetMinutes: { min: 5, max: 15 }, contentTags: [], presentation: { layoutId: "archive", sceneAsset: "/scene.svg", palette: "archive", accent: "#b8cf79", questionPromptMode: "hybrid", evidenceVisualMode: "cards", mobileNavigation: ["现场", "提问", "证据", "推断"] } },
    transcript: [], interpretation: undefined, evidence: [], locations: [], questionScaffolds: [], eventOptions: [],
    theoryOptions: [{ id: "path-public", label: "公开解释", motiveOptions: [{ id: "condition-public", label: "公开条件" }] }],
    theoryDrafts: [{ id: "theory-a", title: "主假设", hypothesisId: "path-public", eventIds: [], evidenceIds: [] }, { id: "theory-b", title: "备选假设", hypothesisId: "path-public", eventIds: [], evidenceIds: [] }],
    activeTheoryId: "theory-a", canSubmit: false, solved: false, replay: [], debrief: undefined, chapters: [], reasoningBoards: [], replayMode: "standard", replayChallenges: [],
    ...overrides,
  };
}

test("proof readiness describes only public player structure", () => {
  const state = projection();
  const opening = deriveProofReadiness(state, state.theoryDrafts[0]);
  assert.equal(opening.nextStep, "chain");
  const readyProjection = projection({ canSubmit: true, theoryDrafts: [{ ...state.theoryDrafts[0], eventIds: ["public-event"], evidenceIds: ["public-evidence"], motiveKey: "condition-public" }, state.theoryDrafts[1]] });
  const ready = deriveProofReadiness(readyProjection, readyProjection.theoryDrafts[0]);
  assert.equal(ready.nextStep, "proof");
  assert.equal(ready.nextLabel, "可以提交检验");
  for (const forbidden of ["solutionCertificate", "requiredFactIds", "canonicalHypothesis"]) assert.equal(JSON.stringify(ready).includes(forbidden), false);
});

test("unopened evidence does not count as examined", () => {
  assert.equal(hasExaminedEvidence(projection({ evidence: [{ id: "public-evidence", title: "材料", observation: "公开观察", state: "discovered", sourceLabel: "公开", isNew: true }] })), false);
  assert.equal(hasExaminedEvidence(projection({ evidence: [{ id: "public-evidence", title: "材料", observation: "公开观察", state: "examined", sourceLabel: "公开", isNew: false }] })), true);
});
