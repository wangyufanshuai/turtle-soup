import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const directory = resolve(root, "test-data/fun-gate-v1.8");
mkdirSync(directory, { recursive: true });
const roster = Array.from({ length: 15 }, (_, index) => ({
  batchId: `C01-FG-${String(index + 1).padStart(2, "0")}`,
  productTesterId: "由产品导出 JSON 提供",
  viewport: index < 8 ? "desktop" : "mobile",
  answerKnownBeforeSession: false,
  consentRecorded: false,
  sessionFile: null,
  observationFile: null,
}));
const manifest = {
  schemaVersion: 1,
  releaseProfile: "v1.8-internal-rc",
  caseId: "c01-cold-room-knock",
  status: "pending-human-sessions",
  humanParticipants: 0,
  targetSessionCount: 10,
  targetRosterCount: 15,
  noRemoteTracking: true,
  doNotFillSyntheticData: true,
  roster,
};
writeFileSync(resolve(directory, "batch-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(resolve(directory, "README.txt"), "放入 C01 产品测试模式导出的 JSON 文件，以及按 evaluation/c01-observation-template.csv 填写的 observations.csv。不要放入答案、原始问题、命令日志、屏幕录制、访谈全文或含身份信息的文件。聚合器要求 session_id/tester_id 严格配对，缺失记录不会被补造。完成后运行：npm run aggregate:fun-gate -- test-data/fun-gate-v1.8 docs/v1.8-fun-gate-aggregate.json\r\n", "utf8");
const observationsPath = resolve(directory, "observations.csv");
if (!existsSync(observationsPath)) copyFileSync(resolve(root, "evaluation/c01-observation-template.csv"), observationsPath);
console.log(JSON.stringify({ directory, rosterCount: roster.length, observationsPath, status: manifest.status }, null, 2));
