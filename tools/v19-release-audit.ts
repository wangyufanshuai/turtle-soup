import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const exists = (path: string) => existsSync(resolve(root, path));
const profile = read<any>("content/zh/releases/v1.9-internal-rc.json");
const current = loadReleaseContent(root, "v1.9-internal-rc");
const prior = loadReleaseContent(root, "v1.8-internal-rc");
const priorById = new Map(prior.entries.map((entry) => [entry.id, entry]));
const frozen = current.entries.map((entry) => {
  const old = priorById.get(entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: old?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: old?.contentVersion === entry.contentVersion, casePathUnchanged: old?.casePath === entry.casePath };
});
const browser = read<any>("docs/v1.9-browser-matrix.json");
const visual = read<any>("docs/v1.9-visual-regression.json");
const performance = read<any>("docs/v1.9-static-performance.json");
const security = read<any>("docs/v1.9-ai-routing-security.json");
const save = read<any>("docs/v1.9-save-compatibility.json");
const artifact = read<any>("docs/v1.9-release-artifacts.json");
const required = [
  "content/zh/releases/v1.9-internal-rc.json",
  "docs/v1.9-internal-rc.md",
  "docs/v1.9-founder-pilot.md",
  "docs/v1.9-browser-matrix.json",
  "docs/v1.9-visual-regression.json",
  "docs/v1.9-static-performance.json",
  "docs/v1.9-ai-routing-security.json",
  "docs/v1.9-save-compatibility.json",
  "docs/v1.9-release-artifacts.json",
  "dist/turtle-soup-v1.9-internal-rc-web-pwa.zip",
];
const v18Path = resolve(root, "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip");
const v18Hash = existsSync(v18Path) ? createHash("sha256").update(readFileSync(v18Path)).digest("hex") : "missing";
const gates = {
  releaseProfile: profile.id === "v1.9-internal-rc" && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending" && profile.formalFunGateParticipants === 0,
  caseCatalog: current.entries.length === 60,
  frozenCompatibility: frozen.length === 60 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  browser: browser.passed === true && browser.caseCount === 60 && browser.screenshotCount === 25 && browser.consoleErrorCount === 0 && browser.offlineRecovery?.passed === true,
  visual: visual.passed === true && visual.screenshots?.length === 25,
  performance: performance.passed === true && performance.actual.totalBytes <= 7_000_000 && performance.actual.initialJavaScriptBytes <= 750_000 && performance.actual.maximumAssetBytes <= 450_000,
  security: security.passed === true && security.v18Artifact?.unchanged === true && security.unexpectedRemoteHosts?.length === 0,
  saveCompatibility: save.passed === true && save.cases?.length === 60 && save.saveSchemaVersion === 1,
  artifact: artifact.passed === true && artifact.preservedArtifacts?.every((item: any) => item.unchanged),
  v18ArtifactUnchanged: v18Hash === "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d",
  requiredOutputs: required.every(exists),
};
const report = {
  reportVersion: "1.9",
  verifiedAt: new Date().toISOString(),
  releaseProfile: "v1.9-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  caseCount: current.entries.length,
  baselineHead: "bb4c81b7d399037693c059d1ada481ca898cf368",
  frozen,
  reports: { browser: "docs/v1.9-browser-matrix.json", visual: "docs/v1.9-visual-regression.json", performance: "docs/v1.9-static-performance.json", security: "docs/v1.9-ai-routing-security.json", save: "docs/v1.9-save-compatibility.json", artifact: "docs/v1.9-release-artifacts.json" },
  gates,
  passed: Object.values(gates).every(Boolean),
  qualification: "v1.9 自动化验证冻结了案件身份、旧存档、AI 语言桥的失败关闭、统一调查 Shell、三浏览器可操作性、离线恢复、性能与反泄漏。创始人探索性试跑为 1，正式 Fun Gate 人数为 0；这些结果不能证明乐趣、审美、理解率、留存或市场适配。",
};
writeFileSync(resolve(root, "docs/v1.9-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, gates }, null, 2));
if (!report.passed) process.exitCode = 1;
