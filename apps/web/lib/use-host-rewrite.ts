"use client";

import type { HostRewriteResponse, HostRewriteStyle, PlayerProjection, PresentationContext } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import { HOST_REWRITE_DEFAULTS, isLocalHostEndpoint, safeModel } from "./ai-provider-defaults";

export interface HostRewriteSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
  style: HostRewriteStyle;
}

const STORAGE_KEY = "black-soup:host-rewrite-settings:v1";
const defaults: HostRewriteSettings = { enabled: false, endpoint: HOST_REWRITE_DEFAULTS.endpoint, model: HOST_REWRITE_DEFAULTS.model, style: HOST_REWRITE_DEFAULTS.style };

export function useHostRewrite(projection?: PlayerProjection) {
  const [settings, setSettingsState] = useState<HostRewriteSettings>(defaults);
  const [rewrites, setRewrites] = useState<Record<string, HostRewriteResponse>>({});
  const [status, setStatus] = useState<"off" | "idle" | "working" | "fallback">("off");
  const [message, setMessage] = useState("确定性主持已启用");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<HostRewriteSettings> | null;
      if (stored) setSettingsState({ enabled: stored.enabled === true, endpoint: typeof stored.endpoint === "string" && isLocalHostEndpoint(stored.endpoint) ? stored.endpoint : defaults.endpoint, model: safeModel(stored.model, defaults.model), style: ["冷静", "低语", "档案", "紧张"].includes(String(stored.style)) ? stored.style as HostRewriteStyle : defaults.style });
    } catch { /* defaults remain active */ }
  }, []);

  const setSettings = (next: HostRewriteSettings) => {
    const editable = { ...next, endpoint: next.endpoint.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 512), model: next.model.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 128) };
    setSettingsState(editable);
    try { if (isLocalHostEndpoint(editable.endpoint)) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...editable, model: safeModel(editable.model, defaults.model) })); } catch { /* settings remain in memory */ }
  };

  const latest = projection?.transcript.at(-1);
  const context = useMemo<PresentationContext | undefined>(() => projection && latest ? ({
    caseId: projection.case.id,
    caseVersion: projection.case.version,
    language: "zh-CN",
    answerCode: latest.answerCode,
    deterministicText: latest.answerText,
    playerQuestion: latest.rawQuestion,
    visibleEvidence: projection.evidence.filter((item) => item.state !== "available" && item.observation !== "尚未检查。").map((item) => ({ title: item.title, observation: item.observation })),
    hintLevel: "none",
    requestedStyle: settings.style,
  }) : undefined, [latest, projection, settings.style]);

  useEffect(() => {
    if (!settings.enabled || !latest || !context || rewrites[latest.id]) {
      setStatus(settings.enabled ? "idle" : "off");
      return;
    }
    const controller = new AbortController();
    setStatus("working");
    setMessage("本地模型正在改写表达；事实基线不会改变");
    void import("./host-rewrite").then(async ({ cacheHostRewrite, readCachedHostRewrite, requestHostRewrite }) => {
      const cached = readCachedHostRewrite(context);
      if (cached) return { response: cached, cached: true, cacheHostRewrite };
      return { response: await requestHostRewrite({ endpoint: settings.endpoint, model: settings.model, context }, controller.signal), cached: false, cacheHostRewrite };
    })
      .then(({ response, cached, cacheHostRewrite }) => {
        if (!cached) cacheHostRewrite(context, response);
        setRewrites((current) => ({ ...current, [latest.id]: response }));
        setStatus("idle");
        setMessage(cached ? "已使用本机缓存的主持改写" : "本地主持改写已通过安全校验");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("fallback");
          setMessage("本地模型不可用或输出未通过校验，已回退确定性主持");
        }
      });
    return () => controller.abort();
  }, [context, latest, rewrites, settings]);

  const clearCache = () => {
    void import("./host-rewrite").then(({ clearHostRewriteCache }) => clearHostRewriteCache());
    setRewrites({});
    setMessage("本地主持缓存已清除");
  };

  return { settings, setSettings, rewrites, status, message, clearCache };
}
