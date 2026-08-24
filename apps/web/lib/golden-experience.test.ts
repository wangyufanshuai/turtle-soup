import assert from "node:assert/strict";
import test from "node:test";
import { GOLDEN_CASE_IDS, GOLDEN_PATH, GOLDEN_PATH_CASE_IDS, goldenPathStep } from "./golden-experience.ts";

test("golden path is a unique optional nine-case progression, not browser coverage", () => {
  assert.deepEqual(GOLDEN_PATH_CASE_IDS, [
    "c01-cold-room-knock",
    "c03-second-shadow",
    "c13-second-waterline",
    "c06-nonexistent-ticket",
    "c17-twelve-strikes",
    "c24-turned-painting",
    "c33-early-late-arrival",
    "c48-two-point-calibration",
    "c60-last-sample-before-stop",
  ]);
  assert.equal(new Set(GOLDEN_PATH_CASE_IDS).size, 9);
  assert.equal(GOLDEN_PATH.length, 9);
  assert.equal(GOLDEN_PATH.every((step, index) => step.step === index + 1), true);
  assert.equal(GOLDEN_CASE_IDS.includes("c25-silent-second-bell"), true);
  assert.equal(GOLDEN_PATH_CASE_IDS.includes("c25-silent-second-bell" as never), false);
  assert.equal(goldenPathStep("c60-last-sample-before-stop")?.tier, "综合证明");
});

test("golden path hints contain no internal or directed-answer identifiers", () => {
  const serialized = JSON.stringify(GOLDEN_PATH.map((step) => step.hints));
  for (const token of ["fact-", "evidence-", "event-", "query-", "hypothesis-", "solutionCertificate", "canonicalHypothesis"]) {
    assert.equal(serialized.includes(token), false, token);
  }
});
