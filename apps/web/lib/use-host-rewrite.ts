"use client";

import type { HostRewriteResponse, HostRewriteStyle, PlayerProjection, PresentationContext } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import { cacheHostRewrite, clearHostRewriteCache, HOST_REWRITE_DEFAULTS, readCachedHostRewrite, requestHostRewrite } from "./host-rewrite";

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
      if (stored) setSettingsState({ ...defaults, ...stored });
    } catch { /* defaults remain active */ }
  }, []);

  const setSettings = (next: HostRewriteSettings) => {
    setSettingsState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* settings remain in memory */ }
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
    const cached = readCachedHostRewrite(context);
    if (cached) {
      setRewrites((current) => ({ ...current, [latest.id]: cached }));
      setStatus("idle");
      setMessage("已使用本机缓存的主持改写");
      return;
    }
    const controller = new AbortController();
    setStatus("working");
    setMessage("本地模型正在改写表达；事实基线不会改变");
    void requestHostRewrite({ endpoint: settings.endpoint, model: settings.model, context }, controller.signal)
      .then((response) => {
        cacheHostRewrite(context, response);
        setRewrites((current) => ({ ...current, [latest.id]: response }));
        setStatus("idle");
        setMessage("本地主持改写已通过安全校验");
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
    clearHostRewriteCache();
    setRewrites({});
    setMessage("本地主持缓存已清除");
  };

  return { settings, setSettings, rewrites, status, message, clearCache };
}
