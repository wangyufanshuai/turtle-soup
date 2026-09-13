import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evidenceIdentity, hashBytes, loadRun, pendingGate, sameIdentity, writeReport, type GateEvidence } from "./lib/v212-evidence.ts";
import { uiFlowMatrix } from "./lib/v212-browser-contract.ts";
import { loadReleaseContent } from "./lib/release-content.ts";
import { auditV212ReleaseArtifact } from "./package-v212.ts";

const root = resolve(".");
const identity = loadRun(root);
const { entries, profile } = loadReleaseContent(root, identity.releaseProfile);
function readBoundCheck(name: string): GateEvidence {
  const path = `docs/v2.12-check-${name}.json`;
  if (!existsSync(resolve(root, path))) return pendingGate(name, `Current-run ${name} check`);
  try {
    const value = JSON.parse(readFileSync(resolve(root, path), "utf8"));
    if (value.coverage === "not-run" && value.passed === null && typeof value.reason === "string" && value.reason.trim()) {
      return { ...pendingGate(name, value.scope ?? name, value.reason), evidence: [path] };
    }
    const evidenceValid = Array.isArray(value.evidence) && value.evidence.length > 0 && value.evidence.every((item: { path: string; sha256: string }) => item.path.startsWith(`output/v212/${identity.runId}/`) && !item.path.split("/").includes("..") && existsSync(resolve(root, item.path)) && hashBytes(readFileSync(resolve(root, item.path))) === item.sha256);
    const passed = sameIdentity(identity, value) && value.sourceHead === identity.sourceHead && value.passed === true && ["measured", "static"].includes(value.coverage) && evidenceValid;
    return { id: name, coverage: passed ? value.coverage : "failed", passed, scope: value.scope ?? name, evidence: [path], ...(!passed ? { reason: "Failed, stale or incomplete evidence; existence/top-level passed alone is insufficient" } : {}) };
  } catch { return { id: name, scope: name, coverage: "failed", passed: false, evidence: [path], reason: "Invalid evidence document" }; }
}
const checks = ["core", "integrity", "typecheck-core", "typecheck-web", "frozen"].map(readBoundCheck);
const flows = uiFlowMatrix(root, identity);
const obligations = [
  pendingGate("historical-save-oracle", "Historical schema-one command bytes replayed against independently frozen expected outcomes; distinguish irrecoverable legacy ambiguity logs"),
  pendingGate("offline-all-cases", "Complete offline package with actual Service Worker and case startup/recovery"),
  pendingGate("ai-fail-closed-ui", "AI disabled/unavailable/malicious UI flow completion without changing deterministic answers"),
  pendingGate("visual-and-accessibility", "Desktop/mobile keyboard and touch, text scale, focus return, focus visibility, reduced motion, high contrast, axe results for executed engines"),
  pendingGate("release-zip", "Independent v2.12 ZIP with exact artifact fingerprint and all older ZIP hashes unchanged"),
];
// Specialized bound evidence reports may satisfy a gate, but must carry real artifact refs.
for (const gate of obligations) {
  const measured = readBoundCheck(gate.id);
  if (measured.coverage !== "not-run" || measured.evidence.length > 0) Object.assign(gate, measured);
  if (gate.id === "release-zip" && gate.passed === true) {
    try { Object.assign(gate, auditV212ReleaseArtifact(root, identity)); }
    catch (error) { Object.assign(gate, { coverage: "failed", passed: false, reason: `Release ZIP bytes or assembly prerequisites are stale/invalid: ${String(error)}` }); }
  }
}
const gates = [...checks, ...flows, ...obligations];
const passed = identity.buildHash !== null && profile.status === "internal-rc" && profile.publishable === false && profile.humanEvaluation === "pending" && gates.every((gate) => gate.passed === true) && sameIdentity(identity, evidenceIdentity(root, identity.runId));
writeReport(root, "docs/v2.12-browser-matrix.json", { ...identity, measuredAt: new Date().toISOString(), scope: "C01/C61/C84 known-solution UI execution matrix only; unavailable engines remain not-run", caseCount: entries.length, flows, passed: flows.every((gate) => gate.passed === true) });
writeReport(root, "docs/v2.12-release-verification.json", { ...identity, measuredAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, caseCount: entries.length, gates, passed, qualification: "No prior release report is imported as current evidence. Static contracts, observed execution, skipped/not-run and failed gates remain distinct. Automation does not measure enjoyment or human comprehension." });
console.log(JSON.stringify({ passed, measured: gates.filter((gate) => gate.coverage === "measured" && gate.passed).length, static: gates.filter((gate) => gate.coverage === "static" && gate.passed).length, failed: gates.filter((gate) => gate.coverage === "failed").length, notRun: gates.filter((gate) => gate.coverage === "not-run").length }, null, 2));
if (!passed) process.exitCode = 1;
