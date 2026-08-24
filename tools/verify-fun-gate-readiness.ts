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
const requiredFiles = ["evaluation/fun-gate-v1.8-runbook.md", "evaluation/moderator-protocol.md", "evaluation/tester-instructions.md", "evaluation/c01-observation-template.csv", "evaluation/c01-post-test-interview.md", "test-data/fun-gate-v1.8/batch-manifest.json", "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip"];
const gates = {
  frozenV18Cases: frozenCases,
  frozenArchiveHash: archiveHash === artifact.artifact.archive.sha256 && archiveHash === "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d",
  batchPrepared: batch.status === "pending-human-sessions" && batch.humanParticipants === 0 && batch.roster.length === 15,
  emptyAggregateHonest: aggregate.sessionCount === 0 && aggregate.uniqueTesterCount === 0 && aggregate.funGate.status === "insufficient-human-sessions",
  anonymousExport: sessionSource.includes("randomId(\"tester\")") && sessionSource.includes("toTestSessionExport") && toolsSource.includes("导出 JSON") && toolsSource.includes("导出 CSV"),
  noRawQuestionAggregation: aggregateSource.includes("rawQuestionOrTruthFieldsAccepted: false") && aggregateSource.includes("value.caseId !== \"c01-cold-room-knock\""),
  requiredProtocolFiles: requiredFiles.every((path) => existsSync(resolve(root, path))),
};
const report = { reportVersion: "1.8", generatedAt: new Date().toISOString(), releaseProfile: "v1.8-internal-rc", caseId: "c01-cold-room-knock", status: "ready-for-human-sessions / fun-gate-pending", humanParticipants: 0, targetParticipants: { minimum: 10, preferred: 15 }, recordingConsent: "pending-user-decision", localServer: "http://127.0.0.1:4173/case/c01-cold-room-knock/", archiveSha256: archiveHash, gates, passed: Object.values(gates).every(Boolean), blocker: "需要 10–15 位不知道答案的真人测试者及主持人观察数据。", qualification: "该报告只证明评测执行环境和数据边界就绪；没有真人数据时不能计算或宣称 Fun Gate 通过。" };
writeFileSync(resolve(root, "docs/v1.8-fun-gate-readiness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
