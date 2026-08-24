import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const batch = JSON.parse(read("test-data/fun-gate-v1.8/batch-manifest.json"));
const aggregate = JSON.parse(read("docs/v1.8-fun-gate-aggregate.json"));
const artifact = JSON.parse(read("docs/v1.8-release-artifacts.json"));
const archivePath = resolve(root, artifact.artifact.archive.path);
const archiveHash = existsSync(archivePath) ? createHash("sha256").update(readFileSync(archivePath)).digest("hex") : null;
let frozenCases = false;
try { execSync("git diff --quiet v1.8-source-baseline -- content/zh/cases", { cwd: root, stdio: "ignore", shell: true }); frozenCases = true; } catch { frozenCases = false; }
const sessionSource = read("apps/web/lib/use-fun-gate-session.ts");
const toolsSource = read("apps/web/components/fun-gate-tools.tsx");
const aggregateSource = read("tools/aggregate-fun-gate.ts");
const evaluationSource = read("tools/lib/fun-gate-evaluation.ts");
const observationHeader = read("evaluation/c01-observation-template.csv").split(/\r?\n/u)[0];
const requiredObservationColumns = ["session_id", "tester_id", "understood_question_loop", "formed_correct_causal_chain", "causal_chain_seconds", "proof_satisfaction_primary", "language_interruption", "irreversible_error", "attempted_alternative_theory"];
const requiredFiles = ["evaluation/fun-gate-v1.8-runbook.md", "evaluation/moderator-protocol.md", "evaluation/tester-instructions.md", "evaluation/c01-observation-template.csv", "evaluation/c01-post-test-interview.md", "evaluation/c01-interview-record-template.md", "test-data/fun-gate-v1.8/batch-manifest.json", "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip"];
const gates = {
  frozenV18Cases: frozenCases,
  frozenArchiveHash: archiveHash === artifact.artifact.archive.sha256 && archiveHash === "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d",
  batchPrepared: batch.status === "pending-human-sessions" && batch.humanParticipants === 0 && batch.roster.length === 15,
  localObservationSheetReady: existsSync(resolve(root, "test-data/fun-gate-v1.8/observations.csv")) && read("test-data/fun-gate-v1.8/observations.csv").split(/\r?\n/u)[0] === observationHeader,
  emptyAggregateHonest: aggregate.humanParticipants === 0 && aggregate.sessionCount === 0 && aggregate.uniqueTesterCount === 0 && aggregate.funGate.status === "insufficient-human-sessions" && aggregate.funGate.passed === false,
  anonymousExport: sessionSource.includes("randomId(\"tester\")") && sessionSource.includes("toTestSessionExport") && toolsSource.includes("导出 JSON") && toolsSource.includes("导出 CSV"),
  noRawQuestionAggregation: evaluationSource.includes("rawQuestionOrTruthFieldsAccepted: false") && evaluationSource.includes("FORBIDDEN_KEY") && evaluationSource.includes("FUN_GATE_CASE_ID"),
  facilitatorObservationMerge: aggregateSource.includes("parseObservationCsv") && aggregateSource.includes("buildFunGateReport") && requiredObservationColumns.every((column) => observationHeader.includes(column)),
  allFormalThresholdsComputable: ["understoodQuestionLoop", "causalChainInFiveToTwentyMinutes", "solvedFormalProofWithoutHint", "proofSatisfactionPrimary", "languageInterruption", "irreversibleErrors", "alternativeTheoryOrReplay"].every((key) => evaluationSource.includes(key)),
  requiredProtocolFiles: requiredFiles.every((path) => existsSync(resolve(root, path))),
};
const report = { reportVersion: "1.8", generatedAt: new Date().toISOString(), releaseProfile: "v1.8-internal-rc", caseId: "c01-cold-room-knock", status: "ready-for-human-sessions / fun-gate-pending", humanParticipants: 0, targetParticipants: { minimum: 10, preferred: 15 }, recordingConsent: "pending-user-decision", localServer: "http://127.0.0.1:4173/case/c01-cold-room-knock/", archiveSha256: archiveHash, gates, passed: Object.values(gates).every(Boolean), blocker: "需要 10–15 位不知道答案的真人测试者及主持人观察数据。", qualification: "该报告只证明评测执行环境和数据边界就绪；没有真人数据时不能计算或宣称 Fun Gate 通过。" };
writeFileSync(resolve(root, "docs/v1.8-fun-gate-readiness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
