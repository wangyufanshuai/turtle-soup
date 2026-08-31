import type { AiProviderSettings, HostRewriteStyle } from "@turtle-soup/mystery-core";

export const AI_INPUT_LIMITS = {
  endpoint: 512,
  model: 128,
  apiKey: 4096,
  rawQuestion: 1000,
  publicSurface: 6000,
  responseBytes: 64 * 1024,
} as const;

export const QUESTION_ROUTER_DEFAULTS: AiProviderSettings = {
  enabled: false,
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  protocolMode: "strict-schema",
  keyStorage: "session",
};

export type AiProviderPresetId = "openai" | "ollama" | "llama-cpp";

export const AI_PROVIDER_PRESETS: ReadonlyArray<{
  id: AiProviderPresetId;
  label: string;
  description: string;
  endpoint: string;
  model: string;
  protocolMode: AiProviderSettings["protocolMode"];
  requiresKey: boolean;
}> = [
  { id: "openai", label: "OpenAI", description: "远程 HTTPS · 需要自己的 Key", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", protocolMode: "strict-schema", requiresKey: true },
  { id: "ollama", label: "Ollama", description: "本机 11434 · 通常不需要 Key", endpoint: "http://localhost:11434/v1/chat/completions", model: "qwen2.5:7b-instruct", protocolMode: "validated-json", requiresKey: false },
  { id: "llama-cpp", label: "llama.cpp", description: "本机 8080 · OpenAI 兼容服务", endpoint: "http://localhost:8080/v1/chat/completions", model: "local-model", protocolMode: "validated-json", requiresKey: false },
] as const;

export function aiProviderPreset(settings: Pick<AiProviderSettings, "endpoint" | "model" | "protocolMode">): AiProviderPresetId | "custom" {
  return AI_PROVIDER_PRESETS.find((preset) => preset.endpoint === settings.endpoint && preset.model === settings.model && preset.protocolMode === settings.protocolMode)?.id ?? "custom";
}

export const HOST_REWRITE_DEFAULTS = {
  endpoint: "http://localhost:11434/v1/chat/completions",
  model: "qwen2.5:7b-instruct",
  style: "档案" as HostRewriteStyle,
  timeoutMs: 2_000,
  maxChars: 800,
} as const;

const FORBIDDEN_PORTS = new Set([
  "1", "7", "9", "11", "13", "15", "17", "19", "20", "21", "22", "23", "25", "37", "42", "43", "53", "69", "77", "79", "87", "95", "101", "102", "103", "104", "109", "110", "111", "113", "115", "117", "119", "123", "135", "137", "139", "143", "161", "179", "389", "427", "465", "512", "513", "514", "515", "526", "530", "531", "532", "540", "548", "554", "556", "563", "587", "601", "636", "989", "990", "993", "995", "1719", "1720", "1723", "2049", "3659", "4045", "5060", "5061", "6000", "6566", "6665", "6666", "6667", "6668", "6669", "6697", "10080",
]);

function safeUrl(endpoint: string): URL | undefined {
  if (!endpoint || endpoint.length > AI_INPUT_LIMITS.endpoint || /[\u0000-\u001f\u007f\s]/u.test(endpoint)) return;
  try {
    const url = new URL(endpoint);
    if (url.username || url.password || url.hash || FORBIDDEN_PORTS.has(url.port)) return;
    return url;
  } catch {
    return;
  }
}

export function isAllowedAiEndpoint(endpoint: string): boolean {
  const url = safeUrl(endpoint);
  if (!url) return false;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return local ? url.protocol === "http:" || url.protocol === "https:" : url.protocol === "https:";
}

export function isLocalHostEndpoint(endpoint: string): boolean {
  const url = safeUrl(endpoint);
  return Boolean(url && (url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
}

export function safeModel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= AI_INPUT_LIMITS.model && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : fallback;
}

export function safeSessionKey(value: unknown): string {
  return typeof value === "string" && value.length <= AI_INPUT_LIMITS.apiKey && !/[\r\n\u0000]/u.test(value) ? value : "";
}

export function readBoundedResponse(response: Response, limit = AI_INPUT_LIMITS.responseBytes): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(new Error("AI 响应超过安全体积上限"));
  return response.text().then((text) => {
    if (new TextEncoder().encode(text).byteLength > limit) throw new Error("AI 响应超过安全体积上限");
    return text;
  });
}
