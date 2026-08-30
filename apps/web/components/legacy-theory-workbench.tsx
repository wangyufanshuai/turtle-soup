"use client";

import type { EventOptionProjection, GameCommand, TheoryDraft } from "@turtle-soup/mystery-core";
import styles from "./legacy-theory-workbench.module.css";

const CASE_MODES: Record<string, { mode: string; title: string; guide: string; roles: string[] }> = {
  "c01-cold-room-knock": { mode: "timeline", title: "敲击因果时间链", guide: "把离开、锁止、声音与检查按先后排好；顺序本身必须能被证据支持。", roles: ["离开", "锁止", "装置", "声音", "误判", "延迟", "样本"] },
  "c03-second-shadow": { mode: "identity-matrix", title: "人物—外观身份槽", guide: "角色外观、真实人物、服装和后台位置必须分开；先排事件，再核对证件与服装来源。", roles: ["人物位置", "服装来源", "角色外观", "证词观察", "后台记录", "身份排除"] },
  "c06-nonexistent-ticket": { mode: "signal-chain", title: "扫描—同步—显示链", guide: "把真实扫描、离线缓存、重新同步和屏幕显示分开，避免把写入时间当成发生时间。", roles: ["真实行动", "闸机采集", "离线缓存", "重新同步", "界面显示", "航次状态"] },
};
const MODE_LABELS: Record<string, string> = { timeline: "时间链", "identity-matrix": "身份矩阵", "signal-chain": "信号链" };

export function LegacyTheoryWorkbench({ caseId, draft, events, dispatch }: { caseId: string; draft: TheoryDraft; events: EventOptionProjection[]; dispatch: (command: GameCommand) => void }) {
  const config = CASE_MODES[caseId] ?? CASE_MODES["c01-cold-room-knock"];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  return <section className={styles.workbench} data-reasoning-surface="legacy" data-mode={config.mode} aria-label={config.title}>
    <header><div><small>直接推理 / {MODE_LABELS[config.mode] ?? "事件链"}</small><h3>{config.title}</h3></div><b>{draft.eventIds.length} / {events.length}</b></header>
    <p>{config.guide}</p>
    <div className={styles.bank} aria-label="公开事件片">{events.map((event) => <button type="button" key={event.id} disabled={draft.eventIds.includes(event.id)} onClick={() => dispatch({ type: "upsert_theory_event", theoryId: draft.id, eventId: event.id })}><time>{event.timeLabel}</time><span>{event.label}</span><b>{draft.eventIds.includes(event.id) ? "已放置" : "+"}</b></button>)}</div>
    <div className={styles.surface}>
      {draft.eventIds.length === 0 && <div className={styles.empty}>选择一张公开事件片，建立第一处可检验关系。</div>}
      {draft.eventIds.map((eventId, index) => {
        const event = eventMap.get(eventId);
        if (!event) return null;
        return <article key={eventId} data-index={index}>
          <small>{String(index + 1).padStart(2, "0")} / {config.roles[index % config.roles.length]}</small>
          <div><time>{event.timeLabel}</time><b>{event.label}</b></div>
          <nav><button type="button" disabled={index === 0} onClick={() => dispatch({ type: "move_theory_event", theoryId: draft.id, eventId, direction: -1 })} aria-label={`${event.label}向前移动`}>←</button><button type="button" disabled={index === draft.eventIds.length - 1} onClick={() => dispatch({ type: "move_theory_event", theoryId: draft.id, eventId, direction: 1 })} aria-label={`${event.label}向后移动`}>→</button><button type="button" onClick={() => dispatch({ type: "remove_theory_event", theoryId: draft.id, eventId })} aria-label={`移除${event.label}`}>×</button></nav>
        </article>;
      })}
    </div>
  </section>;
}
