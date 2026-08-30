import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createQuestionRoutingOffer, createRuntimeState, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { buildQuestionRoutingRequestBody } from "../apps/web/lib/question-routing-ai.ts";
import { isAllowedAiEndpoint, isLocalHostEndpoint } from "../apps/web/lib/ai-provider-defaults.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const out = resolve(root, "apps/web/out");
const release = loadReleaseContent(root, "v2.5-internal-rc");
const forbidden = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph", "internalEventId", "spoilerAnswerTemplate"];
const caseReports = release.entries.map((entry) => {
  const caseFile = loadCaseFile(entry);
  const state = createRuntimeState(caseFile);
  const projection = JSON.stringify(projectPlayerState(caseFile, state));
  const offer = createQuestionRoutingOffer(caseFile, state, "帮我理解这个问题");
  const body = JSON.stringify(buildQuestionRoutingRequestBody({ enabled: true, endpoint: "https://example.invalid/v1/chat/completions", model: "audit", protocolMode: "strict-schema", keyStorage: "session" }, offer.context));
  const context = JSON.stringify(offer.context);
  const leaks = forbidden.filter((token) => projection.includes(token) || context.includes(token) || body.includes(token));
  const opaqueTokens = offer.context.candidates.every((item) => /^candidate-\d{2}-[0-9a-f]{4}$/u.test(item.token));
  return { caseId: entry.id, opaqueTokens, leaks, passed: opaqueTokens && leaks.length === 0 };
});
function files(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : [];
}
const remoteHosts = new Set<string>();
const staticLeaks: Array<{ file: string; token: string }> = [];
for (const path of files(out).filter((item) => [".html", ".js", ".json", ".webmanifest"].includes(extname(item).toLowerCase()))) {
  const source = readFileSync(path, "utf8");
  if (path.endsWith(".html") || path.endsWith(".webmanifest")) for (const match of source.matchAll(/(?:src|href|action)=["'](https?:\/\/[^"']+)/gu)) {
    try { remoteHosts.add(new URL(match[1]).hostname); } catch { /* malformed URL is not a network dependency */ }
  }
  if (path.endsWith(".js") && /navigator\.sendBeacon|google-analytics|segment\.io|sentry\.io|plausible\.io/iu.test(source)) remoteHosts.add("unexpected-tracker");
  if (path.endsWith(".html")) for (const token of forbidden) if (source.includes(token)) staticLeaks.push({ file: path.slice(out.length + 1), token });
}
const workerSource = readFileSync(resolve(root, "apps/web/workers/mystery-runtime.worker.ts"), "utf8");
const registrySource = readFileSync(resolve(root, "apps/web/.generated/worker-case-registry.ts"), "utf8");
const workerBoundary = {
  projectsOnly: workerSource.includes("projectPlayerState(caseFile, state)"),
  noCaseFilePostMessage: !workerSource.includes("postMessage(caseFile"),
  rejectsUnknownCase: workerSource.includes("case_load_failed") && registrySource.includes("Unknown case id"),
};
const endpointGuards = {
  remoteHttps: isAllowedAiEndpoint("https://api.openai.com/v1/chat/completions"),
  remoteHttpRejected: !isAllowedAiEndpoint("http://example.com/v1/chat/completions"),
  credentialsRejected: !isAllowedAiEndpoint("https://user:secret@example.com/v1/chat/completions"),
  hostRemoteRejected: !isLocalHostEndpoint("https://example.com/v1/chat/completions"),
  hostLocalAccepted: isLocalHostEndpoint("http://localhost:11434/v1/chat/completions"),
};
const serviceWorker = existsSync(resolve(root, "apps/web/public/sw.js")) ? readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8") : "";
const serviceWorkerGuards = {
  sameOriginGetOnly: serviceWorker.includes('event.request.method !== "GET"') && serviceWorker.includes("origin !== self.location.origin"),
  noRuntimeCachePut: !serviceWorker.includes("cache.put("),
  profileScopedCleanup: serviceWorker.includes("CACHE_PREFIX"),
};
const unexpectedRemoteHosts = [...remoteHosts].filter((host) => host !== "api.openai.com");
const historical = [
  ["v1.8", "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d"],
  ["v1.9", "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc"],
  ["v2.0", "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273"],
  ["v2.1", "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929"],
  ["v2.2", "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937"],
  ["v2.3", "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4"],
  ["v2.4", "58b4b4f140cbcd959b3578037cbe94894491204d03cbf923ca648f1f927db25f"],
].map(([version, expected]) => {
  const path = resolve(root, `dist/turtle-soup-${version}-internal-rc-web-pwa.zip`);
  const actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "missing";
  return { version, expected, actual, unchanged: actual === expected };
});
const report = {
  reportVersion: "2.5",
  releaseProfile: "v2.5-internal-rc",
  generatedAt: new Date().toISOString(),
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  founderExploratorySessions: 1,
  cases: caseReports,
  staticLeaks,
  remoteHosts: [...remoteHosts],
  unexpectedRemoteHosts,
  workerBoundary,
  endpointGuards,
  serviceWorkerGuards,
  historicalArtifacts: historical,
  passed: caseReports.length === 84 && caseReports.every((item) => item.passed) && staticLeaks.length === 0 && unexpectedRemoteHosts.length === 0 && Object.values(workerBoundary).every(Boolean) && Object.values(endpointGuards).every(Boolean) && Object.values(serviceWorkerGuards).every(Boolean) && historical.every((item) => item.unchanged),
};
writeFileSync(resolve(root, "docs/v2.5-security-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: caseReports.length, staticLeaks: staticLeaks.length, unexpectedRemoteHosts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
