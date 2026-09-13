"use client";

import type { EvidencePlayerState, EvidenceProjection, GameCommand, TheoryDraft } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./evidence-inspector.module.css";
import m2Styles from "./investigation-m2.module.css";

const STATUS: Record<EvidencePlayerState, string> = {
  available: "待检查",
  discovered: "新证据",
  examined: "已检查",
  connected: "已关联",
  verified: "已核实",
  dismissed: "已搁置",
};

export interface EvidenceReading { selectedId?: string; page: number; scrollTop: number }

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
  reading,
  onReadingChange,
  questionContext,
  allEvidence,
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
  reading?: EvidenceReading;
  onReadingChange?: (value: EvidenceReading) => void;
  questionContext?: string;
  allEvidence?: EvidenceProjection[];
}) {
  const [localReading, setLocalReading] = useState<EvidenceReading>({page:0,scrollTop:0});
  const currentReading = reading ?? localReading;
  const updateReading = (value: EvidenceReading) => (onReadingChange ?? setLocalReading)(value);
  const {selectedId,page} = currentReading;
  const setPage = (update: number | ((previous: number) => number)) => updateReading({...currentReading,page:typeof update === 'function' ? update(page) : update});
  const [imageFailed, setImageFailed] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const readingDirectionRef = useRef<-1 | 1 | undefined>(undefined);
  const pageSize = compact ? 4 : 5;
  const pageCount = Math.max(1, Math.ceil(evidence.length / pageSize));
  const visible = evidence.slice(page * pageSize, page * pageSize + pageSize);
  const selected = useMemo(() => evidence.find((item) => item.id === selectedId), [evidence, selectedId]);
  const materialIndex = (id:string) => (allEvidence ?? evidence).findIndex(item=>item.id===id);
  const dismissedCount = evidence.filter((item) => item.state === "dismissed").length;
  const inspectedCount = evidence.filter((item) => !["available", "discovered", "dismissed"].includes(item.state)).length;
  const visibleLinkedCount = evidence.filter(item => linkedEvidenceIds.includes(item.id)).length;
  const candidateCount = Math.max(0, inspectedCount - visibleLinkedCount);
  const selectedIndex = evidence.findIndex(item => item.id === selectedId);
  const selectedNeedsInspection = selected?.state === "available" || selected?.state === "discovered";

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [Boolean(selected)]);

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
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    requestAnimationFrame(() => {
      const navigation = readingDirectionRef.current && dialogRef.current?.querySelector<HTMLButtonElement>(`button[data-reading-direction="${readingDirectionRef.current}"]:not(:disabled)`);
      (navigation || dialogRef.current?.querySelector<HTMLElement>("button"))?.focus({preventScroll:true});
      readingDirectionRef.current=undefined;
      if (dialogRef.current) dialogRef.current.scrollTop = currentReading.scrollTop;
    });
  }, [selected?.id]);

  const open = (item: EvidenceProjection, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    if (item.state === "available" || item.state === "discovered") {
      dispatch({ type: "set_evidence_state", evidenceId: item.id, state: "examined" });
    }
    updateReading({...currentReading,selectedId:item.id,scrollTop:0});
  };
  const close = () => {
    updateReading({...currentReading,selectedId:undefined,scrollTop:0});
  };
  const readAdjacent = (direction: -1 | 1) => {
    const nextIndex = selectedIndex + direction, item = evidence[nextIndex];
    if (!item) return;
    readingDirectionRef.current=direction;
    if (item.state === 'available' || item.state === 'discovered') dispatch({type:'set_evidence_state',evidenceId:item.id,state:'examined'});
    updateReading({selectedId:item.id,page:Math.floor(nextIndex/pageSize),scrollTop:0});
  };
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
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
      <div><small>公开材料 · 逐件检查</small><b>{interactionLabel ?? "寻找支持，也留意反证"}</b></div>
      <span>{Math.min(page * pageSize + 1, evidence.length)}–{Math.min((page + 1) * pageSize, evidence.length)} / {evidence.length}</span>
    </div>
    <div className={styles.triage} aria-label="证据取舍状态">
      <span><b>{visibleLinkedCount}</b>接入证明</span><span><b>{candidateCount}</b>保留候选</span><span><b>{dismissedCount}</b>暂时搁置</span>
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

    {selected && <dialog ref={dialogRef} className={styles.dialog} data-interaction={interactionMode} aria-modal="true" aria-labelledby="evidence-dialog-title" onCancel={event=>{event.preventDefault();close();}} onKeyDown={onDialogKeyDown} onScroll={event=>updateReading({...currentReading,scrollTop:event.currentTarget.scrollTop})}>
        <header><div><small>{selected.sourceLabel} / {STATUS[selected.state]}</small><h2 id="evidence-dialog-title">{selected.title}</h2></div><button type="button" onClick={close} aria-label="关闭证据详情">×</button></header>
        <div className={styles.observation}>{questionContext && <p className={m2Styles.questionContext}>正在核对：{questionContext}</p>}<small>可以确认的观察</small><p>{selected.observation}</p></div>
        <details className={styles.attachment} key={selected.id}><summary>查看材料附图 <span>{interactionMode ? '视觉示意，不作为推理依据' : '关键观察已在上方列出'}</span></summary>
        <div className={styles.media} data-failed={imageFailed || undefined}>
          {interactionMode ? <EvidencePlate caseCode={caseCode} index={materialIndex(selected.id)} title={selected.title} mode={interactionMode} /> : !imageFailed ? <img
            src={selected.visualAsset ?? `/assets/cases/${caseCode}/evidence-${String((materialIndex(selected.id) % 5) + 1).padStart(2, "0")}.webp`}
            alt={`${selected.title}的证据局部图；关键观察同时在下方以文字给出`}
            width={640}
            height={400}
            onError={() => setImageFailed(true)}
          /> : <div role="img" aria-label="证据图像无法加载"><span>IMAGE UNAVAILABLE</span><b>图像不是必要线索</b><p>请使用下方文字观察继续调查。</p></div>}
        </div>
        </details>
        <nav className={styles.readingNav} aria-label="连续阅读材料"><button type="button" data-reading-direction="-1" disabled={selectedIndex<=0} onClick={()=>readAdjacent(-1)}>← 上一份材料</button><span>{selectedIndex+1} / {evidence.length}</span><button type="button" data-reading-direction="1" disabled={selectedIndex>=evidence.length-1} onClick={()=>readAdjacent(1)}>下一份材料 →</button></nav>
        <footer>
          {selected.state === "dismissed" ? <button type="button" onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: "examined" })}>恢复证据</button> : <button type="button" disabled={linkedEvidenceIds.includes(selected.id)} title={linkedEvidenceIds.includes(selected.id) ? "先移出当前证明，再搁置" : undefined} onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: "dismissed" })}>暂时搁置</button>}
          {selected.state !== "dismissed" && <button type="button" data-active={selected.state === "verified" || undefined} onClick={() => dispatch({ type: "set_evidence_state", evidenceId: selected.id, state: selected.state === "verified" ? (linkedEvidenceIds.includes(selected.id) ? "connected" : "examined") : "verified" })}>{selected.state === "verified" ? "取消核实" : "标记已核实"}</button>}
          <button type="button" data-primary disabled={selected.state === "dismissed" || selectedNeedsInspection} title={selectedNeedsInspection ? "先完成这件材料的检查" : undefined} data-active={linkedEvidenceIds.includes(selected.id) || undefined} onClick={() => dispatch({ type: "link_theory_evidence", theoryId: activeTheoryId, evidenceId: selected.id, linked: !linkedEvidenceIds.includes(selected.id) })}>{linkedEvidenceIds.includes(selected.id) ? "移出当前证明" : selectedNeedsInspection ? "先完成检查" : "接入当前证明"}</button>
          {linkedEvidenceIds.includes(selected.id) && onContinueToProof && <button type="button" onClick={() => { close(); onContinueToProof(); }}>接入完成，去组织证明</button>}
        </footer>
    </dialog>}
  </section>;
}
