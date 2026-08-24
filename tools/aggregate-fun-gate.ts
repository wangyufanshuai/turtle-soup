import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestSessionExport } from "../packages/mystery-core/src/test-session.ts";

const directory = resolve(process.argv[2] ?? "test-data/fun-gate");
const outputPath = process.argv[3] ? resolve(process.argv[3]) : undefined;
const files = (() => {
  try { return readdirSync(directory).filter((name) => name.endsWith(".json") && name !== "batch-manifest.json"); } catch { return []; }
})();
const sessions = files.flatMap((filename) => {
  try {
    const value = JSON.parse(readFileSync(resolve(directory, filename), "utf8")) as Partial<TestSessionExport>;
    if (value.schemaVersion !== 1 || typeof value.sessionId !== "string" || typeof value.testerId !== "string" || value.caseId !== "c01-cold-room-knock") return [];
    const forbidden = ["rawQuestion", "commands", "facts", "events", "evidence", "solutionCertificate", "canonicalHypothesis", "answerText"];
    if (forbidden.some((key) => key in value)) return [];
    return [value as TestSessionExport];
  } catch { return []; }
});
const solved = sessions.filter((session) => session.solved);
const solvedWithoutHint = solved.filter((session) => session.hintUseCount === 0);
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-json-only",
  sessionCount: sessions.length,
  uniqueTesterCount: new Set(sessions.map((session) => session.testerId)).size,
  cases: [...new Set(sessions.map((session) => session.caseId))].sort(),
  solvedRate: sessions.length ? Math.round((solved.length / sessions.length) * 100) : null,
  solvedWithoutHintRate: sessions.length ? Math.round((solvedWithoutHint.length / sessions.length) * 100) : null,
  replayOpenedRate: sessions.length ? Math.round((sessions.filter((session) => session.replayOpened).length / sessions.length) * 100) : null,
  ambiguityRecoveryRate: sessions.filter((session) => session.ambiguityAttempts > 0).length ? Math.round((sessions.filter((session) => session.ambiguityAttempts > 0 && session.ambiguityRecoveries > 0).length / sessions.filter((session) => session.ambiguityAttempts > 0).length) * 100) : null,
  averageSolveSeconds: average(solved.map((session) => session.durationSeconds ?? 0).filter((value) => value > 0)),
  averageQuestionCount: average(sessions.map((session) => session.questionCount)),
  funGate: {
    minimumSessions: 10,
    status: sessions.length >= 10 ? "ready-for-human-review" : "insufficient-human-sessions",
    note: "This aggregate cannot establish comprehension, satisfaction, or fairness without the facilitator's observation sheet.",
  },
  inputAudit: {
    directory,
    jsonFilesFound: files.length,
    acceptedSessionFiles: sessions.length,
    rejectedFileCount: files.length - sessions.length,
    onlyC01: sessions.every((session) => session.caseId === "c01-cold-room-knock"),
    rawQuestionOrTruthFieldsAccepted: false,
  },
};
if (outputPath) {
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
