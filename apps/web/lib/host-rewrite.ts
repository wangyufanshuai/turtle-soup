import type { HostRewriteRequest, HostRewriteResponse, HostRewriteStyle, PresentationContext } from "@turtle-soup/mystery-core";
import { HOST_REWRITE_DEFAULTS, isLocalHostEndpoint, readBoundedResponse, safeModel } from "./ai-provider-defaults.ts";

export { isLocalHostEndpoint } from "./ai-provider-defaults.ts";

const FORBIDDEN = /(?:solutionCertificate|canonicalHypothesis|hypothesis-|fact-|event-|contradiction-|proof-|隐藏事实|证明证书|真相图|内部事件)/i;

export type HostRewriteValidation = { ok: true; value: HostRewriteResponse } | { ok: false; reason: string };

function numbers(value: string) {
  return new Set(value.match(/\d+(?:[.:：]\d+)?/g) ?? []);
}

function polarityMatches(code: PresentationContext["answerCode"], text: string) {
  const compact = text.replace(/\s+/g, "");
  if (code === "yes") return !/^(?:不|不是|否|没有|未)/.test(compact);
  if (code === "no") return /(?:不|否|没有|未|并非)/.test(compact);
  if (code === "irrelevant") return /(?:无关|不影响|不会改变)/.test(compact);
  if (code === "invalid_premise") return /前提/.test(compact);
  if (["unknown", "unanswerable", "unrecognized"].includes(code)) return /(?:无法|不能|不足|未知|尚未|没有足够)/.test(compact);
  return true;
}

export function validateHostRewriteResponse(value: unknown, context: PresentationContext): HostRewriteValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "返回值不是对象" };
  const raw = value as Record<string, unknown>;
  if (typeof raw.text !== "string") return { ok: false, reason: "缺少 text" };
  const text = raw.text.trim();
  if (!text || text.length > HOST_REWRITE_DEFAULTS.maxChars) return { ok: false, reason: "文本为空或过长" };
  if (FORBIDDEN.test(text)) return { ok: false, reason: "文本包含内部或剧透标记" };
  if (!polarityMatches(context.answerCode, text)) return { ok: false, reason: "文本改变了确定性回答方向" };
  const allowedNumbers = numbers([context.deterministicText, context.playerQuestion, ...context.visibleEvidence.flatMap((item) => [item.title, item.observation])].join(" "));
  for (const token of numbers(text)) if (!allowedNumbers.has(token)) return { ok: false, reason: `文本引入未公开数值 ${token}` };
  const styles: HostRewriteStyle[] = ["冷静", "低语", "档案", "紧张"];
  if (raw.style !== undefined && (typeof raw.style !== "string" || !styles.includes(raw.style as HostRewriteStyle))) return { ok: false, reason: "style 无效" };
  if (raw.warnings !== undefined && (!Array.isArray(raw.warnings) || raw.warnings.some((item) => typeof item !== "string"))) return { ok: false, reason: "warnings 无效" };
  return { ok: true, value: { text, style: raw.style as HostRewriteStyle | undefined, warnings: raw.warnings as string[] | undefined } };
}

function parseModelContent(content: string): unknown {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

export function hostRewriteCacheKey(context: PresentationContext): string {
  const source = JSON.stringify(context);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `black-soup:host-rewrite:v1:${context.caseId}:${context.caseVersion}:${(hash >>> 0).toString(16)}`;
}

export async function requestHostRewrite(request: HostRewriteRequest, signal?: AbortSignal): Promise<HostRewriteResponse> {
  if (!isLocalHostEndpoint(request.endpoint)) throw new Error("本地主持仅允许 localhost、127.0.0.1 或 ::1 端点");
  const model = safeModel(request.model, "");
  if (!model) throw new Error("本地主持模型名无效");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOST_REWRITE_DEFAULTS.timeoutMs);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  const prompt = [
    "你是《THE BLACK SOUP》的本地表达层，只能改写已经确定的主持回答。",
    "不得补充人物、时间、地点、数量、证据、因果、答案或推理建议。不得暴露内部字段。",
    `回答方向：${request.context.answerCode}`,
    `确定性事实基线：${request.context.deterministicText}`,
    `玩家问题：${request.context.playerQuestion}`,
    `已公开证据：${request.context.visibleEvidence.map((item) => `${item.title}：${item.observation}`).join("；") || "无"}`,
    `语气：${request.context.requestedStyle}。只返回 JSON：{"text":"改写文本","style":"${request.context.requestedStyle}","warnings":[]}`,
  ].join("\n");
  try {
    const response = await fetch(request.endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, temperature: 0.35, messages: [{ role: "system", content: "只改写公开的确定性主持文本，严禁增加事实。" }, { role: "user", content: prompt }] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`本地模型返回 HTTP ${response.status}`);
    const payload = JSON.parse(await readBoundedResponse(response)) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("本地模型没有返回文本");
    const validated = validateHostRewriteResponse(parseModelContent(content), request.context);
    if (!validated.ok) throw new Error(validated.reason);
    return validated.value;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

export function readCachedHostRewrite(context: PresentationContext): HostRewriteResponse | undefined {
  try {
    const raw = localStorage.getItem(hostRewriteCacheKey(context));
    if (!raw) return undefined;
    const validated = validateHostRewriteResponse(JSON.parse(raw), context);
    return validated.ok ? validated.value : undefined;
  } catch {
    return undefined;
  }
}

export function cacheHostRewrite(context: PresentationContext, response: HostRewriteResponse) {
  try { localStorage.setItem(hostRewriteCacheKey(context), JSON.stringify(response)); } catch { /* cache is optional */ }
}

export function clearHostRewriteCache() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("black-soup:host-rewrite:v1:")) localStorage.removeItem(key);
  } catch { /* cache is optional */ }
}
