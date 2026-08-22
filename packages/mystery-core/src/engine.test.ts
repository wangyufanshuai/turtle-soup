import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  askNaturalLanguage,
  askQuestion,
  buildProofReplay,
  createInitialState,
  createStateFromProjection,
  discoverEvidence,
  getDiscoverableEvidenceIds,
  judgeTheory,
  normalizeQuestion,
  validateCaseShape,
  visitLocation,
} from "./engine.ts";
import type { CaseFile, GameState, TheorySubmission } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const casePath = resolve(here, "../../../content/zh/cases/c01-cold-room-knock.json");
const vectorPath = resolve(here, "../../../content/zh/cases/c01-cold-room-knock.test-vectors.json");
const caseFile = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;
const vectors = JSON.parse(readFileSync(vectorPath, "utf8")) as {
  normalizationVectors: Array<{
    id: string;
    rawQuestion: string;
    expectedStatus: string;
    expectedQueryId: string | null;
    expectedMatchedBy: string;
  }>;
  answerVectors: Array<{
    id: string;
    discoveredEvidenceIds: string[];
    visitedLocationIds: string[];
    answeredQueryIds: string[];
    queryId: string | null;
    rawQuestion?: string;
    expectedAnswerCode: string;
    expectedNewFacts: string[];
  }>;
  judgementVectors: Array<{
    id: string;
    hypothesisId: string;
    evidenceIds: string[];
    motiveKey?: string;
    expectedJudgement: string;
    expectedMissingEvidenceIds?: string[];
    expectedMissingFactIds?: string[];
    expectedMissingMotiveKey?: string;
    expectedContradictionIds?: string[];
  }>;
  orderVectors: Array<{
    id: string;
    steps: Array<{
      type: "query" | "discoverEvidence" | "visitLocation";
      queryId?: string;
      evidenceId?: string;
      locationId?: string;
      expectedAnswerCode?: string;
    }>;
    expectedFinalVisibleFacts: string[];
  }>;
  antiLeakVectors: string[];
  replayVector: { expectedBeatIds: string[]; expectedEventIds: string[] };
};

function ask(state: GameState, queryId: string): GameState {
  return askQuestion(caseFile, state, queryId).state;
}

function discover(state: GameState, evidenceId: string): GameState {
  const result = discoverEvidence(caseFile, state, evidenceId);
  assert.equal(result.accepted, true, `expected evidence ${evidenceId} to be discoverable`);
  return result.state;
}

function buildSoundState(): GameState {
  let state = createInitialState(caseFile);
  state = ask(state, "query-door-mechanism");
  state = discover(state, "evidence-metal-tray-mark");
  const sound = askQuestion(caseFile, state, "query-knock-source");
  assert.equal(sound.code, "no");
  return sound.state;
}

function buildFullState(): GameState {
  let state = buildSoundState();
  state = ask(state, "query-phone-inside");
  state = discover(state, "evidence-phone-in-room");
  state = discover(state, "evidence-phone-pairing");
  state = discover(state, "evidence-knock-recording");
  state = discover(state, "evidence-access-log");
  state = visitLocation(caseFile, state, "location-external-locker").state;
  state = discover(state, "evidence-sample-locker");
  state = ask(state, "query-lin-motive");
  state = discover(state, "evidence-intent-chain");
  return state;
}

const canonicalSubmission: TheorySubmission = {
  hypothesisId: "hypothesis-canonical",
  evidenceIds: [
    "evidence-cctv-exit",
    "evidence-door-latch",
    "evidence-metal-tray-mark",
    "evidence-knock-recording",
    "evidence-access-log",
    "evidence-phone-in-room",
    "evidence-phone-pairing",
    "evidence-sample-locker",
    "evidence-intent-chain",
  ],
  eventIds: [
    "event-lin-removes-sample",
    "event-lin-hides-sample",
    "event-lin-places-phone",
    "event-lin-exits",
    "event-phone-vibrates",
    "event-yu-delays-entry",
  ],
  motiveKey: "motive-delay-inspection",
};

test("C01 shape validates and test-vector counts are loaded", () => {
  validateCaseShape(caseFile);
  assert.equal(caseFile.id, "c01-cold-room-knock");
  assert.equal(vectors.answerVectors.length, 12);
  assert.equal(vectors.judgementVectors.length, 6);
  assert.equal(vectors.orderVectors.length, 3);
  assert.equal(vectors.normalizationVectors.length, 12);
});

test("all authored Chinese normalization vectors are deterministic", () => {
  for (const vector of vectors.normalizationVectors) {
    const result = normalizeQuestion(caseFile, vector.rawQuestion);
    assert.equal(result.status, vector.expectedStatus, vector.id);
    assert.equal(result.queryId, vector.expectedQueryId, vector.id);
    assert.equal(result.matchedBy, vector.expectedMatchedBy, vector.id);
  }
});

