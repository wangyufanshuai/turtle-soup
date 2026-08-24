import { mkdirSync, writeFileSync } from "node:fs";
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
writeFileSync(resolve(directory, "README.txt"), "仅放入 C01 产品测试模式导出的 JSON 文件。不要放入答案、原始问题、命令日志、屏幕录制或含身份信息的文件。完成后运行：npm run aggregate:fun-gate -- test-data/fun-gate-v1.8 docs/v1.8-fun-gate-aggregate.json\r\n", "utf8");
console.log(JSON.stringify({ directory, rosterCount: roster.length, status: manifest.status }, null, 2));
