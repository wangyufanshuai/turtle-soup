import assert from "node:assert/strict";
import test from "node:test";
import { hostRewriteCacheKey, isLocalHostEndpoint, validateHostRewriteResponse } from "./host-rewrite.ts";
import type { PresentationContext } from "@turtle-soup/mystery-core";

const context: PresentationContext = { caseId: "c25-silent-second-bell", caseVersion: 1, language: "zh-CN", answerCode: "yes", deterministicText: "是。当前公开来源支持这个判断。", playerQuestion: "按钮真的按了两次吗？", visibleEvidence: [{ title: "按钮波形", observation: "波形记录两次接点闭合。" }], hintLevel: "none", requestedStyle: "档案" };

test("host rewrite endpoints are local-only", () => {
  assert.equal(isLocalHostEndpoint("http://localhost:11434/v1/chat/completions"), true);
  assert.equal(isLocalHostEndpoint("http://127.0.0.1:8000/v1/chat/completions"), true);
  assert.equal(isLocalHostEndpoint("https://example.com/v1/chat/completions"), false);
  assert.equal(isLocalHostEndpoint("http://user:secret@localhost:11434/v1/chat/completions"), false);
  assert.equal(isLocalHostEndpoint("http://localhost:22/v1/chat/completions"), false);
  assert.equal(isLocalHostEndpoint("http://localhost:11434/v1/chat/completions#fragment"), false);
});

test("valid host rewrite remains presentation-only", () => {
  const result = validateHostRewriteResponse({ text: "是。档案记录支持这项判断。", style: "档案", warnings: [] }, context);
  assert.equal(result.ok, true);
  assert.equal(hostRewriteCacheKey(context).includes("c25-silent-second-bell:1"), true);
});

test("host rewrite fails closed on polarity, internal ids and invented numbers", () => {
  assert.equal(validateHostRewriteResponse({ text: "不是，记录不支持。" }, context).ok, false);
  assert.equal(validateHostRewriteResponse({ text: "是，fact-c25-01 已经证明。" }, context).ok, false);
  assert.equal(validateHostRewriteResponse({ text: "是，记录发生在 23:51。" }, context).ok, false);
  assert.equal(validateHostRewriteResponse({ text: "x".repeat(801) }, context).ok, false);
});
