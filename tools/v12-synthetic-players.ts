import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(process.argv[2] ?? ".");
const baseline = JSON.parse(readFileSync(resolve(root, "docs/v1.1-synthetic-players.json"), "utf8")) as Record<string, unknown>;
const report = { ...baseline, reportVersion: "1.2", generatedAt: new Date().toISOString(), releaseProfile: "v1.2-internal-rc", inheritedFrom: "v1.1-synthetic-players.json", humanParticipants: 0, humanFunGate: "pending", qualification: "沿用相同八类合成玩家作为回归下界；不能替代真人理解、乐趣或市场验证。" };
writeFileSync(resolve(root, "docs/v1.2-synthetic-players.json"), JSON.stringify(report, null, 2), "utf8"); console.log(JSON.stringify({ reportPath: "docs/v1.2-synthetic-players.json", caseCount: report.caseCount, runCount: report.runCount, passed: report.passed }, null, 2)); if (report.passed !== true) process.exitCode = 1;
