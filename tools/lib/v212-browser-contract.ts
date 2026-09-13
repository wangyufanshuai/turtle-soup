import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashBytes, sameIdentity, type EvidenceIdentity, type GateEvidence, pendingGate } from "./v212-evidence.ts";

export const V212_FLOW_CASES = ["c01-cold-room-knock", "c61-missing-tape-turn", "c84-handoff-after-stop"] as const;
export const V212_BROWSER_ENGINES = ["chromium", "firefox", "webkit"] as const;
export const V212_VIEWPORTS = ["1440x900", "390x844"] as const;
export const V212_FLOW_STAGES = ["clean-start", "opening-observation", "natural-questions", "ambiguity-confirmation", "ambiguity-refresh", "evidence-inspection", "wrong-theory", "proof-gap", "organize-proof", "correct-submission", "proof-replay", "refresh-recovery"] as const;

export interface UiFlowObservation {
  stage: typeof V212_FLOW_STAGES[number];
  method: "visible-ui-action" | "visible-ui-observation" | "page-reload";
  action: string;
  observed: string;
  passed: boolean;
  evidence: Array<{ path: string; sha256: string }>;
}
export interface UiFlowReceipt extends EvidenceIdentity {
  caseId: string;
  engine: string;
  viewport: string;
  startedAt: string;
  completedAt: string;
  mode: "known-solution-ui-execution";
  initialState: "fresh-browser-origin" | "ui-restart";
  saveInjection: false;
  workerCommandInjection: false;
  hiddenStateReadDuringExecution: false;
  naturalQuestionCount: number;
  observations: UiFlowObservation[];
}

function validFile(root: string, artifact: { path: string; sha256: string }) {
  if (!/^output\/v212\/[a-zA-Z0-9_.\/-]+$/u.test(artifact.path) || artifact.path.split("/").includes("..")) return false;
  return existsSync(resolve(root, artifact.path)) && hashBytes(readFileSync(resolve(root, artifact.path))) === artifact.sha256;
}

export function validateUiFlow(root: string, identity: EvidenceIdentity, receipt: UiFlowReceipt, caseId: string, engine: string, viewport: string): GateEvidence {
  const id = `${caseId}/${engine}/${viewport}`;
  const failures: string[] = [];
  if (!sameIdentity(identity, receipt)) failures.push("stale or mismatched source/build/run identity");
  if (receipt.caseId !== caseId || receipt.engine !== engine || receipt.viewport !== viewport) failures.push("scope mismatch");
  if (receipt.mode !== "known-solution-ui-execution" || !["fresh-browser-origin", "ui-restart"].includes(receipt.initialState)) failures.push("unknown execution method");
  if (receipt.saveInjection !== false || receipt.workerCommandInjection !== false || receipt.hiddenStateReadDuringExecution !== false) failures.push("injected or introspected state cannot prove a UI investigation");
  if (!Number.isInteger(receipt.naturalQuestionCount) || receipt.naturalQuestionCount < 3) failures.push("fewer than three natural questions");
  if (!Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) failures.push("invalid observation times");
  const stages = receipt.observations ?? [];
  for (const stage of V212_FLOW_STAGES) {
    const observation = stages.find((item) => item.stage === stage);
    if (!observation || !observation.passed || !observation.action?.trim() || !observation.observed?.trim()) failures.push(`missing/failed observation: ${stage}`);
    else if (!observation.evidence?.length || !observation.evidence.every((entry) => validFile(root, entry))) failures.push(`missing/changed artifact: ${stage}`);
  }
  return { id, coverage: failures.length ? "failed" : "measured", passed: failures.length === 0, scope: "Known-solution, visible-UI investigation; not a blind player test or proof of enjoyment", evidence: stages.flatMap((item) => item.evidence?.map((entry) => entry.path) ?? []), ...(failures.length ? { reason: failures.join("; ") } : {}) };
}

export function uiFlowMatrix(root: string, identity: EvidenceIdentity): GateEvidence[] {
  return V212_FLOW_CASES.flatMap((caseId) => V212_BROWSER_ENGINES.flatMap((engine) => V212_VIEWPORTS.map((viewport) => {
    const path = `output/v212/${identity.runId}/flows/${caseId}-${engine}-${viewport}.json`;
    if (!existsSync(resolve(root, path))) return pendingGate(`${caseId}/${engine}/${viewport}`, "Fresh UI-only investigation including ambiguity/refresh, incorrect proof, correct proof and replay");
    try { return validateUiFlow(root, identity, JSON.parse(readFileSync(resolve(root, path), "utf8")), caseId, engine, viewport); }
    catch { return { id: `${caseId}/${engine}/${viewport}`, scope: "UI-only flow", coverage: "failed", passed: false, reason: "invalid receipt JSON", evidence: [path] }; }
  })));
}
