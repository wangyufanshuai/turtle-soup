import type { AiAssistErrorCode, AiProviderSettings, QuestionRouteResult, QuestionRoutingContext } from "@turtle-soup/mystery-core";
import { AI_INPUT_LIMITS, isAllowedAiEndpoint, readBoundedResponse, safeModel, safeSessionKey } from "./ai-provider-defaults.ts";

export { isAllowedAiEndpoint } from "./ai-provider-defaults.ts";

export type QuestionRouteFailure = Error & { code: AiAssistErrorCode };

function failure(code: AiAssistErrorCode, message: string): QuestionRouteFailure {
  const error = new Error(message) as QuestionRouteFailure;
  error.code = code;
  return error;
}

function jsonSchema(tokens: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["matched", "ambiguous", "unknown"] },
      candidateTokens: { type: "array", items: { type: "string", enum: tokens }, maxItems: 3 },
    },
    required: ["status", "candidateTokens"],
  };
}

function parseJson(value: string): unknown {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

export function validateQuestionRoute(value: unknown, context: QuestionRoutingContext): QuestionRouteResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("invalid-schema", "AI 返回值不是对象");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== "status" && key !== "candidateTokens")) throw failure("unsafe-output", "AI 返回了协议之外的断言");
  const status = raw.status;
  const tokens = raw.candidateTokens;
  const allowed = new Set(context.candidates.map((candidate) => candidate.token));
  if (!(status === "matched" || status === "ambiguous" || status === "unknown") || !Array.isArray(tokens) || tokens.some((token) => typeof token !== "string" || !allowed.has(token))) {
    throw failure("invalid-candidate", "AI 返回了不属于公开候选的问题");
  }
  const unique = [...new Set(tokens as string[])];
  if (status === "matched" && unique.length !== 1) throw failure("invalid-schema", "matched 必须只有一个候选");
  if (status === "ambiguous" && (unique.length < 2 || unique.length > 3)) throw failure("invalid-schema", "ambiguous 必须有两个或三个候选");
  if (status === "unknown" && unique.length !== 0) throw failure("invalid-schema", "unknown 不应包含候选");
  return status === "matched" ? { status, candidateToken: unique[0] } : status === "ambiguous" ? { status, candidateTokens: unique } : { status };
}

export function buildQuestionRoutingRequestBody(settings: AiProviderSettings, context: QuestionRoutingContext) {
  if (context.rawQuestion.length > AI_INPUT_LIMITS.rawQuestion || context.publicSurface.length > AI_INPUT_LIMITS.publicSurface) throw failure("unsafe-output", "问题或公开谜面超出安全长度上限");
  const tokens = context.candidates.map((candidate) => candidate.token);
  const prompt = [
    "你是推理游戏的问题理解器。你不能回答事实，不能推断真相，不能创造候选。",
    "只能从候选 token 中选择：唯一匹配返回 matched；存在多个合理解释返回 ambiguous；没有合适解释返回 unknown。",
    `案件公开谜面：${context.publicSurface}`,
    `玩家原问题：${context.rawQuestion}`,
    `候选：${context.candidates.map((candidate) => `${candidate.token}｜${candidate.label}｜对象:${candidate.target}｜关系:${candidate.predicate}${candidate.qualifier ? `｜条件:${candidate.qualifier}` : ""}`).join("\n")}`,
    "只输出 JSON，不要 Markdown，不要解释。",
  ].join("\n");
  const body: Record<string, unknown> = {
    model: settings.model,
    stream: false,
    temperature: 0,
    messages: [{ role: "system", content: "严格遵守候选枚举，不要回答是或否。" }, { role: "user", content: prompt }],
  };
  if (settings.protocolMode === "strict-schema") {
    body.response_format = { type: "json_schema", json_schema: { name: "question_route", strict: true, schema: jsonSchema(tokens) } };
  } else {
    body.response_format = { type: "json_object" };
  }
  return body;
}

export async function routeQuestion(settings: AiProviderSettings, context: QuestionRoutingContext, apiKey: string, signal?: AbortSignal): Promise<QuestionRouteResult> {
  if (!isAllowedAiEndpoint(settings.endpoint)) throw failure("network", "API 必须使用 HTTPS，或指向 localhost");
  const safeKey = safeSessionKey(apiKey);
  if (!safeKey.trim()) throw failure("network", "尚未提供有效 API Key");
  const model = safeModel(settings.model, "");
  if (!model) throw failure("invalid-schema", "模型名无效");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${safeKey}` },
      body: JSON.stringify(buildQuestionRoutingRequestBody({ ...settings, model }, context)),
      signal: controller.signal,
    });
    if (!response.ok) throw failure("network", `AI 端点返回 HTTP ${response.status}`);
    const payload = JSON.parse(await readBoundedResponse(response)) as { choices?: Array<{ message?: { content?: string; refusal?: string }; finish_reason?: string }> };
    const choice = payload.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw failure("refusal", "AI 拒绝了本次问题理解请求");
    const content = choice?.message?.content;
    if (!content) throw failure("invalid-schema", "AI 没有返回结构化结果");
    if (content.length > 4_000) throw failure("unsafe-output", "AI 返回内容超出问题理解上限");
    return validateQuestionRoute(parseJson(content), context);
  } catch (error) {
    if ((error as Error & { name?: string }).name === "AbortError") throw failure("timeout", "AI 请求超时或已取消");
    if ((error as QuestionRouteFailure).code) throw error;
    if (error instanceof SyntaxError) throw failure("invalid-schema", "AI 返回的内容不是有效 JSON");
    if (error instanceof Error && error.message.includes("体积上限")) throw failure("unsafe-output", "AI 响应超过安全体积上限");
    throw failure("network", error instanceof Error ? error.message : "AI 网络请求失败");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

export async function testQuestionRouter(settings: AiProviderSettings, apiKey: string, signal?: AbortSignal): Promise<void> {
  await routeQuestion(settings, { contextHash: "test", language: "zh-CN", publicSurface: "连接测试", rawQuestion: "测试", candidates: [{ token: "test-ok", label: "测试候选", target: "测试", predicate: "测试" }] }, apiKey, signal);
}
