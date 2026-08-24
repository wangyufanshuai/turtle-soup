"use client";

import type {
  CaseId,
  GameCommand,
  GameEvent,
  TheoryDraft,
} from "@turtle-soup/mystery-core";
import { challengeRotation, emptyMasteryRecord, recordMasterySolve, type CaseMasteryRecord } from "@turtle-soup/mystery-core";
import { FormEvent, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AudioEngine } from "@/lib/audio-engine";
import { getSoundscapeProfile } from "@/lib/audio-profiles";
import { useMysteryRuntime } from "@/lib/use-mystery-runtime";
import { useFunGateSession } from "@/lib/use-fun-gate-session";
import { FunGateTools } from "./fun-gate-tools";
import { VariantShell } from "./variant-shell";
import { StorageRecovery } from "./storage-recovery";
import { useHostRewrite } from "@/lib/use-host-rewrite";
import { HostRewriteControls } from "./host-rewrite-controls";
import { loadMastery, saveMastery } from "@/lib/mastery-store";
import { useLocalDiagnostics } from "@/lib/use-local-diagnostics";
import { EvidenceInspector } from "./evidence-inspector";
import { LegacyTheoryWorkbench } from "./legacy-theory-workbench";
import { goldenExperience } from "@/lib/golden-experience";
import styles from "./game-shell.module.css";

type MobilePanel = "scene" | "questions" | "theory";

const ANSWER_LABELS = {
  yes: "是",
  no: "不是",
  partial: "部分相关",
  invalid_premise: "前提不成立",
  unknown: "信息不足",
  irrelevant: "与真相无关",
  unanswerable: "无法判断",
  unrecognized: "无法识别",
} as const;

function eventMessage(event?: GameEvent): string | undefined {
  if (!event) return undefined;
  switch (event.type) {
    case "question_answered": return event.entry.repeated ? "这个事实已经验证过；没有消耗额外线索。" : "回答已写入调查记录。";
    case "interpretation_required": return "这个问题存在多种解释，请确认你要验证的事实。";
    case "question_rejected": return "没有改变案件状态。试着明确对象、动作或时间。";
    case "question_undone": return "上一轮提问已撤销。";
    case "evidence_updated": return "证据状态已更新。";
    case "location_visited": return "地点检查完成，新的证据路径可能已经出现。";
    case "theory_judged": return event.message;
    case "case_solved": return "证据链闭合。你已经证明了这起事件。";
    case "replay_ready": return "真相回放已生成。";
    case "command_rejected": return event.message;
    default: return undefined;
  }
}