test("ambiguous authored phrases fail closed", () => {
  const ambiguousCase = structuredClone(caseFile);
  ambiguousCase.questionSemantics[0].examplePhrases = ["同一个问题"];
  ambiguousCase.questionSemantics[1].examplePhrases = ["同一个问题"];
  const result = normalizeQuestion(ambiguousCase, "同一个问题？");
  assert.equal(result.status, "ambiguous");
  assert.equal(result.queryId, null);
  assert.equal(askNaturalLanguage(ambiguousCase, createInitialState(ambiguousCase), "同一个问题").code, "unrecognized");
});

test("opening state exposes only the safe facts", () => {
  const state = createInitialState(caseFile);
  assert.deepEqual(state.visibleFactIds.sort(), [
    "fact-cctv-lin-exited",
    "fact-door-sealed",
    "fact-lin-authorized",
    "fact-lin-left-before-knock",
    "fact-three-knocks",
  ]);
  assert.equal(state.visibleFactIds.includes("fact-phone-inside"), false);
  assert.equal(state.visibleFactIds.includes("fact-lin-intent-delay"), false);
});

test("answer codes obey visibility gates", () => {
  let state = createInitialState(caseFile);
  assert.equal(askQuestion(caseFile, state, "query-door-mechanism").code, "yes");
  assert.equal(askQuestion(caseFile, state, "query-person-inside").code, "unknown");
  assert.equal(askQuestion(caseFile, state, "query-knock-source").code, "unknown");
  assert.equal(askQuestion(caseFile, state, "query-irrelevant-color").code, "irrelevant");
  assert.equal(askQuestion(caseFile, state, "missing-query").code, "unrecognized");

  state = buildSoundState();
  assert.equal(askQuestion(caseFile, state, "query-person-inside").code, "no");
  assert.equal(askQuestion(caseFile, state, "query-phone-inside").code, "yes");
});

test("evidence discovery is monotonic and unlocks the next gate", () => {
  let state = createInitialState(caseFile);
  assert.equal(getDiscoverableEvidenceIds(caseFile, state).includes("evidence-metal-tray-mark"), true);
  assert.equal(getDiscoverableEvidenceIds(caseFile, state).includes("evidence-phone-in-room"), false);

  state = ask(state, "query-door-mechanism");
  state = discover(state, "evidence-metal-tray-mark");
  state = ask(state, "query-knock-source");
  state = ask(state, "query-phone-inside");
  assert.equal(getDiscoverableEvidenceIds(caseFile, state).includes("evidence-phone-in-room"), true);
  assert.equal(state.visibleFactIds.includes("fact-phone-inside"), true);
});

test("canonical theory is solved only after the complete proof set", () => {
  const fullState = buildFullState();
  const result = judgeTheory(caseFile, fullState, canonicalSubmission);
  assert.equal(result.judgement, "solved");
  assert.deepEqual(result.missingEvidenceIds, []);
  assert.deepEqual(result.missingFactIds, []);
  assert.deepEqual(result.missingContradictionResolutionIds, []);
  assert.equal(buildProofReplay(caseFile, fullState, result).length, 5);
});

test("a correct-looking guess without submitted evidence is not solved", () => {
  const submission: TheorySubmission = { ...canonicalSubmission, evidenceIds: [] };
  const result = judgeTheory(caseFile, buildFullState(), submission);
  assert.equal(result.judgement, "plausible");
  assert.equal(result.missingEvidenceIds.length, 9);
});

test("missing intent evidence produces a non-spoiler nearly-proven result", () => {
  const fullState = buildFullState();
  const submission: TheorySubmission = {
    ...canonicalSubmission,
    evidenceIds: canonicalSubmission.evidenceIds?.filter((id) => id !== "evidence-intent-chain"),
  };
  const result = judgeTheory(caseFile, fullState, submission);
  assert.equal(result.judgement, "nearly_proven");
  assert.deepEqual(result.missingEvidenceIds, ["evidence-intent-chain"]);
  assert.match(result.spoilerSafeGap, /因果|证据|闭合|关键/);
});

test("hard contradictions invalidate authored alternatives", () => {
  const doorState = ask(createInitialState(caseFile), "query-door-mechanism");
  const fang = judgeTheory(caseFile, doorState, {
    hypothesisId: "hypothesis-fang-entered",
    evidenceIds: ["evidence-cctv-exit", "evidence-door-latch", "evidence-access-log"],
  });
  assert.equal(fang.judgement, "invalidated");
  assert.deepEqual(fang.contradictionIds, ["contradiction-no-person-inside"]);

  const soundState = buildSoundState();
  const guard = judgeTheory(caseFile, soundState, {
    hypothesisId: "hypothesis-guard-faked",
    evidenceIds: ["evidence-knock-recording", "evidence-metal-tray-mark"],
  });
  assert.equal(guard.judgement, "invalidated");
  assert.deepEqual(guard.contradictionIds, ["contradiction-independent-recording"]);
});

