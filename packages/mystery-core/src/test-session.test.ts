import assert from "node:assert/strict";
import test from "node:test";
import { reduceTestSession, testSessionCsv, toTestSessionExport, type TestSessionState } from "./test-session.ts";

const base: TestSessionState = { schemaVersion: 1, sessionId: "session-test", testerId: "tester-test", caseId: "c02-snow-route", startedAt: "2026-08-22T00:00:00.000Z", questionCount: 0, repeatedQuestionCount: 0, ambiguityAttempts: 0, ambiguityRecoveries: 0, wrongTheoryCount: 0, hintUseCount: 0, solved: false, replayOpened: false };

test("Fun Gate session export is aggregate-only and CSV-safe", () => {
  let state = base;
  state = reduceTestSession(state, { type: "record_test_marker", marker: "question", at: "2026-08-22T00:00:04.000Z" });
  state = reduceTestSession(state, { type: "record_test_marker", marker: "repeat_question", at: "2026-08-22T00:00:05.000Z" });
  state = reduceTestSession(state, { type: "record_test_marker", marker: "ambiguity_attempt", at: "2026-08-22T00:00:06.000Z" });
  state = reduceTestSession(state, { type: "record_test_marker", marker: "ambiguity_recovery", at: "2026-08-22T00:00:07.000Z" });
  state = reduceTestSession(state, { type: "end_test_session", at: "2026-08-22T00:01:00.000Z" });
  const report = toTestSessionExport(state);
  assert.equal(report.questionCount, 1);
  assert.equal(report.durationSeconds, 60);
  assert.equal(Object.keys(report).some((key) => /fact|solution|certificate|event/i.test(key)), false);
  assert.match(testSessionCsv(report), /^schemaVersion,sessionId/);
});