function Icon({ name }: { name: "eye" | "ask" | "chain" | "sound" | "settings" | "save" }) {
  const paths = {
    eye: <><path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></>,
    ask: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9.2a2.5 2.5 0 0 1 4.7 1.2c0 2-2.5 2.2-2.5 4M12 18h.01"/></>,
    chain: <><path d="M7.5 7.5 4.8 10.2a3.8 3.8 0 0 0 5.4 5.4l2.7-2.7M16.5 16.5l2.7-2.7a3.8 3.8 0 0 0-5.4-5.4l-2.7 2.7"/></>,
    sound: <><path d="M5 10v4h3l4 3V7L8 10H5Z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.6a7 7 0 0 0-.7-1.7l1-1.8-2.1-2.1-1.8 1a7 7 0 0 0-1.7-.7L11 2H8l-.6 2a7 7 0 0 0-1.7.7l-1.8-1-2.1 2.1 1 1.8a7 7 0 0 0-.7 1.7L0 10v3l2 .6a7 7 0 0 0 .7 1.7l-1 1.8 2.1 2.1 1.8-1a7 7 0 0 0 1.7.7L8 21h3l.6-2a7 7 0 0 0 1.7-.7l1.8 1 2.1-2.1-1-1.8a7 7 0 0 0 .7-1.7l2.1-.7Z"/></>,
    save: <><path d="M4 4h13l3 3v13H4Z"/><path d="M7 4v6h9V4M8 20v-6h8v6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function GameShell({ caseId = "c01-cold-room-knock" }: { caseId?: CaseId }) {
  const { projection, events, status, saveState, restoreStatus, latestSave, storageIssue, retrySave, dispatch } = useMysteryRuntime(caseId);
  const { report, markHintUsed, exportSession } = useFunGateSession(caseId, events);
  const diagnostics = useLocalDiagnostics(projection, events);
  const [mastery, setMastery] = useState<CaseMasteryRecord>();
  const masterySolveKey = useRef<string | undefined>(undefined);
  const host = useHostRewrite(projection);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("scene");
  const [question, setQuestion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [effectsVolume, setEffectsVolume] = useState(.45);
  const [ambientVolume, setAmbientVolume] = useState(.16);
  const [audioSupported, setAudioSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [online, setOnline] = useState(true);
  const audioRef = useRef<AudioEngine | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const interpretationRef = useRef<HTMLDivElement>(null);
  const interpretationWasOpen = useRef(false);
  const soundscape = getSoundscapeProfile("cold-room");
  const golden = goldenExperience(caseId);
  useEffect(() => {
    if (!projection) return;
    let active = true;
    void loadMastery(projection.case.id, projection).then((value) => { if (active) setMastery(value); });
    return () => { active = false; };
  }, [projection?.case.id, projection?.case.version, projection?.case.contentHash]);
  useEffect(() => {
    if (!projection?.solved) return;
    const key = `${projection.case.id}:${projection.replayMode}:${projection.debrief?.questionCount ?? 0}:${projection.debrief?.proofCompleteness ?? 0}`;
    if (masterySolveKey.current === key) return;
    masterySolveKey.current = key;
    void (async () => {
      const current = mastery ?? (await loadMastery(projection.case.id, projection));
      const next = recordMasterySolve(current ?? emptyMasteryRecord(projection.case), projection, new Date().toISOString(), report.hintUseCount === 0);
      setMastery(next);
      await saveMastery(next);
    })();
  }, [projection, mastery]);

  useEffect(() => {
    audioRef.current = new AudioEngine("cold-room");
    setAudioSupported(AudioEngine.isSupported());
    const stored = localStorage.getItem("black-soup-settings");
    if (stored) {
      try {
        const value = JSON.parse(stored) as { muted?: boolean; ambient?: boolean; reducedMotion?: boolean; highContrast?: boolean; effectsVolume?: number; ambientVolume?: number };
        setMuted(Boolean(value.muted));
        setAmbient(Boolean(value.ambient));
        setReducedMotion(Boolean(value.reducedMotion));
        setHighContrast(Boolean(value.highContrast));
        if (typeof value.effectsVolume === "number") setEffectsVolume(value.effectsVolume);
        if (typeof value.ambientVolume === "number") setAmbientVolume(value.ambientVolume);
      } catch { /* Ignore an invalid local preference record. */ }
    }
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onVisibility = () => audioRef.current?.setPageHidden(document.hidden);
    const onPageHide = () => audioRef.current?.setPageHidden(true);
    const onPageShow = () => audioRef.current?.setPageHidden(document.hidden);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      audioRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    audio?.setMuted(muted);
    audio?.setEffectsVolume(effectsVolume);
    audio?.setAmbientVolume(ambientVolume);
    audio?.toggleAmbient(ambient && !muted);
    localStorage.setItem("black-soup-settings", JSON.stringify({ muted, ambient, reducedMotion, highContrast, effectsVolume, ambientVolume }));
  }, [muted, ambient, effectsVolume, ambientVolume, reducedMotion, highContrast]);

  useEffect(() => {
    const last = events.at(-1);
    if (last?.type === "question_answered") audioRef.current?.play("question");
    if (last?.type === "evidence_updated") audioRef.current?.play("inspect");
    if (last?.type === "theory_judged" && last.judgement !== "solved") audioRef.current?.play("contradiction");
    if (last?.type === "case_solved") audioRef.current?.play("solved");
    if (last?.type === "replay_ready") audioRef.current?.play("replay");
  }, [events]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }, [projection?.transcript.length, reducedMotion]);

  useEffect(() => {
    if (projection?.interpretation) {
      interpretationWasOpen.current = true;
      requestAnimationFrame(() => interpretationRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    } else if (interpretationWasOpen.current) {
      interpretationWasOpen.current = false;
      requestAnimationFrame(() => questionInputRef.current?.focus());
    }
  }, [projection?.interpretation]);

  useEffect(() => {
    if (settingsOpen) settingsRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [settingsOpen]);

  const closeSettings = () => {
    setSettingsOpen(false);
    requestAnimationFrame(() => settingsButtonRef.current?.focus());
  };
  const handleSettingsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeSettings(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(settingsRef.current?.querySelectorAll<HTMLElement>("button, input") ?? [])].filter((item) => !item.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
  };

  const activeDraft = projection?.theoryDrafts.find((draft) => draft.id === projection.activeTheoryId);
  const eventOptions = useMemo(() => new Map(projection?.eventOptions.map((event) => [event.id, event]) ?? []), [projection?.eventOptions]);
  const activeTheoryOption = projection?.theoryOptions.find((option) => option.id === activeDraft?.hypothesisId);
  const toast = restoreStatus === "incompatible"
    ? "这份本地存档属于旧版本或其他案件，已安全拒绝恢复；当前从新调查开始。"
    : restoreStatus === "corrupt"
      ? "本地存档损坏或不完整，已安全隔离；当前从新调查开始，可从档案页导入备份。"
      : eventMessage(events.at(-1));

  const send = (command: GameCommand) => dispatch(command);
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    send({ type: "ask_text", rawText: question });
    setQuestion("");
  };

  if (status === "loading" || !projection) {
    return <main id="main-content" tabIndex={-1} className={styles.boot}><div className={styles.soupMark}>深</div><p>正在校验案件档案…</p><span>DETERMINISTIC TRUTH CORE</span></main>;
  }
  if (status === "error") {
    return <main id="main-content" tabIndex={-1} className={styles.boot}><div className={styles.soupMark}>!</div><h1>档案无法打开</h1><p>本地推理核心没有成功启动，请刷新页面。</p></main>;
  }

  if (projection.case.presentation.layoutId !== "cold-room") {
    return <VariantShell projection={projection} events={events} restoreStatus={restoreStatus} saveState={saveState} online={online} latestSave={latestSave} storageIssue={storageIssue} onRetrySave={retrySave} dispatch={dispatch} />;
  }

  const evidenceCount = projection.evidence.filter((item) => item.state !== "available" && item.state !== "dismissed").length;
  const inspectedEvidenceCount = projection.evidence.filter((item) => !["available", "discovered", "dismissed"].includes(item.state)).length;
  const linkedCount = activeDraft?.evidenceIds.length ?? 0;
  const hasObservedLocation = projection.locations.some((location) => location.visited);
  const revealEvidence = projection.transcript.length > 0 || hasObservedLocation || inspectedEvidenceCount > 0 || projection.solved;
  const revealTheory = projection.transcript.length >= 2 || inspectedEvidenceCount >= 2 || Boolean(activeDraft?.eventIds.length) || projection.solved;
  const experienceStage = revealTheory ? "theory" : revealEvidence ? "investigation" : "opening";

  return (
    <main id="main-content" tabIndex={-1} className={styles.game} data-experience-stage={experienceStage} data-golden-cadence={golden?.cadence} data-replay-tone={golden?.replayTone} data-high-contrast={highContrast || undefined} data-reduced-motion={reducedMotion || undefined}>
      <header className={styles.topbar} inert={settingsOpen || undefined}>
        <div className={styles.brand}>
          <span className={styles.brandGlyph}>深</span>
          <div><strong>THE BLACK SOUP</strong><small>EVIDENCE-FIRST MYSTERY</small></div>
        </div>
        <div className={styles.caseIdentity}>
          <span>CASE 01</span><h1>{projection.case.title}</h1><small>{projection.case.targetMinutes.min}–{projection.case.targetMinutes.max} MIN · {projection.case.difficulty.toUpperCase()}</small>
        </div>
        <div className={styles.systemCluster}>
          <FunGateTools report={report} onHint={markHintUsed} onExport={exportSession} />
          <span className={styles.statusLight} data-offline={!online || undefined}>{online ? "ONLINE / OFFLINE READY" : "OFFLINE MODE"}</span>
          <span className={styles.saveState}><Icon name="save" />{saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "本地已保存"}</span>
          <button ref={settingsButtonRef} className={styles.iconButton} onClick={() => setSettingsOpen(true)} aria-label="打开设置"><Icon name="settings" /></button>
        </div>
      </header>
      <h1 className={styles.mobileCaseTitle}>{projection.case.title}</h1>

      {toast && <div className={styles.toast} role="status"><span />{toast}</div>}
      <StorageRecovery issue={storageIssue} save={latestSave} onRetry={retrySave} />

      <div className={styles.workspace} inert={settingsOpen || undefined}>
        <section id="c01-scene" className={`${styles.column} ${styles.sceneColumn} ${mobilePanel === "scene" ? styles.mobileActive : ""}`} aria-label="现场与证据">
          <div className={styles.sectionHeader}><span>01</span><div><small>OBSERVE</small><h2>现场与证据</h2></div><b>{evidenceCount}/{projection.evidence.length}</b></div>
          <div className={styles.sceneFrame}>
            <picture><source media="(max-width: 850px)" srcSet="/assets/cases/c01/scene-mobile.webp" /><img src="/assets/cases/c01/scene-desktop.webp" alt="凌晨两点的冷藏室走廊，封闭的门与监控面板被冷光照亮" width={960} height={620} fetchPriority="high" /></picture>
            <div className={styles.sceneStamp}>{golden?.sceneLabel ?? "02:00 · SEALED"}<br/><span>{golden?.sceneHint ?? "SEALED"}</span></div>
            <button className={styles.knockButton} onClick={() => audioRef.current?.play("knock")} aria-label="播放三下敲击的非必要气氛音"><Icon name="sound" />听取记录</button>
          </div>
          <p className={styles.premise}>{projection.case.surface}</p>

          <div className={styles.locationStrip} aria-label="可检查地点">
            {projection.locations.map((location) => (
              <button key={location.id} disabled={location.visited} onClick={() => send({ type: "visit_location", locationId: location.id })}>
                <span>{location.visited ? "已检查" : "检查"}</span>{location.label}
              </button>
            ))}
          </div>

          {revealEvidence ? <EvidenceInspector evidence={projection.evidence} activeTheoryId={projection.activeTheoryId} linkedEvidenceIds={activeDraft?.evidenceIds ?? []} caseCode="c01" dispatch={send} interactionMode={golden?.evidenceBehavior} interactionLabel={golden?.evidenceAction} /> : <div className={styles.stageCue}><small>FIRST TRACE / 01</small><b>先固定一个能被证实的前提</b><p>检查现场，或直接问：门关上以后会发生什么？第一条回答出现后，证据架才会展开。</p><button onClick={() => setMobilePanel("questions")}>前往提问 <span>→</span></button></div>}
        </section>

        <section id="c01-questions" className={`${styles.column} ${styles.questionColumn} ${mobilePanel === "questions" ? styles.mobileActive : ""}`} aria-label="主持问答">
          <div className={styles.sectionHeader}><span>02</span><div><small>ASK & VERIFY</small><h2>主持问答</h2></div><b>{projection.transcript.length} ASKED</b></div>
          <div className={styles.transcript} aria-live="polite" tabIndex={0} aria-label="主持问答记录，可滚动">
            {projection.transcript.length === 0 && (
              <div className={styles.hostOpening}>
                <span className={styles.hostSigil}>○</span>
                <div><small>ARCHIVIST / 确定性主持</small><p>先问一个可以被记录证实或否定的事实。第一问不扣次数，也不会把你锁进错误路线。</p></div>
              </div>
            )}
            {projection.transcript.map((entry) => (
              <div className={styles.exchange} key={entry.id} data-transcript-entry={entry.id}>
                <div className={styles.playerQuestion}><span>YOU</span><p>{entry.rawQuestion}</p></div>
                <div className={styles.hostAnswer} data-code={entry.answerCode}>
                  <div><b>{ANSWER_LABELS[entry.answerCode]}</b>{entry.repeated && <em>已验证</em>}</div>
                  <p>{entry.answerText}</p>
                  {host.rewrites[entry.id] && <p className={styles.hostRewrite}><small>本地改写主持</small>{host.rewrites[entry.id].text}</p>}
                  <small>系统理解：{entry.interpretedAs}</small>
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
          {revealTheory && golden && <aside className={styles.insight} role="status"><small>CAUSAL SHIFT / 顿悟节点</small><p>{golden.insight}</p></aside>}

          {projection.interpretation && (
            <div ref={interpretationRef} className={styles.interpretation} role="group" aria-label="确认问题解释" aria-live="polite">
              <small>你的问题存在多种可验证解释</small>
              <strong>“{projection.interpretation.rawText}”</strong>
              <div>{projection.interpretation.candidates.map((candidate) => <button key={candidate.queryId} onClick={() => send({ type: "confirm_interpretation", queryId: candidate.queryId })}>{candidate.label}<span>{candidate.predicate}</span></button>)}</div>
            </div>
          )}

          <div className={styles.askDock}>
            <form onSubmit={submitQuestion}>
              <label htmlFor="question-input">写下一个可以被证实或否定的问题</label>
              <div className={styles.questionInput}>
                <input ref={questionInputRef} id="question-input" name="investigation-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：“这扇门会自动上锁吗？”…" autoComplete="off" />
                <button type="submit" disabled={!question.trim()}>验证</button>
              </div>
            </form>
            <div className={styles.quickQuestions}>
              {projection.questionScaffolds.slice(0, projection.transcript.length === 0 ? 1 : 3).map((candidate) => <button key={candidate.queryId} onClick={() => send({ type: "ask_text", rawText: candidate.label })}>{candidate.label}</button>)}
            </div>
            {projection.transcript.length > 0 && <details className={styles.builder}>
              <summary>打开问题构建器 <span>对象 + 关系 + 条件</span></summary>
              <div>{projection.questionScaffolds.map((candidate) => <button key={candidate.queryId} onClick={() => setQuestion(candidate.label)}><b>{candidate.predicate}</b><span>{candidate.label}</span></button>)}</div>
            </details>}
            <button className={styles.undoQuestion} disabled={projection.transcript.length === 0} onClick={() => send({ type: "undo_last_question" })}>撤销上一轮提问</button>
          </div>
        </section>

        {revealTheory && <section id="c01-theory" className={`${styles.column} ${styles.theoryColumn} ${mobilePanel === "theory" ? styles.mobileActive : ""}`} aria-label="笔记与假设">
          <div className={styles.sectionHeader}><span>03</span><div><small>BUILD & PROVE</small><h2>因果链</h2></div><b>{linkedCount} LINKED</b></div>
          <div className={styles.theoryTabs}>
            {projection.theoryDrafts.map((draft) => <button key={draft.id} data-active={draft.id === projection.activeTheoryId || undefined} onClick={() => send({ type: "select_theory", theoryId: draft.id })}>{draft.title}<span>{draft.eventIds.length} 个事件</span></button>)}
          </div>

          {activeDraft && (
            <div className={styles.theoryEditor}>
              <label className={styles.fieldLabel}>当前解释路径
                <select value={activeDraft.hypothesisId} onChange={(event) => send({ type: "set_theory_hypothesis", theoryId: activeDraft.id, hypothesisId: event.target.value })}>
                  {projection.theoryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>

              <LegacyTheoryWorkbench caseId={projection.case.id} draft={activeDraft} events={projection.eventOptions} dispatch={send} />

              <div className={styles.proofTray}>
                <div className={styles.subhead}><span>证明材料</span><small>{linkedCount} 件已关联</small></div>
                <div>{projection.evidence.filter((item) => item.state !== "available" && item.state !== "dismissed").map((evidence) => {
                  const linked = activeDraft.evidenceIds.includes(evidence.id);
                  return <button key={evidence.id} data-linked={linked || undefined} onClick={() => send({ type: "link_theory_evidence", theoryId: activeDraft.id, evidenceId: evidence.id, linked: !linked })}><span>{linked ? "✓" : "+"}</span>{evidence.title}</button>;
                })}</div>
              </div>

              <label className={styles.fieldLabel}>驱动条件
                <select value={activeDraft.motiveKey ?? ""} onChange={(event) => send({ type: "set_theory_motive", theoryId: activeDraft.id, motiveKey: event.target.value || undefined })}>
                  <option value="">尚未证明</option>
                  {activeTheoryOption?.motiveOptions.map((motive) => <option key={motive.id} value={motive.id}>{motive.label}</option>)}
                </select>
              </label>

              <button className={styles.submitTheory} disabled={!projection.canSubmit || projection.solved} onClick={() => send({ type: "submit_theory", theoryId: activeDraft.id })}><span>{projection.solved ? "CASE CLOSED" : "提交因果证明"}</span><small>{projection.canSubmit ? "检查时间、证据与驱动条件" : "至少加入一个事件和一件证据"}</small></button>
            </div>
          )}

          {projection.solved && (
            <section className={styles.solvedPanel} aria-live="polite">
              <div className={styles.solvedMark}>CLOSED</div>
              <h3>证据链闭合</h3>
              <p>你没有猜中一句汤底；你证明了事件如何发生。</p>
              {projection.replay.length === 0 ? <button onClick={() => send({ type: "request_proof_replay" })}>生成真相回放</button> : (
                <div className={styles.replay}>
                  {projection.replay.map((beat) => <article key={beat.id}><time>{beat.timeLabel}</time><div><strong>{beat.caption}</strong><small>证明：{beat.evidenceTitles.join(" / ")}</small></div></article>)}
                </div>
              )}
              {projection.debrief && <div className={styles.debrief}><span><b>{projection.debrief.proofCompleteness}%</b>证明完整</span><span><b>{projection.debrief.questionCount}</b>次提问</span><span><b>{projection.debrief.repeatedQuestionCount}</b>次重复</span><span><b>已解锁</b>有限问题挑战</span></div>}
              {projection.replayChallenges.length > 0 && <div className={styles.replayChallenges}><small>MASTERY ROTATION · {mastery ? (challengeRotation(mastery).nextChallenge === "complete" ? "MASTERED" : `下一项：${challengeRotation(mastery).nextChallenge}`) : "本机记录中"}</small>{projection.replayChallenges.map((challenge) => <button key={challenge.mode} onClick={() => send({ type: "set_replay_mode", mode: challenge.mode })}>{challenge.mode === "limited-questions" ? `限定 ${challenge.questionLimit ?? 12} 问` : challenge.mode === "minimal-proof" ? "最小证据证明" : "无快捷问题"}</button>)}</div>}
            </section>
          )}
        </section>}
      </div>

      <nav className={styles.mobileNav} aria-label="调查区域" inert={settingsOpen || undefined}>
        <button aria-controls="c01-scene" aria-pressed={mobilePanel === "scene"} data-active={mobilePanel === "scene" || undefined} onClick={() => setMobilePanel("scene")}><Icon name="eye" /><span>现场</span></button>
        <button aria-controls="c01-questions" aria-pressed={mobilePanel === "questions"} data-active={mobilePanel === "questions" || undefined} onClick={() => setMobilePanel("questions")}><Icon name="ask" /><span>提问</span></button>
        <button aria-controls="c01-theory" aria-pressed={mobilePanel === "theory"} data-active={mobilePanel === "theory" || undefined} disabled={!revealTheory} onClick={() => setMobilePanel("theory")}><Icon name="chain" /><span>{revealTheory ? "推理" : "待解锁"}</span></button>
      </nav>

      {settingsOpen && (
        <div className={styles.settingsBackdrop} onMouseDown={(event) => event.target === event.currentTarget && closeSettings()}>
          <aside ref={settingsRef} className={styles.settingsPanel} role="dialog" aria-modal="true" aria-label="游戏设置" onKeyDown={handleSettingsKeyDown}>
            <div className={styles.settingsTitle}><div><small>LOCAL SETTINGS</small><h2>调查设置</h2></div><button onClick={closeSettings} aria-label="关闭设置">×</button></div>
            <label className={styles.toggle}><span><b>静音</b><small>关闭所有环境音与反馈音</small></span><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} /></label>
            <div className={styles.soundscapeProfile}><span>SOUNDSCAPE / 01</span><b>{soundscape.label}</b><small>{audioSupported ? "程序化音景，不包含解谜信息" : "当前浏览器无 Web Audio；游戏已自动降级为静默模式"}</small><button disabled={!audioSupported || muted} onClick={() => audioRef.current?.play("question")}>试听反馈</button></div>
            <label className={styles.toggle}><span><b>案件音景</b><small>失去页面焦点时自动暂停</small></span><input type="checkbox" checked={ambient} disabled={muted || !audioSupported} onChange={(event) => setAmbient(event.target.checked)} /></label>
            <label className={styles.range}><span>反馈音量</span><input type="range" min="0" max="1" step=".05" value={effectsVolume} onChange={(event) => setEffectsVolume(Number(event.target.value))} /></label>
            <label className={styles.range}><span>环境音量</span><input type="range" min="0" max=".5" step=".025" value={ambientVolume} onChange={(event) => setAmbientVolume(Number(event.target.value))} /></label>
            <label className={styles.toggle}><span><b>减少动态</b><small>停用非必要转场与滚动动画</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /></label>
            <label className={styles.toggle}><span><b>高对比</b><small>增强边界、正文与状态标记</small></span><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /></label>
            <HostRewriteControls settings={host.settings} status={host.status} message={host.message} onChange={host.setSettings} onClear={host.clearCache} />
            <div className={styles.settingsFoot}><p>LOCAL DIAGNOSTICS · 仅保存聚合指标，不上传</p><label className={styles.toggle}><span><b>允许本地记录</b></span><input type="checkbox" checked={diagnostics.recording} onChange={(event) => diagnostics.toggle(event.target.checked)} /></label><div><button onClick={() => void diagnostics.exportSessions("json")}>导出 JSON</button><button onClick={() => void diagnostics.exportSessions("csv")}>导出 CSV</button><button onClick={() => void diagnostics.clear()}>清空诊断</button></div></div>
            <div className={styles.settingsFoot}><p>案件真相与存档保存在本机。没有账号、远程模型或分析追踪。</p><button onClick={() => { if (window.confirm("确定清空 C01 的本地调查进度吗？")) { send({ type: "restart_case" }); closeSettings(); } }}>重新开始案件</button></div>
          </aside>
        </div>
      )}
    </main>
  );
}
