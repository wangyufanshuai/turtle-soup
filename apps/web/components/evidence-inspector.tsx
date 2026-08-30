"use client";

import type { EvidencePlayerState, EvidenceProjection, GameCommand, TheoryDraft } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./evidence-inspector.module.css";

const STATUS: Record<EvidencePlayerState, string> = {
  available: "待检查",
  discovered: "新证据",
  examined: "已检查",
  connected: "已关联",
  verified: "已核实",
  dismissed: "已搁置",
};

const MATERIAL_LABELS: Record<string, string> = {
  "freeze-frame": "COLD STORAGE FRAME",
  "role-overlay": "WARDROBE OVERLAY",
  "ledger-sync": "BUFFERED LEDGER",
  "fluid-level": "VESSEL SECTION",
  "gear-phase": "MECHANICAL TRACE",
  "wall-pivot": "GALLERY PLAN",
  "clock-alignment": "CLOCK SOURCE STRIP",
  "curve-fit": "CALIBRATION SHEET",
  "buffer-window": "SIGNAL WINDOW",
};

function recommendedAction(item: EvidenceProjection, linked: boolean) {
  if (item.state === "dismissed") return "恢复后可重新判断";
  if (linked) return "已接入当前证明";
  if (item.state === "discovered" || item.state === "available") return "下一步：打开检查";
  if (item.state === "verified") return "已核实 · 可接入证明";
  return "已检查 · 决定保留或搁置";
}

