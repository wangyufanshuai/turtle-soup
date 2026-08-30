import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : "2.1", profileId = `v${version}-internal-rc`, baselineProfile = v24 ? "v2.3-internal-rc" : v23 ? "v2.2-internal-rc" : v22 ? "v2.1-internal-rc" : "v2.0-internal-rc";
const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "."), read = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T, exists = (path: string) => existsSync(resolve(root, path));
const profile = read<any>(`content/zh/releases/${profileId}.json`), current = loadReleaseContent(root, profileId), prior = loadReleaseContent(root, baselineProfile), priorById = new Map(prior.entries.map((entry) => [entry.id, entry]));
const frozen = current.entries.map((entry) => { const old = priorById.get(entry.id); return { caseId: entry.id, canonicalHashUnchanged: old?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: old?.contentVersion === entry.contentVersion, casePathUnchanged: old?.casePath === entry.casePath }; });
const readReport = <T>(path: string, fallback: T) => exists(path) ? read<T>(path) : fallback;
const browser = readReport<any>(`docs/v${version}-browser-matrix.json`, { passed: false }), visual = readReport<any>(`docs/v${version}-visual-regression.json`, { passed: false }), performance = readReport<any>(`docs/v${version}-static-performance.json`, { passed: false }), security = readReport<any>(`docs/v${version}-security-scan.json`, { passed: false }), save = readReport<any>(`docs/v${version}-save-compatibility.json`, { passed: false }), experience = readReport<any>(`docs/v${version}-autonomous-experience.json`, { passed: false }), dependency = readReport<any>(`docs/v${version}-dependency-audit.json`, { passed: false }), artifact = readReport<any>(`docs/v${version}-release-artifacts.json`, { passed: false });
const required = [`content/zh/releases/${profileId}.json`, `docs/v${version}-internal-rc.md`, `docs/v${version}-browser-matrix.json`, `docs/v${version}-visual-regression.json`, `docs/v${version}-static-performance.json`, `docs/v${version}-security-scan.json`, `docs/v${version}-save-compatibility.json`, `docs/v${version}-autonomous-experience.json`, `docs/v${version}-dependency-audit.json`, `docs/v${version}-release-artifacts.json`, `docs/v${version}-precache.json`, `dist/turtle-soup-${profileId}-web-pwa.zip`];
const hash = (path: string) => exists(path) ? createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") : "missing";
const gates = {
  releaseProfile: profile.id === profileId && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending" && profile.formalFunGateParticipants === 0,
  caseCatalog: current.entries.length === 60,
  frozenCompatibility: frozen.length === 60 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  browser: browser.passed === true && browser.caseCount === 60 && browser.consoleErrorCount === 0 && browser.offlineRecovery?.passed === true,
  visual: visual.passed === true && visual.contracts?.fourWorkspaces === true && visual.contracts?.caseUiContinuation === true && (!(v22 || v23 || v24) || ["quickQuestionStarts", "sessionDraftContinuation", "proofContext", "evidenceToProofBridge", "discoveredEvidenceNotExamined"].every((key) => visual.contracts?.[key] === true)) && (!(v23 || v24) || ["solvedArchiveFirst", "solvedEditingHidden", "seasonTabsKeyboard"].every((key) => visual.contracts?.[key] === true)) && (!v24 || ["workspaceDeepLinks", "answerToEvidenceBridge", "progressiveReplay", "evidenceActionPriority", "localizedCatalogLabels"].every((key) => visual.contracts?.[key] === true)),
  performance: performance.passed === true,
  security: security.passed === true,
  saveCompatibility: save.passed === true && save.saveSchemaVersion === 1,
  autonomousExperience: experience.passed === true && experience.cases?.length === 60,
  dependencyAudit: dependency.passed === true,
  artifact: artifact.passed === true && artifact.preservedArtifacts?.every((item: any) => item.unchanged),
  priorArtifactsUnchanged: hash("dist/turtle-soup-v1.8-internal-rc-web-pwa.zip") === "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d" && hash("dist/turtle-soup-v1.9-internal-rc-web-pwa.zip") === "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc" && hash("dist/turtle-soup-v2.0-internal-rc-web-pwa.zip") === "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273" && (!(v22 || v23 || v24) || hash("dist/turtle-soup-v2.1-internal-rc-web-pwa.zip") === "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929") && (!(v23 || v24) || hash("dist/turtle-soup-v2.2-internal-rc-web-pwa.zip") === "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937") && (!v24 || hash("dist/turtle-soup-v2.3-internal-rc-web-pwa.zip") === "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4"),
  requiredOutputs: required.every(exists),
};
const report = { reportVersion: version, verifiedAt: new Date().toISOString(), releaseProfile: profileId, status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, caseCount: current.entries.length, baselineProfile, frozen, gates, passed: Object.values(gates).every(Boolean), qualification: v24 ? "v2.4 自动化验证覆盖回答到证据的节奏交接、工作区深链接、逐拍回放、证据操作优先级、本地化目录标签、三浏览器、离线、性能、存档、安全与旧工件隔离。正式 Fun Gate 人数仍为 0；不能据此宣称已验证乐趣、审美、理解率、留存或市场适配。" : v23 ? "v2.3 自动化验证覆盖结案回报、只读证据回放、公开结案统计、调查工具预热、季节键盘切换、三浏览器、离线、性能、存档、安全与旧工件隔离。正式 Fun Gate 人数仍为 0；不能据此宣称已验证乐趣、审美、理解率、留存或市场适配。" : v22 ? "v2.2 自动化验证覆盖首问起点、会话草稿续接、证据到证明交接、公开证明结构、三浏览器、离线、性能、存档、安全与旧工件隔离。正式 Fun Gate 人数仍为 0；不能据此宣称已验证乐趣、审美、理解率、留存或市场适配。" : "v2.1 自动化验证覆盖体验连续性、键盘快捷、草稿保留、精通轮换、三浏览器、离线、性能、存档、安全与旧工件隔离。正式 Fun Gate 人数仍为 0；不能据此宣称已验证乐趣、审美、理解率、留存或市场适配。" };
writeFileSync(resolve(root, `docs/v${version}-release-verification.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: report.passed, gates }, null, 2));
if (!report.passed) process.exitCode = 1;
