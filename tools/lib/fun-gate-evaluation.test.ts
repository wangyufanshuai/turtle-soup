import assert from "node:assert/strict";
import test from "node:test";
import type { TestSessionExport } from "../../packages/mystery-core/src/test-session.ts";
import {
  FUN_GATE_CASE_ID,
  buildFunGateReport,
  parseObservationCsv,
  validateSessionExport,
  type FacilitatorObservation,
} from "./fun-gate-evaluation.ts";

function anonymousId(prefix: "session" | "tester", index: number): string {
  return `${prefix}-${index.toString(16).padStart(10, "0")}`;
}

function session(index: number, overrides: Partial<TestSessionExport> = {}): TestSessionExport {
  return {
    schemaVersion: 1,
    sessionId: anonymousId("session", index),
    testerId: anonymousId("tester", index),
    caseId: FUN_GATE_CASE_ID,
    startedAt: "2026-08-25T00:00:00.000Z",
    endedAt: "2026-08-25T00:12:00.000Z",
    durationSeconds: 720,
    firstActionSeconds: 8,
    questionCount: 10,
    repeatedQuestionCount: 1,
    ambiguityAttempts: 1,
    ambiguityRecoveries: 1,
    wrongTheoryCount: 1,
    hintUseCount: 0,
    solved: true,
    replayOpened: index < 3,
    ...overrides,
  };
}

function observation(index: number, overrides: Partial<FacilitatorObservation> = {}): FacilitatorObservation {
  return {
    batchId: `C01-FG-${String(index + 1).padStart(2, "0")}`,
    sessionId: anonymousId("session", index),
    testerId: anonymousId("tester", index),
    caseId: FUN_GATE_CASE_ID,
    viewport: index < 5 ? "desktop" : "mobile",
    answerKnownBeforeSession: false,
    understoodQuestionLoop: true,
    formedCorrectCausalChain: true,
    causalChainSeconds: 720,
    proofSatisfactionPrimary: true,
    proofSatisfactionScore: 5,
    languageInterruption: false,
    irreversibleError: false,
    attemptedAlternativeTheory: index < 3,
    frictionCategory: "",
    ...overrides,
  };
}

test("paired real-session schema can calculate every formal C01 Fun Gate threshold", () => {
  const sessions = Array.from({ length: 10 }, (_, index) => session(index));
  const observations = Array.from({ length: 10 }, (_, index) => observation(index));
  const report = buildFunGateReport({
    sessions,
    observations,
    sessionFilesFound: sessions.length,
    rejectedSessionFiles: 0,
    observationRowsFound: observations.length,
    rejectedObservationRows: 0,
    generatedAt: "2026-08-25T00:00:00.000Z",
  });
  assert.equal(report.funGate.status, "passed");
  assert.equal(report.funGate.passed, true);
  assert.equal(report.humanParticipants, 10);
  assert.equal(Object.values(report.funGate.gates).every((gate) => gate.passed), true);
  assert.equal("sessions" in report, false);
  assert.equal(JSON.stringify(report).includes("tester-"), false);
  assert.equal(JSON.stringify(report).includes("verbatim_quote"), false);
});

test("missing facilitator rows fail closed instead of silently reducing the denominator", () => {
  const sessions = Array.from({ length: 10 }, (_, index) => session(index));
  const observations = Array.from({ length: 9 }, (_, index) => observation(index));
  const report = buildFunGateReport({ sessions, observations, sessionFilesFound: 10, rejectedSessionFiles: 0, observationRowsFound: 9, rejectedObservationRows: 0 });
  assert.equal(report.funGate.status, "insufficient-human-sessions");
  assert.equal(report.inputAudit.unmatchedSessionCount, 1);
  assert.equal(report.funGate.passed, false);
});

test("session validation rejects nested truth-like fields and unknown additions", () => {
  const unsafe = { ...session(1), payload: { facts: ["hidden"] } };
  const result = validateSessionExport(unsafe, "unsafe.json");
  assert.equal(result.value, undefined);
  assert.match(result.reasons.join(" "), /forbidden|unknown/u);
});

test("observation CSV requires explicit causal, satisfaction, language and irreversible-state fields", () => {
  const csv = [
    "batch_id,session_id,tester_id,case_id,viewport,answer_known_before_session,understood_question_loop,formed_correct_causal_chain,causal_chain_seconds,proof_satisfaction_primary,proof_satisfaction_score,language_interruption,irreversible_error,attempted_alternative_theory,friction_category,verbatim_quote",
    `C01-FG-01,${anonymousId("session", 1)},${anonymousId("tester", 1)},${FUN_GATE_CASE_ID},desktop,0,1,1,720,1,5,0,0,1,,\"证明比揭晓更有满足感\"`,
  ].join("\n");
  const parsed = parseObservationCsv(csv);
  assert.equal(parsed.accepted.length, 1);
  assert.equal(parsed.rejected.length, 0);
  assert.equal("verbatimQuote" in parsed.accepted[0], false);
});