function EvidencePlate({ caseCode, index, title, mode }: { caseCode: string; index: number; title: string; mode: string }) {
  const motif = index % 5;
  return <div className={styles.evidencePlate} data-motif={motif} data-mode={mode} data-case={caseCode} role="img" aria-label={`${title}的结构化证据片；所有关键观察同时以文字提供`}>
    <header><span>{caseCode.toUpperCase()} / E{String(index + 1).padStart(2, "0")}</span><b>{MATERIAL_LABELS[mode] ?? mode.toUpperCase()}</b></header>
    <svg viewBox="0 0 640 320" aria-hidden="true">
      <defs><pattern id={`grid-${caseCode}-${index}`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="currentColor" opacity=".12" /></pattern></defs>
      <rect width="640" height="320" fill={`url(#grid-${caseCode}-${index})`} />
      {motif === 0 && <><path d="M70 236H570"/><path d="M112 236V84M246 236V146M388 236V106M524 236V178"/><circle cx="112" cy="84" r="12"/><circle cx="246" cy="146" r="12"/><circle cx="388" cy="106" r="12"/><circle cx="524" cy="178" r="12"/></>}
      {motif === 1 && <><path d="M60 168h76l28-54 44 118 62-166 54 124 54-76 42 54h120"/><path d="M60 260H580M60 60V260" opacity=".45"/></>}
      {motif === 2 && <><rect x="72" y="66" width="144" height="96"/><rect x="424" y="166" width="144" height="96"/><path d="M216 114c110 0 96 100 208 100"/><path d="m400 194 24 20-28 10"/><circle cx="320" cy="154" r="24"/></>}
      {motif === 3 && <><rect x="130" y="42" width="380" height="236"/><path d="M174 92H466M174 132H382M174 172H450M174 212H330"/><rect x="380" y="194" width="86" height="42"/><path d="m394 216 18 12 38-32"/></>}
      {motif === 4 && <><circle cx="112" cy="160" r="42"/><circle cx="320" cy="92" r="42"/><circle cx="528" cy="196" r="42"/><path d="M152 148 278 106M360 108l128 70M154 174l326 18"/><path d="m466 178 22 14-26 10"/></>}
      {mode === "clock-alignment" && <><path d="M92 54V270M320 54V270M548 54V270" opacity=".45"/><path d="M92 110H548M92 190H548" strokeDasharray="8 8"/><text x="82" y="290">A</text><text x="310" y="290">B</text><text x="538" y="290">C</text></>}
      {mode === "curve-fit" && <><path d="M76 246C180 232 206 74 320 86S474 238 564 98" strokeWidth="6"/><path d="M76 264C188 244 224 104 320 108S458 260 564 126" opacity=".35" strokeWidth="18"/></>}
      {mode === "buffer-window" && <><rect x="78" y="70" width="154" height="176" rx="8"/><rect x="244" y="92" width="154" height="154" rx="8"/><rect x="410" y="118" width="154" height="128" rx="8"/><path d="M116 52V264M282 52V264M448 52V264" strokeDasharray="5 7"/></>}
    </svg>
    <footer><span>公开来源</span><i>{String(index + 1).padStart(2, "0")}</i></footer>
  </div>;
}

export function EvidenceInspector({
  evidence,
  activeTheoryId,
  linkedEvidenceIds,
  caseCode,
  dispatch,
  compact = false,
  interactionMode,
  interactionLabel,
  onContinueToProof,
}: {
  evidence: EvidenceProjection[];
  activeTheoryId: TheoryDraft["id"];
  linkedEvidenceIds: string[];
  caseCode: string;
  dispatch: (command: GameCommand) => void;
  compact?: boolean;
  interactionMode?: string;
  interactionLabel?: string;
  onContinueToProof?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pageSize = compact ? 4 : 5;
  const pageCount = Math.max(1, Math.ceil(evidence.length / pageSize));
  const visible = evidence.slice(page * pageSize, page * pageSize + pageSize);
  const selected = useMemo(() => evidence.find((item) => item.id === selectedId), [evidence, selectedId]);
  const dismissedCount = evidence.filter((item) => item.state === "dismissed").length;
  const inspectedCount = evidence.filter((item) => !["available", "discovered", "dismissed"].includes(item.state)).length;
  const candidateCount = Math.max(0, inspectedCount - linkedEvidenceIds.length);

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  useEffect(() => {
    if (!selected) {
      const priorTarget = returnFocusRef.current;
      if (!priorTarget) return;
      let retry = 0;
      const frame = window.requestAnimationFrame(() => {
        const fallback = inspectorRef.current?.querySelector<HTMLElement>("button:not([disabled])");
        const target = priorTarget.isConnected && !priorTarget.matches(":disabled") ? priorTarget : fallback;
        target?.focus({ preventScroll: true });
        retry = window.setTimeout(() => {
          target?.focus({ preventScroll: true });
          if (document.activeElement !== target) inspectorRef.current?.focus({ preventScroll: true });
        }, 0);
      });
      return () => { window.cancelAnimationFrame(frame); window.clearTimeout(retry); };
    }
    setImageFailed(false);
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
  }, [selected?.id]);

  const open = (item: EvidenceProjection, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    if (item.state === "available" || item.state === "discovered") {
      dispatch({ type: "set_evidence_state", evidenceId: item.id, state: "examined" });
    }
    setSelectedId(item.id);
  };
  const close = () => {
    setSelectedId(undefined);
  };
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])];
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && current <= 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && current === focusable.length - 1) {
      event.preventDefault();
      focusable[0].focus();
    }
  };

  return <section ref={inspectorRef} tabIndex={-1} className={styles.inspector} data-compact={compact || undefined} data-interaction={interactionMode} aria-label="证据架">
    <div className={styles.shelfHeader}>
      <div><small>证据材料 / {interactionMode?.toUpperCase() ?? "逐件检查"}</small><b>{interactionLabel ?? "逐件检查，不让档案淹没现场"}</b></div>
      <span>{Math.min(page * pageSize + 1, evidence.length)}–{Math.min((page + 1) * pageSize, evidence.length)} / {evidence.length}</span>
    </div>
    <div className={styles.triage} aria-label="证据取舍状态">
      <span><b>{linkedEvidenceIds.length}</b>接入证明</span><span><b>{candidateCount}</b>保留候选</span><span><b>{dismissedCount}</b>暂时搁置</span>
      <p>{inspectedCount >= 3 && linkedEvidenceIds.length === 0 ? "已检查多份材料；现在更值得选一件接入暂定解释。" : "不要求收集全部证据。保留能支持或反驳当前理论的材料即可。"}</p>
    </div>
    <div className={styles.shelf}>
      {visible.map((item, index) => {
        const absoluteIndex = page * pageSize + index;
        const linked = linkedEvidenceIds.includes(item.id);
        return <button type="button" className={styles.card} data-state={item.state} data-linked={linked || undefined} key={item.id} onClick={(event) => open(item, event.currentTarget)}>
          <span className={styles.index}>{String(absoluteIndex + 1).padStart(2, "0")}</span>
          <span className={styles.cardCopy}><small>{item.sourceLabel}</small><b>{item.title}</b><em>{recommendedAction(item, linked)}</em></span>
          <span aria-hidden="true" className={styles.openGlyph}>↗</span>
        </button>;
      })}
    </div>
    {pageCount > 1 && <nav className={styles.pagination} aria-label="证据分页">
      <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一组</button>
      <span>{page + 1} / {pageCount}</span>
      <button type="button" disabled={page === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>下一组</button>
    </nav>}

    {selected && <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div ref={dialogRef} className={styles.dialog} data-interaction={interactionMode} role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title" onKeyDown={onDialogKeyDown}>
        <header><div><small>{selected.sourceLabel} / {STATUS[selected.state]}</small><h2 id="evidence-dialog-title">{selected.title}</h2></div><button type="button" onClick={close} aria-label="关闭证据详情">×</button></header>
        <div className={styles.media} data-failed={imageFailed || undefined}>
          {interactionMode ? <EvidencePlate caseCode={caseCode} index={evidence.findIndex((item) => item.id === selected.id)} title={selected.title} mode={interactionMode} /> : !imageFailed ? <img
            src={selected.visualAsset ?? `/assets/cases/${caseCode}/evidence-${String((evidence.findIndex((item) => item.id === selected.id) % 5) + 1).padStart(2, "0")}.webp`}
            alt={`${selected.title}的证据局部图；关键观察同时在下方以文字给出`}
            width={640}
            height={400}
            onError={() => setImageFailed(true)}
          /> : <div role="img" aria-label="证据图像无法加载"><span>IMAGE UNAVAILABLE</span><b>图像不是必要线索</b><p>请使用下方文字观察继续调查。</p></div>}
        </div>
        <div className={styles.observation}><small>可以确认的观察</small><p>{selected.observation}</p></div>
        <footer>
          {selected.state === "dismissed" ? <button type="button" onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: "examined" })}>恢复证据</button> : <button type="button" disabled={linkedEvidenceIds.includes(selected.id)} title={linkedEvidenceIds.includes(selected.id) ? "先移出当前证明，再搁置" : undefined} onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: "dismissed" })}>暂时搁置</button>}
          {selected.state !== "dismissed" && <button type="button" data-active={selected.state === "verified" || undefined} onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: selected.state === "verified" ? (linkedEvidenceIds.includes(selected.id) ? "connected" : "examined") : "verified" })}>{selected.state === "verified" ? "取消核实" : "标记已核实"}</button>}
          <button type="button" data-primary disabled={selected.state === "dismissed"} data-active={linkedEvidenceIds.includes(selected.id) || undefined} onClick={() => dispatch({ type: "link_theory_evidence", theoryId: activeTheoryId, evidenceId: selected.id, linked: !linkedEvidenceIds.includes(selected.id) })}>{linkedEvidenceIds.includes(selected.id) ? "移出当前证明" : "接入当前证明"}</button>
          {linkedEvidenceIds.includes(selected.id) && onContinueToProof && <button type="button" onClick={() => { close(); onContinueToProof(); }}>接入完成，去组织证明</button>}
        </footer>
      </div>
    </div>}
  </section>;
}
