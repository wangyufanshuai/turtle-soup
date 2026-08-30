import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { createQuestionRoutingOffer, createRuntimeState, projectPlayerState } from "../packages/mystery-core/src/index.ts";
import { buildQuestionRoutingRequestBody } from "../apps/web/lib/question-routing-ai.ts";
import { isAllowedAiEndpoint, isLocalHostEndpoint } from "../apps/web/lib/ai-provider-defaults.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const v24 = process.argv.includes("--v24"), v23 = process.argv.includes("--v23"), v22 = process.argv.includes("--v22"), version = v24 ? "2.4" : v23 ? "2.3" : v22 ? "2.2" : "2.1", profileId = `v${version}-internal-rc`;
const root = resolve(process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "."), out = resolve(root, "apps/web/out"), release = loadReleaseContent(root, profileId);
const forbidden = ["solutionCertificate", "canonicalHypothesisId", "requiredFactIds", "alternativeHypothesisIds", "hiddenFacts", "truthGraph", "internalEventId", "spoilerAnswerTemplate"];
const cases = release.entries.map((entry) => {
  const caseFile = loadCaseFile(entry), state = createRuntimeState(caseFile), projection = JSON.stringify(projectPlayerState(caseFile, state)), offer = createQuestionRoutingOffer(caseFile, state, "请帮我理解这个问题"), context = JSON.stringify(offer.context), body = JSON.stringify(buildQuestionRoutingRequestBody({ enabled: true, endpoint: "https://example.invalid/v1/chat/completions", model: "audit", protocolMode: "strict-schema", keyStorage: "session" }, offer.context));
  const leaks = forbidden.filter((token) => projection.includes(token) || context.includes(token) || body.includes(token));
  const opaqueTokens = offer.context.candidates.every((item) => /^candidate-\d{2}-[0-9a-f]{4}$/u.test(item.token));
  return { caseId: entry.id, opaqueTokens, leaks, passed: opaqueTokens && leaks.length === 0 };
});
function files(dir: string): string[] { return existsSync(dir) ? readdirSync(dir).flatMap((name) => { const path = resolve(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; }) : []; }
const remoteHosts = new Set<string>(), staticLeaks: Array<{ file: string; token: string }> = [], outputFiles = files(out).filter((item) => [".html", ".js", ".json", ".webmanifest"].includes(extname(item).toLowerCase()));
for (const path of outputFiles) {
  const source = readFileSync(path, "utf8");
  if (path.endsWith(".html") || path.endsWith(".webmanifest")) for (const match of source.matchAll(/(?:src|href|action)=["'](https?:\/\/[^"']+)/gu)) { try { remoteHosts.add(new URL(match[1]).hostname); } catch { /* malformed URL is ignored by browser */ } }
  if (path.endsWith(".js") && /navigator\.sendBeacon|google-analytics|segment\.io|sentry\.io|plausible\.io/iu.test(source)) remoteHosts.add("unexpected-tracker");
  if (path.endsWith(".html")) for (const token of forbidden) if (source.includes(token)) staticLeaks.push({ file: path.slice(out.length + 1), token });
}
const artifactExpectations = [
  { version: "v1.8", path: "dist/turtle-soup-v1.8-internal-rc-web-pwa.zip", expected: "43b6dff6b70abec6a74788bb28fba6f7301eb91dd892818584c82f48fc88d30d" },
  { version: "v1.9", path: "dist/turtle-soup-v1.9-internal-rc-web-pwa.zip", expected: "c3c074e1170ca2efd7db0b3c0437873dc7d8633074ab4ff4c62c5b7910a8a6fc" },
  { version: "v2.0", path: "dist/turtle-soup-v2.0-internal-rc-web-pwa.zip", expected: "76e8d237acdc94f99f8cf48ca25bc8f1b22b6bdc86ce2a74153700d290a27273" },
  ...(v22 ? [{ version: "v2.1", path: "dist/turtle-soup-v2.1-internal-rc-web-pwa.zip", expected: "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929" }] : []),
  ...(v23 ? [{ version: "v2.1", path: "dist/turtle-soup-v2.1-internal-rc-web-pwa.zip", expected: "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929" }, { version: "v2.2", path: "dist/turtle-soup-v2.2-internal-rc-web-pwa.zip", expected: "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937" }] : []),
  ...(v24 ? [{ version: "v2.1", path: "dist/turtle-soup-v2.1-internal-rc-web-pwa.zip", expected: "af82f2ea2c7c29f4d934726afd96be5319b68693dcb9ed61747d36e784784929" }, { version: "v2.2", path: "dist/turtle-soup-v2.2-internal-rc-web-pwa.zip", expected: "730a4364fbde1520214f00fc9afdf5f6605259359e695498486e83da35b6b937" }, { version: "v2.3", path: "dist/turtle-soup-v2.3-internal-rc-web-pwa.zip", expected: "e88a0b12d9437cd3c9e3d94bce81481756629ae19439cfd93ed406f45586f9d4" }] : []),
].map((item) => { const path = resolve(root, item.path), actual = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "missing"; return { ...item, actual, unchanged: actual === item.expected }; });
const endpointGuards = { remoteHttps: isAllowedAiEndpoint("https://api.openai.com/v1/chat/completions"), remoteHttpRejected: !isAllowedAiEndpoint("http://example.com/v1/chat/completions"), credentialsRejected: !isAllowedAiEndpoint("https://user:secret@example.com/v1/chat/completions"), dangerousPortRejected: !isAllowedAiEndpoint("https://example.com:22/v1/chat/completions"), hostRemoteRejected: !isLocalHostEndpoint("https://example.com/v1/chat/completions"), hostLocalAccepted: isLocalHostEndpoint("http://localhost:11434/v1/chat/completions") };
const serviceWorker = existsSync(resolve(root, "apps/web/public/sw.js")) ? readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8") : "";
const expectedCachePrefix = v24 ? "black-soup-v24-" : v23 ? "black-soup-v23-" : v22 ? "black-soup-v22-" : "black-soup-v21-", expectedCache = v24 ? "black-soup-v24-investigation-rhythm-rc-1" : v23 ? "black-soup-v23-resolution-payoff-rc-1" : v22 ? "black-soup-v22-cognitive-friction-rc-1" : "black-soup-v21-experience-continuity-rc-1";
const serviceWorkerGuards = { profileScopedCache: serviceWorker.includes(expectedCachePrefix) && serviceWorker.includes(expectedCache), sameOriginGetOnly: serviceWorker.includes('event.request.method !== "GET"') && serviceWorker.includes("origin !== self.location.origin"), noRuntimeCachePut: !serviceWorker.includes("cache.put("), queryResponsesNotStatic: serviceWorker.includes("url.search ? undefined"), profileScopedCleanup: serviceWorker.includes("key.startsWith(CACHE_PREFIX)") };
const unexpectedRemoteHosts = [...remoteHosts].filter((host) => host !== "api.openai.com");
const passed = cases.length === 60 && cases.every((item) => item.passed) && staticLeaks.length === 0 && unexpectedRemoteHosts.length === 0 && artifactExpectations.every((item) => item.unchanged) && Object.values(endpointGuards).every(Boolean) && Object.values(serviceWorkerGuards).every(Boolean);
const report = { reportVersion: version, releaseProfile: profileId, generatedAt: new Date().toISOString(), status: "internal-rc / human-evaluation-pending", humanParticipants: 0, founderExploratorySessions: 1, cases, staticLeaks, remoteHosts: [...remoteHosts], unexpectedRemoteHosts, artifacts: artifactExpectations, endpointGuards, serviceWorkerGuards, passed };
writeFileSync(resolve(root, `docs/v${version}-security-scan.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ cases: cases.length, staticLeaks, artifacts: artifactExpectations, endpointGuards, serviceWorkerGuards, passed }, null, 2));
if (!passed) process.exitCode = 1;
