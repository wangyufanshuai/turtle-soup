"use client";

import type { AiProviderSettings } from "@turtle-soup/mystery-core";
import styles from "./question-router-controls.module.css";

export function QuestionRouterControls({ settings, apiKey, status, message, onSettings, onKey, onTest, onClear }: { settings: AiProviderSettings; apiKey: string; status: string; message: string; onSettings: (value: AiProviderSettings) => void; onKey: (value: string) => void; onTest: () => void; onClear: () => void }) {
  const update = <K extends keyof AiProviderSettings>(key: K, value: AiProviderSettings[K]) => onSettings({ ...settings, [key]: value });
  return <section className={styles.panel} aria-label="AI 问题理解设置">
    <header><div><small>OPTIONAL QUESTION BRIDGE</small><h3>AI 帮你理解问题</h3></div><span data-status={status}>{settings.enabled ? status === "ready" ? "已连接" : status === "working" ? "处理中" : "已启用" : "未启用"}</span></header>
    <p className={styles.explain}>AI 只从公开候选中选择你想验证的事实，不会回答是或否，也不会参与胜负。没有 Key 仍可完整离线游玩。</p>
    <label className={styles.toggle}><span><b>启用问题理解</b><small>只在规则无法识别时使用</small></span><input name="ai-question-routing-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => update("enabled", event.target.checked)} /></label>
    <label><span>API 端点</span><input name="ai-question-routing-endpoint" type="url" value={settings.endpoint} onChange={(event) => update("endpoint", event.target.value)} placeholder="https://api.openai.com/v1/chat/completions" spellCheck={false} maxLength={512} /></label>
    <label><span>模型</span><input name="ai-question-routing-model" value={settings.model} onChange={(event) => update("model", event.target.value)} spellCheck={false} maxLength={128} /></label>
    <label><span>API Key（仅本次会话）</span><input name="ai-question-routing-key" type="password" value={apiKey} onChange={(event) => onKey(event.target.value)} autoComplete="off" placeholder="不会写入存档或导出…" maxLength={4096} /></label>
    <label><span>输出协议</span><select name="ai-question-routing-protocol" value={settings.protocolMode} onChange={(event) => update("protocolMode", event.target.value as AiProviderSettings["protocolMode"])}><option value="strict-schema">严格 JSON Schema</option><option value="validated-json">校验 JSON 兼容模式</option></select></label>
    <div className={styles.actions}><button type="button" onClick={onTest} disabled={!settings.enabled || !apiKey.trim()}>测试连接</button><button type="button" onClick={onClear}>清除本次会话 Key</button></div>
    <p className={styles.status} role="status" aria-live="polite">{message}</p>
  </section>;
}
