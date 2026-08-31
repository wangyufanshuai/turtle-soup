import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createQuestionRoutingOffer, createRuntimeState, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { buildQuestionRoutingRequestBody } from "../apps/web/lib/question-routing-ai.ts";
import { isAllowedAiEndpoint, isLocalHostEndpoint } from "../apps/web/lib/ai-provider-defaults.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v2.7-internal-rc");
const forbidden = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph", "internalEventId", "spoilerAnswerTemplate"];
const caseReports = release.entries.map((entry) => {
  const file = loadCaseFile(entry);
  const state = createRuntimeState(file);
  const projection = JSON.stringify(projectPlayerState(file, state));
  const offer = createQuestionRoutingOffer(file, state, "帮我理解这个问题");
  const body = JSON.stringify(buildQuestionRoutingRequestBody({ enabled: true, endpoint: "https://api.openai.com/v1/chat/completions", model: "audit", protocolMode: "strict-schema", keyStorage: "session" }, offer.context));
  const leaks = forbidden.filter((token) => projection.includes(token) || JSON.stringify(offer.context).includes(token) || body.includes(token));
  const opaqueTokens = offer.context.candidates.every((item) => /^candidate-\d{2}-[0-9a-f]{4}$/u.test(item.token));
  return { caseId: entry.id, opaqueTokens, leaks, passed: opaqueTokens && leaks.length === 0 };
});
function files(dir: string): string[] { return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : []; }
const remoteHosts = new Set<string>();
const staticLeaks: Array<{ file: string; token: string }> = [];
for (const path of files(resolve(root, "apps/web/out"))) {
  const extension = extname(path).toLowerCase();
  if (![".html", ".js", ".json", ".webmanifest"].includes(extension)) continue;
  const source = readFileSync(path, "utf8");
  if (extension === ".html" || extension === ".webmanifest") for (const match of source.matchAll(/(?:src|href|action)=["'](https?:\/\/[^"']+)/gu)) try { remoteHosts.add(new URL(match[1]).hostname); } catch { /* malformed URL */ }
  if (extension === ".js" && /navigator\.sendBeacon|google-analytics|segment\.io|sentry\.io|plausible\.io/iu.test(source)) remoteHosts.add("unexpected-tracker");
  if (extension === ".html") for (const token of forbidden) if (source.includes(token)) staticLeaks.push({ file: path.slice(root.length + 1), token });
}
const worker = readFileSync(resolve(root, "apps/web/workers/mystery-runtime.worker.ts"), "utf8");
const registry = readFileSync(resolve(root, "apps/web/.generated/worker-case-registry.ts"), "utf8");
const workerBoundary = { projectsOnly: worker.includes("projectPlayerState(caseFile, state)"), noCaseFilePostMessage: !worker.includes("postMessage(caseFile"), rejectsUnknownCase: worker.includes("case_load_failed") && registry.includes("Unknown case id") };
const endpointGuards = { remoteHttps: isAllowedAiEndpoint("https://api.openai.com/v1/chat/completions"), remoteHttpRejected: !isAllowedAiEndpoint("http://example.com/v1/chat/completions"), credentialsRejected: !isAllowedAiEndpoint("https://user:secret@example.com/v1/chat/completions"), hostRemoteRejected: !isLocalHostEndpoint("https://example.com/v1/chat/completions"), hostLocalAccepted: isLocalHostEndpoint("http://localhost:11434/v1/chat/completions") };
const sw = existsSync(resolve(root, "apps/web/out/sw.js")) ? readFileSync(resolve(root, "apps/web/out/sw.js"), "utf8") : "";
const serviceWorkerGuards = { profileScoped: sw.includes("black-soup-v27-player-first-rc"), sameOriginOnly: sw.includes("origin !== self.location.origin"), noRuntimeCachePut: !sw.includes("cache.put(") };
const historical = [
  ["v2.5", "dist/turtle-soup-v2.5-internal-rc-web-pwa.zip", "78d1a2b3168a729895734c5858c0415c459661f75ab8445bfaf14c0d514d5eaf"],
  ["v2.6", "dist/turtle-soup-v2.6-internal-rc-web-pwa.zip", "f79a3804dc764f215bbe919a419b67bdc963e4e2126b1c9a3076006b80cab18d"],
].map(([version, file, expected]) => { const path = resolve(root, file); const actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "missing"; return { version, file, expected, actual, unchanged: actual === expected }; });
const unexpectedRemoteHosts = [...remoteHosts].filter((host) => host !== "api.openai.com");
const report = { reportVersion: "2.7", releaseProfile: "v2.7-internal-rc", generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, cases: caseReports, staticLeaks, remoteHosts: [...remoteHosts], unexpectedRemoteHosts, workerBoundary, endpointGuards, serviceWorkerGuards, historicalArtifacts: historical, passed: caseReports.length === 84 && caseReports.every((item) => item.passed) && staticLeaks.length === 0 && unexpectedRemoteHosts.length === 0 && Object.values(workerBoundary).every(Boolean) && Object.values(endpointGuards).every(Boolean) && Object.values(serviceWorkerGuards).every(Boolean) && historical.every((item) => item.unchanged) };
writeFileSync(resolve(root, "docs/v2.7-security-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: caseReports.length, staticLeaks: staticLeaks.length, unexpectedRemoteHosts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
