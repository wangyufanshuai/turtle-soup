import assert from "node:assert/strict";
import test from "node:test";
import type { QuestionRoutingContext } from "@turtle-soup/mystery-core";
import { buildQuestionRoutingRequestBody, isAllowedAiEndpoint, routeQuestion, validateQuestionRoute } from "./question-routing-ai.ts";

const context: QuestionRoutingContext = { contextHash: "abc", language: "zh-CN", publicSurface: "一扇关着的门传出敲击声。", rawQuestion: "门是自己锁的吗？", candidates: [{ token: "candidate-01-a1", label: "门会自动上锁吗？", target: "门", predicate: "验证门锁机制" }, { token: "candidate-02-b2", label: "锁门后有人进入吗？", target: "房间", predicate: "排除锁后进入" }] };

test("BYOK endpoints require HTTPS except localhost", () => {
  assert.equal(isAllowedAiEndpoint("https://api.openai.com/v1/chat/completions"), true);
  assert.equal(isAllowedAiEndpoint("http://localhost:11434/v1/chat/completions"), true);
  assert.equal(isAllowedAiEndpoint("http://example.com/v1/chat/completions"), false);
  assert.equal(isAllowedAiEndpoint("https://user:secret@example.com/v1/chat/completions"), false);
  assert.equal(isAllowedAiEndpoint("https://example.com:22/v1/chat/completions"), false);
  assert.equal(isAllowedAiEndpoint("https://example.com/v1/chat/completions#secret"), false);
  assert.equal(isAllowedAiEndpoint("https://example.com/v1/chat/completions\nmalformed"), false);
});

test("AI route output accepts only public candidate tokens", () => {
  assert.deepEqual(validateQuestionRoute({ status: "matched", candidateTokens: ["candidate-01-a1"] }, context), { status: "matched", candidateToken: "candidate-01-a1" });
  assert.deepEqual(validateQuestionRoute({ status: "ambiguous", candidateTokens: ["candidate-01-a1", "candidate-02-b2"] }, context), { status: "ambiguous", candidateTokens: ["candidate-01-a1", "candidate-02-b2"] });
  assert.deepEqual(validateQuestionRoute({ status: "unknown", candidateTokens: [] }, context), { status: "unknown" });
  assert.throws(() => validateQuestionRoute({ status: "matched", candidateTokens: ["query-door-mechanism"] }, context));
  assert.throws(() => validateQuestionRoute({ status: "matched", candidateTokens: [] }, context));
  assert.throws(() => validateQuestionRoute({ status: "matched", candidateTokens: ["candidate-01-a1"], answer: "是" }, context), (error: Error & { code?: string }) => error.code === "unsafe-output");
});

test("AI request body contains public routing context but no truth or secret fields", () => {
  const body = JSON.stringify(buildQuestionRoutingRequestBody({ enabled: true, endpoint: "https://api.openai.com/v1/chat/completions", model: "test-model", protocolMode: "strict-schema", keyStorage: "session" }, context));
  assert.equal(body.includes(context.rawQuestion), true);
  assert.equal(body.includes("candidate-01-a1"), true);
  for (const forbidden of ["solutionCertificate", "canonicalHypothesis", "answerCode", "fact-", "query-", "apiKey", "authorization", "Bearer "]) assert.equal(body.includes(forbidden), false, forbidden);
});

test("AI routing accepts fenced JSON and fails closed across hostile endpoint responses", async () => {
  const settings = { enabled: true, endpoint: "https://example.test/v1/chat/completions", model: "test", protocolMode: "validated-json" as const, keyStorage: "session" as const };
  const originalFetch = globalThis.fetch;
  const run = async (response: () => Promise<Response>) => { globalThis.fetch = response as typeof fetch; try { return await routeQuestion(settings, context, "session-secret"); } finally { globalThis.fetch = originalFetch; } };
  assert.deepEqual(await run(async () => new Response(JSON.stringify({ choices: [{ message: { content: "```json\n{\"status\":\"matched\",\"candidateTokens\":[\"candidate-01-a1\"]}\n```" } }] }), { status: 200 })), { status: "matched", candidateToken: "candidate-01-a1" });
  await assert.rejects(() => run(async () => new Response("boom", { status: 500 })), (error: Error & { code?: string }) => error.code === "network");
  await assert.rejects(() => run(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 })), (error: Error & { code?: string }) => error.code === "invalid-schema");
  await assert.rejects(() => run(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"status\":\"matched\",\"candidateTokens\":[\"forged\"]}" } }] }), { status: 200 })), (error: Error & { code?: string }) => error.code === "invalid-candidate");
  await assert.rejects(() => run(async () => new Response(JSON.stringify({ choices: [{ message: { refusal: "no" }, finish_reason: "content_filter" }] }), { status: 200 })), (error: Error & { code?: string }) => error.code === "refusal");
  await assert.rejects(() => run(async () => { throw new TypeError("CORS blocked"); }), (error: Error & { code?: string }) => error.code === "network");
  await assert.rejects(() => run(async () => new Response("x".repeat(70_000), { status: 200 })), (error: Error & { code?: string }) => error.code === "unsafe-output");
  await assert.rejects(() => routeQuestion(settings, { ...context, rawQuestion: "问".repeat(1001) }, "session-secret"), (error: Error & { code?: string }) => error.code === "unsafe-output");
  await assert.rejects(() => routeQuestion(settings, context, "x".repeat(4097)), (error: Error & { code?: string }) => error.code === "network");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => routeQuestion(settings, context, "session-secret", controller.signal), (error: Error & { code?: string }) => error.code === "timeout");
});
