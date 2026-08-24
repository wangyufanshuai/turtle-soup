import assert from "node:assert/strict";
import test from "node:test";
import { runBudgetedProjectionOnlyCase } from "./budgeted-blackbox-runner.ts";
import type { GameCommand, PlayerProjection, ProjectionOnlyAdapter, ProjectionOnlySnapshot } from "./index.ts";

function projection(): PlayerProjection {
  return {
    case: { id: "case-test", version: 1, contentHash: "sha256:test", title: "测试案件", surface: "一个有限异常。", difficulty: "intro", targetMinutes: { min: 5, max: 10 }, contentTags: [], presentation: { layoutId: "test", sceneAsset: "/test.svg", palette: "test", accent: "#abc", questionPromptMode: "host", evidenceVisualMode: "archive-cards", mobileNavigation: ["现场", "提问", "推理"] } },
    transcript: [],
    evidence: [{ id: "public-evidence-01", title: "公开记录", observation: "尚未检查。", state: "available", sourceLabel: "记录", isNew: true }],
    locations: [{ id: "public-location-01", label: "现场", visited: false }],
    questionScaffolds: [],
    eventOptions: [],
    theoryOptions: [],
    theoryDrafts: [{ id: "theory-a", title: "主假设", hypothesisId: "public-theory-01", eventIds: [], evidenceIds: [] }, { id: "theory-b", title: "备选假设", hypothesisId: "public-theory-02", eventIds: [], evidenceIds: [] }],
    activeTheoryId: "theory-a",
    canSubmit: false,
    solved: false,
    replay: [],
    chapters: [{ id: "chapter-01", title: "第一阶段", unlocked: true }, { id: "chapter-02", title: "第二阶段", unlocked: false }],
    reasoningBoards: [],
    replayMode: "standard",
    replayChallenges: [],
  };
}

test("budgeted runner records public chapter transitions and abandons without proof surface", async () => {
  let current = projection();
  const adapter: ProjectionOnlyAdapter = {
    async initialize(): Promise<ProjectionOnlySnapshot> { current = projection(); return { projection: current, events: [{ type: "case_started" }], accepted: true }; },
    async dispatch(command: GameCommand): Promise<ProjectionOnlySnapshot> {
      if (command.type === "visit_location") {
        current = { ...current, locations: current.locations.map((item) => ({ ...item, visited: true })), chapters: current.chapters.map((item) => ({ ...item, unlocked: true })) };
        return { projection: current, events: [{ type: "chapter_unlocked", chapterId: "internal-chapter-never-reported" }], accepted: true };
      }
      if (command.type === "set_evidence_state") {
        current = { ...current, evidence: current.evidence.map((item) => ({ ...item, state: "examined" as const, observation: "一条公开观察。" })) };
        return { projection: current, events: [{ type: "evidence_updated", evidenceId: command.evidenceId, state: "examined" }], accepted: true };
      }
      return { projection: current, events: [{ type: "command_rejected", message: "不可用" }], accepted: false };
    },
    async restore(): Promise<ProjectionOnlySnapshot> { return { projection: current, events: [], accepted: true }; },
  };
  const trace = await runBudgetedProjectionOnlyCase(adapter, "novice-observer", { seed: 7, questionLimit: 20, evidenceLimit: 6, theoryLimit: 3 });
  assert.equal(trace.outcome, "abandoned");
  assert.equal(trace.abandonReason, "no-public-theory");
  assert.equal(trace.chapterEntries, 2);
  assert.equal(trace.chapterTransitions, 1);
  assert.equal(trace.publicSearchAttempts, 0);
  assert.ok(trace.questionBudgetUsed <= trace.questionBudget);
  assert.ok(trace.evidenceBudgetUsed <= trace.evidenceBudget);
  assert.ok(trace.theoryBudgetUsed <= trace.theoryBudget);
});
