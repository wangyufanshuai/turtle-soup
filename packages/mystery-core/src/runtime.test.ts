import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { analyzeCaseQuality } from "./authoring.ts";
import { c01QuestionCorpus } from "../../../content/zh/cases/c01-question-corpus.ts";
import { createRuntimeState, projectPlayerState, reduceGameCommand, replayCommands } from "./runtime.ts";
import type { CaseFile, GameCommand, RuntimeState } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const casePath = resolve(here, "../../../content/zh/cases/c01-cold-room-knock.json");
const caseFile = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;

function apply(state: RuntimeState, command: GameCommand): RuntimeState {
  const result = reduceGameCommand(caseFile, state, command);
  assert.equal(result.accepted, true, `${command.type}: ${JSON.stringify(result.events)}`);
  return result.state;
}

function inspect(state: RuntimeState, evidenceId: string): RuntimeState {
  return apply(state, { type: "set_evidence_state", evidenceId, state: "examined" });
}

function ask(state: RuntimeState, rawText: string): RuntimeState {
  return apply(state, { type: "ask_text", rawText });
}

function buildSolvedSession(): { state: RuntimeState; commands: GameCommand[] } {
  let state = createRuntimeState(caseFile);
  const commands: GameCommand[] = [];
  const run = (command: GameCommand) => {
    commands.push(command);
    state = apply(state, command);
  };

  run({ type: "set_evidence_state", evidenceId: "evidence-door-latch", state: "examined" });
  run({ type: "set_evidence_state", evidenceId: "evidence-metal-tray-mark", state: "examined" });
  run({ type: "set_evidence_state", evidenceId: "evidence-knock-recording", state: "examined" });
  run({ type: "set_evidence_state", evidenceId: "evidence-access-log", state: "examined" });
  run({ type: "ask_text", rawText: "这扇门会自动上锁吗？" });
  run({ type: "ask_text", rawText: "敲门声是人敲的吗？" });
  run({ type: "ask_text", rawText: "手机在冷藏室里吗？" });
  run({ type: "set_evidence_state", evidenceId: "evidence-phone-in-room", state: "examined" });
  run({ type: "ask_text", rawText: "那部手机是林澈的吗？" });
  run({ type: "set_evidence_state", evidenceId: "evidence-phone-pairing", state: "examined" });
  run({ type: "visit_location", locationId: "location-external-locker" });
  run({ type: "set_evidence_state", evidenceId: "evidence-sample-locker", state: "examined" });
  run({ type: "ask_text", rawText: "他是想拖延检查吗？" });
  run({ type: "set_evidence_state", evidenceId: "evidence-intent-chain", state: "examined" });
  run({ type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-delayed-sound" });

  const requiredEvidence = [
    "evidence-cctv-exit",
    "evidence-door-latch",
    "evidence-metal-tray-mark",
    "evidence-knock-recording",
    "evidence-access-log",
    "evidence-phone-in-room",
    "evidence-phone-pairing",
    "evidence-sample-locker",
    "evidence-intent-chain",
  ];
  for (const evidenceId of requiredEvidence) {
    run({ type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  }
  for (const eventId of ["event-01", "event-02", "event-03", "event-04", "event-05", "event-07"]) {
    run({ type: "upsert_theory_event", theoryId: "theory-a", eventId });
  }
  run({ type: "set_theory_motive", theoryId: "theory-a", motiveKey: "motive-delay-inspection" });
  run({ type: "submit_theory", theoryId: "theory-a" });
  run({ type: "request_proof_replay" });
  return { state, commands };
}

test("player projection contains playable information but no truth certificate", () => {
  let state = createRuntimeState(caseFile);
  state = inspect(state, "evidence-metal-tray-mark");
  state = ask(state, "敲门声是人敲的吗？");
  const serialized = JSON.stringify(projectPlayerState(caseFile, state));
  for (const forbidden of [
    "solutionCertificate",
    "requiredFactIds",
    "minimumProofSets",
    "fact-vibration-caused-knock",
    "hypothesis-canonical",
    "event-phone-vibrates",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.match(serialized, /托盘上的三处震痕/);
  assert.match(serialized, /敲门声是人敲的吗/);
});

test("opening theory workspace does not reveal the delayed phone mechanism", () => {
  const serialized = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile)));
  assert.equal(serialized.includes("手机震动"), false);
  assert.equal(serialized.includes("延时声响"), false);
  assert.equal(serialized.includes("path-delayed-sound"), false);
  assert.match(serialized, /锁门后进入/);
});

test("unrecognized and ambiguous questions fail closed without changing game facts", () => {
  const state = createRuntimeState(caseFile);
  const unknown = reduceGameCommand(caseFile, state, { type: "ask_text", rawText: "今天天气如何？" });
  assert.equal(unknown.accepted, false);
  assert.deepEqual(unknown.state.game, state.game);

  const ambiguousCase = structuredClone(caseFile);
  ambiguousCase.questionSemantics[0].examplePhrases = ["同一个问题"];
  ambiguousCase.questionSemantics[1].examplePhrases = ["同一个问题"];
  const ambiguous = reduceGameCommand(ambiguousCase, createRuntimeState(ambiguousCase), { type: "ask_text", rawText: "同一个问题" });
  assert.equal(ambiguous.accepted, false);
  assert.equal(ambiguous.projection.interpretation?.requiresConfirmation, true);
  assert.equal(ambiguous.state.transcript.length, 0);
});

test("a question can be undone without rolling back inspected evidence", () => {
  let state = createRuntimeState(caseFile);
  state = inspect(state, "evidence-metal-tray-mark");
  state = ask(state, "敲门声是人敲的吗？");
  assert.equal(state.transcript.length, 1);
  state = apply(state, { type: "undo_last_question" });
  assert.equal(state.transcript.length, 0);
  assert.equal(state.evidenceStates["evidence-metal-tray-mark"], "examined");
});

test("C01 can be completed through the public command protocol", () => {
  const { state } = buildSolvedSession();
  const projection = projectPlayerState(caseFile, state);
  assert.equal(projection.solved, true);
  assert.equal(projection.replay.length, 5);
  assert.equal(projection.debrief?.proofCompleteness, 100);
  assert.equal(projection.debrief?.unlockedReplayMode, "limited-questions");
});

test("accepted command replay restores the same player projection", () => {
  const { state, commands } = buildSolvedSession();
  const restored = replayCommands(caseFile, commands);
  assert.deepEqual(restored.projection, projectPlayerState(caseFile, state));
});

test("moving a theory event keeps internal and public event identities consistent", () => {
  const solved = buildSolvedSession();
  const moved = reduceGameCommand(caseFile, solved.state, { type: "move_theory_event", theoryId: "theory-a", eventId: "event-05", direction: -1 });
  assert.equal(moved.accepted, true);
  const draft = moved.projection.theoryDrafts.find((item) => item.id === "theory-a");
  assert.ok(draft);
  assert.equal(draft.eventIds.includes("event-unknown"), false);
  assert.deepEqual(draft.eventIds, ["event-01", "event-02", "event-03", "event-05", "event-04", "event-07"]);
});

test("C01 authoring report catches no dangling references", () => {
  const report = analyzeCaseQuality(caseFile, c01QuestionCorpus);
  assert.equal(report.passed, true);
  assert.equal(report.errors.length, 0);
  assert.equal(c01QuestionCorpus.length, 171);
  assert.ok(report.metrics.duplicateQuestionRate < 0.1);
  assert.equal(report.metrics.questionCoverage, 100);
  assert.equal(report.metrics.proofReplayCoverage, 100);
});
