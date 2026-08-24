import assert from "node:assert/strict";
import test from "node:test";
import { closeDiagnosticSession, diagnosticCsv, newDiagnosticSession, reduceDiagnosticSession } from "./diagnostics.ts";

test("diagnostics keep aggregates and omit raw question data", () => {
  let session = newDiagnosticSession({ caseId: "c25-silent-second-bell", caseVersion: 1, canonicalHash: "hash" }, "diag-test", "2026-01-01T00:00:00.000Z");
  session = reduceDiagnosticSession(session, [{ type: "interpretation_required", interpretation: { status: "ambiguous", rawText: "某个问题", candidates: [], requiresConfirmation: true } }, { type: "question_answered", entry: { id: "q-1", rawQuestion: "原始问题不应被导出", interpretedAs: "公开标签", answerCode: "yes", answerText: "是", repeated: false } }, { type: "theory_judged", judgement: "nearly_proven", message: "仍缺少空间", proofFailureCategory: "space" }], "2026-01-01T00:00:02.000Z");
  const closed = closeDiagnosticSession(session, "2026-01-01T00:01:00.000Z"); const serialized = JSON.stringify(closed);
  assert.equal(closed.questionCount, 1); assert.equal(closed.ambiguityRecoveries, 1); assert.deepEqual(closed.proofFailureCategories, ["space"]); assert.equal(serialized.includes("原始问题"), false); assert.match(diagnosticCsv([closed]), /proofFailureCategories/);
});
