"use client";

import type { HostRewriteStyle } from "@turtle-soup/mystery-core";
import type { HostRewriteSettings } from "@/lib/use-host-rewrite";
import styles from "./host-rewrite-controls.module.css";

export function HostRewriteControls({ settings, status, message, onChange, onClear }: { settings: HostRewriteSettings; status: "off" | "idle" | "working" | "fallback"; message: string; onChange: (settings: HostRewriteSettings) => void; onClear: () => void }) {
  const update = <K extends keyof HostRewriteSettings>(key: K, value: HostRewriteSettings[K]) => onChange({ ...settings, [key]: value });
  return (
    <section className={styles.panel} aria-label="本地主持改写">
      <div className={styles.heading}>
        <span>LOCAL HOST / PRESENTATION ONLY</span>
        <b>本地模型主持改写</b>
        <small data-status={status}>{message}</small>
      </div>
      <label className={styles.toggle}><span><b>启用本地主持</b><small>默认关闭；不参与答案与胜负</small></span><input name="host-rewrite-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => update("enabled", event.target.checked)} /></label>
      <label><span>localhost 端点</span><input name="host-rewrite-endpoint" type="url" value={settings.endpoint} disabled={!settings.enabled} onChange={(event) => update("endpoint", event.target.value)} spellCheck={false} maxLength={512} /></label>
      <label><span>模型名</span><input name="host-rewrite-model" value={settings.model} disabled={!settings.enabled} onChange={(event) => update("model", event.target.value)} spellCheck={false} maxLength={128} /></label>
      <label><span>主持语气</span><select name="host-rewrite-style" value={settings.style} disabled={!settings.enabled} onChange={(event) => update("style", event.target.value as HostRewriteStyle)}><option>冷静</option><option>低语</option><option>档案</option><option>紧张</option></select></label>
      <div className={styles.notice}>只发送玩家问题、确定性回答和已公开证据。完整案件、隐藏事实和证明证书不会离开推理 Worker。</div>
      <button type="button" onClick={onClear}>清除本地主持缓存</button>
    </section>
  );
}
