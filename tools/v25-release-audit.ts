import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCaseShape } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const profileId = "v2.5-internal-rc";
const current = loadReleaseContent(root, profileId);
const baseline = loadReleaseContent(root, "v2.4-internal-rc");
const baselineById = new Map(baseline.entries.map((entry) => [entry.id, entry]));
const frozen = baseline.entries.map((entry) => {
  const next = current.entries.find((item) => item.id === entry.id);
  return { caseId: entry.id, canonicalHashUnchanged: next?.canonicalHash === entry.canonicalHash, contentVersionUnchanged: next?.contentVersion === entry.contentVersion, casePathUnchanged: next?.casePath === entry.casePath };
});
const caseChecks = current.entries.map((entry) => {
  try {
    const caseFile = loadCaseFile(entry);
    validateCaseShape(caseFile);
    return {
      caseId: entry.id,
      seasonId: entry.seasonId,
      canonicalHash: entry.canonicalHash,
      schemaValid: true,
      events: caseFile.events.length,
      facts: caseFile.facts.length,
      evidence: caseFile.evidenceItems.length,
      boards: caseFile.reasoningBoards?.map((board) => board.mode) ?? [],
      proofObligationKinds: caseFile.solutionCertificate.proofObligations?.map((obligation) => obligation.kind) ?? [],
      replayBeats: caseFile.proofReplay.length,
    };
  } catch (error) {
    return { caseId: entry.id, canonicalHash: entry.canonicalHash, schemaValid: false, error: error instanceof Error ? error.message : String(error) };
  }
});
const hashes = new Set<string>();
const fingerprintMap = new Map<string, string>();
const duplicateHashes: string[] = [], duplicateFingerprints: Array<{ caseId: string; duplicateOf: string }> = [];
for (const check of caseChecks) {
  if (hashes.has(check.canonicalHash)) duplicateHashes.push(check.caseId); else hashes.add(check.canonicalHash);
  if (!check.schemaValid || check.boards.length === 0) continue;
  const fingerprint = check.boards.join("+");
  const previous = fingerprintMap.get(fingerprint);
  if (previous && check.seasonId === "season-5") duplicateFingerprints.push({ caseId: check.caseId, duplicateOf: previous });
  else if (!previous) fingerprintMap.set(fingerprint, check.caseId);
}
const requiredReports = [
  "docs/v2.5-browser-matrix.json", "docs/v2.5-visual-regression.json", "docs/v2.5-static-performance.json", "docs/v2.5-security-scan.json",
  "docs/v2.5-save-compatibility.json", "docs/v2.5-fairness.json", "docs/v2.5-release-artifacts.json", "docs/v2.5-content-difference.json",
  "docs/v2.5-asset-provenance.json", "docs/v2.5-validation-output.json", "docs/v2.5-internal-rc.md", "docs/v2.5-precache.json",
  "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip",
];
const reportStatus = requiredReports.map((path) => ({ path, exists: existsSync(resolve(root, path)) }));
const passedJsonReports = requiredReports
  .filter((path) => path.endsWith(".json") && path !== "docs/v2.5-validation-output.json")
  .map((path) => {
    try {
      const report = JSON.parse(readFileSync(resolve(root, path), "utf8")) as { passed?: boolean };
      return { path, passed: report.passed === true };
    } catch {
      return { path, passed: false };
    }
  });
let validationOutputPassed = false;
try {
  const validation = JSON.parse(readFileSync(resolve(root, "docs/v2.5-validation-output.json"), "utf8")) as { profile?: string; caseCount?: number; reports?: Array<{ passed?: boolean }> };
  validationOutputPassed = validation.profile === profileId && validation.caseCount === 84 && validation.reports?.length === 84 && validation.reports.every((item) => item.passed === true);
} catch {
  validationOutputPassed = false;
}
const archiveHash = (path: string) => existsSync(resolve(root, path)) ? createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") : "missing";
const preservedArtifacts = [
  ["v1.8", "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d"],
  ["v1.9", "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc"],
  ["v2.0", "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273"],
  ["v2.1", "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929"],
  ["v2.2", "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937"],
  ["v2.3", "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4"],
  ["v2.4", "58b4b4f140cbcd959b3578037cbe94894491204d03cbf923ca648f1f927db25f"],
].map(([version, expected]) => ({ version, expected, actual: archiveHash(`dist/turtle-soup-${version}-internal-rc-web-pwa.zip`), unchanged: archiveHash(`dist/turtle-soup-${version}-internal-rc-web-pwa.zip`) === expected }));
const profile = current.profile;
const gates = {
  profile: profile.id === profileId && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending",
  participants: (JSON.parse(readFileSync(resolve(root, "content/zh/releases/v2.5-internal-rc.json"), "utf8")) as { formalFunGateParticipants?: number }).formalFunGateParticipants === 0,
  caseCount: current.entries.length === 84,
  season5Count: current.entries.filter((entry) => entry.seasonId === "season-5").length === 24,
  frozen: frozen.length === 60 && frozen.every((item) => item.canonicalHashUnchanged && item.contentVersionUnchanged && item.casePathUnchanged),
  schemaAndReferences: caseChecks.length === 84 && caseChecks.every((item) => item.schemaValid),
  uniqueHashes: duplicateHashes.length === 0,
  uniqueFingerprints: duplicateFingerprints.length === 0,
  reports: reportStatus.every((item) => item.exists),
  reportResults: passedJsonReports.every((item) => item.passed) && validationOutputPassed,
  preservedArtifacts: preservedArtifacts.every((item) => item.unchanged),
};
const report = {
  reportVersion: "2.5",
  releaseProfile: profileId,
  verifiedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  caseCount: current.entries.length,
  season5Count: current.entries.filter((entry) => entry.seasonId === "season-5").length,
  frozen,
  caseChecks,
  duplicateHashes,
  duplicateFingerprints,
  requiredReports: reportStatus,
  passedJsonReports,
  validationOutputPassed,
  preservedArtifacts,
  gates,
  passed: Object.values(gates).every(Boolean),
  qualification: "v2.5 扩展至 84 案并通过确定性内容、存档、反泄漏、浏览器、性能和工件隔离门禁；正式真人 Fun Gate 参与人数仍为 0，不能据此宣称已验证乐趣、理解率、留存或市场适配。",
};
writeFileSync(resolve(root, "docs/v2.5-release-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ caseCount: report.caseCount, season5Count: report.season5Count, gates, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