test("question order converges to the same visible fact set", () => {
  let first = createInitialState(caseFile);
  first = ask(first, "query-door-mechanism");
  first = discover(first, "evidence-metal-tray-mark");
  first = ask(first, "query-knock-source");
  first = ask(first, "query-phone-inside");

  let second = createInitialState(caseFile);
  second = discover(second, "evidence-metal-tray-mark");
  second = ask(second, "query-knock-source");
  second = ask(second, "query-door-mechanism");
  second = ask(second, "query-phone-inside");

  assert.deepEqual(first.visibleFactIds.sort(), second.visibleFactIds.sort());
});

test("all machine-readable answer vectors execute against the engine", () => {
  for (const vector of vectors.answerVectors) {
    const state = createStateFromProjection(caseFile, vector);
    const result = vector.queryId
      ? askQuestion(caseFile, state, vector.queryId)
      : askNaturalLanguage(caseFile, state, vector.rawQuestion ?? "");
    assert.equal(result.code, vector.expectedAnswerCode, vector.id);
    assert.deepEqual(result.newlyVisibleFactIds.sort(), [...vector.expectedNewFacts].sort(), vector.id);
  }
});

test("all machine-readable judgement vectors execute against the engine", () => {
  const fullState = buildFullState();
  for (const vector of vectors.judgementVectors) {
    const canonical = vector.hypothesisId === "hypothesis-canonical";
    const submission: TheorySubmission = {
      hypothesisId: vector.hypothesisId,
      evidenceIds: vector.evidenceIds,
      eventIds: canonical ? canonicalSubmission.eventIds : undefined,
      motiveKey: vector.motiveKey,
    };
    const result = judgeTheory(caseFile, fullState, submission);
    assert.equal(result.judgement, vector.expectedJudgement, vector.id);
    if (vector.expectedMissingEvidenceIds) {
      assert.deepEqual(result.missingEvidenceIds.sort(), [...vector.expectedMissingEvidenceIds].sort(), vector.id);
    }
    if (vector.expectedMissingFactIds) {
      assert.deepEqual(result.missingFactIds.sort(), [...vector.expectedMissingFactIds].sort(), vector.id);
    }
    if (vector.expectedContradictionIds) {
      assert.deepEqual(result.contradictionIds.sort(), [...vector.expectedContradictionIds].sort(), vector.id);
    }
    if (vector.expectedMissingMotiveKey) {
      assert.equal(result.missingMotiveKey, vector.expectedMissingMotiveKey, vector.id);
    }
  }
});

test("all machine-readable order vectors converge to their declared state", () => {
  for (const vector of vectors.orderVectors) {
    let state = createInitialState(caseFile);
    for (const step of vector.steps) {
      if (step.type === "query") {
        const result = askQuestion(caseFile, state, step.queryId ?? "");
        assert.equal(result.code, step.expectedAnswerCode, `${vector.id}:${step.queryId}`);
        state = result.state;
      } else if (step.type === "discoverEvidence") {
        const result = discoverEvidence(caseFile, state, step.evidenceId ?? "");
        assert.equal(result.accepted, true, `${vector.id}:${step.evidenceId}`);
        state = result.state;
      } else {
        const result = visitLocation(caseFile, state, step.locationId ?? "");
        assert.equal(result.accepted, true, `${vector.id}:${step.locationId}`);
        state = result.state;
      }
    }
    assert.deepEqual(state.visibleFactIds.sort(), [...vector.expectedFinalVisibleFacts].sort(), vector.id);
  }
});

test("pre-solve judgement gaps do not contain anti-leak strings", () => {
  const fullState = buildFullState();
  const results = vectors.judgementVectors
    .filter((vector) => vector.expectedJudgement !== "solved")
    .map((vector) => judgeTheory(caseFile, fullState, {
      hypothesisId: vector.hypothesisId,
      evidenceIds: vector.evidenceIds,
      eventIds: vector.hypothesisId === "hypothesis-canonical" ? canonicalSubmission.eventIds : undefined,
      motiveKey: vector.motiveKey,
    }));
  for (const result of results) {
    for (const forbidden of vectors.antiLeakVectors) {
      assert.equal(result.spoilerSafeGap.includes(forbidden), false, forbidden);
    }
  }
});

test("machine replay vector matches certified replay exactly", () => {
  const fullState = buildFullState();
  const judgement = judgeTheory(caseFile, fullState, canonicalSubmission);
  const replay = buildProofReplay(caseFile, fullState, judgement);
  assert.deepEqual(replay.map((item) => item.id), vectors.replayVector.expectedBeatIds);
  assert.deepEqual(replay.map((item) => item.eventId), vectors.replayVector.expectedEventIds);
});
