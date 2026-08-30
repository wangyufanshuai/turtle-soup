"use client";

import type { AiAssistErrorCode, AiProviderSettings, PlayerProjection, QuestionRouteResult, QuestionRoutingOffer } from "@turtle-soup/mystery-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAllowedAiEndpoint, QUESTION_ROUTER_DEFAULTS, safeModel, safeSessionKey } from "./ai-provider-defaults";

const SETTINGS_KEY = "black-soup:ai-router-settings:v1";
const ENDPOINT_KEY = "black-soup:ai-router-endpoint:v1";

export function useQuestionRouter(projection: PlayerProjection | undefined, prepareQuestionRouting: (rawText: string) => Promise<QuestionRoutingOffer>) {
  const [settings, setSettingsState] = useState<AiProviderSettings>(QUESTION_ROUTER_DEFAULTS);
  const [apiKey, setApiKeyState] = useState("");
  const [status, setStatus] = useState<"off" | "idle" | "working" | "fallback" | "ready">("off");
  const [errorCode, setErrorCode] = useState<AiAssistErrorCode>();
  const [message, setMessage] = useState("未配置 AI；离线确定性提问可正常使用");
  const [offer, setOffer] = useState<QuestionRoutingOffer>();
  const [route, setRoute] = useState<QuestionRouteResult>();
  const [latency, setLatency] = useState(0);
  const cacheRef = useRef(new Map<string, QuestionRouteResult>());
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AiProviderSettings> | null;
      const endpoint = localStorage.getItem(ENDPOINT_KEY);
      if (stored) setSettingsState({ ...QUESTION_ROUTER_DEFAULTS, enabled: stored.enabled === true, model: safeModel(stored.model, QUESTION_ROUTER_DEFAULTS.model), protocolMode: stored.protocolMode === "validated-json" ? "validated-json" : "strict-schema", keyStorage: "session" });
      if (endpoint && isAllowedAiEndpoint(endpoint)) setSettingsState((current) => ({ ...current, endpoint }));
      const sessionKey = sessionStorage.getItem("black-soup:ai-router-key:v1");
      if (sessionKey) setApiKeyState(safeSessionKey(sessionKey));
    } catch { /* browser storage is optional */ }
  }, []);

  const setSettings = useCallback((next: AiProviderSettings) => {
    const editable = { ...next, endpoint: next.endpoint.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 512), model: next.model.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 128), keyStorage: "session" as const };
    setSettingsState(editable);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: editable.enabled, model: safeModel(editable.model, QUESTION_ROUTER_DEFAULTS.model), protocolMode: editable.protocolMode, keyStorage: "session" }));
      if (isAllowedAiEndpoint(editable.endpoint)) localStorage.setItem(ENDPOINT_KEY, editable.endpoint);
    } catch { /* optional */ }
  }, []);
  const setApiKey = useCallback((value: string) => {
    const safe = safeSessionKey(value);
    setApiKeyState(safe);
    try { sessionStorage.setItem("black-soup:ai-router-key:v1", safe); } catch { /* optional */ }
  }, []);

  const request = useCallback(async (rawText: string) => {
    setOffer(undefined); setRoute(undefined); setErrorCode(undefined);
    const nextOffer = await prepareQuestionRouting(rawText);
    setOffer(nextOffer);
    if (!settings.enabled || projection?.replayMode === "no-scaffolds") {
      setStatus("off"); setMessage("没有启用 AI，下面的公开候选仍可手动选择"); return nextOffer;
    }
    const key = `${nextOffer.context.contextHash}:${settings.model}:${settings.endpoint}`;
    const cached = cacheRef.current.get(key);
    if (cached) { setRoute(cached); setStatus("ready"); setMessage("已使用本次会话的候选解释"); return nextOffer; }
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setStatus("working"); setMessage("正在理解你的问题；事实仍由确定性核心回答");
    const started = performance.now();
    try {
      const result = await import("./question-routing-ai").then(({ routeQuestion: route }) => route(settings, nextOffer.context, apiKey, controller.signal));
      cacheRef.current.set(key, result); setLatency(Math.round(performance.now() - started)); setRoute(result); setStatus("ready"); setMessage("请选择系统理解的事实，再确认");
    } catch (error) {
      if (!controller.signal.aborted) { const code = (error as { code?: AiAssistErrorCode }).code ?? "network"; setErrorCode(code); setStatus("fallback"); setMessage("AI 不可用；你仍可从公开候选或问题构建器继续"); }
    }
    return nextOffer;
  }, [apiKey, prepareQuestionRouting, projection?.replayMode, settings]);

  const cancel = useCallback(() => { abortRef.current?.abort(); setStatus("fallback"); setMessage("已取消 AI 解释；可以手动选择"); }, []);
  const clearSession = useCallback(() => { cacheRef.current.clear(); setApiKeyState(""); try { sessionStorage.removeItem("black-soup:ai-router-key:v1"); } catch { /* optional */ } }, []);
  const test = useCallback(async () => { setStatus("working"); setMessage("正在测试结构化输出"); try { await import("./question-routing-ai").then(({ testQuestionRouter: run }) => run(settings, apiKey)); setStatus("ready"); setMessage("AI 连接和结构化输出测试通过"); } catch { setStatus("fallback"); setMessage("连接测试失败；离线确定性提问仍可用"); } }, [apiKey, settings]);
  return { settings, setSettings, apiKey, setApiKey, status, errorCode, message, offer, route, latency, request, cancel, clearSession, test };
}
