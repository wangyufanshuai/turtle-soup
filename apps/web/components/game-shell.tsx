"use client";

import type {
  EvidencePlayerState,
  GameCommand,
  GameEvent,
  TheoryDraft,
} from "@turtle-soup/mystery-core";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audio-engine";
import { useMysteryRuntime } from "@/lib/use-mystery-runtime";
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

const EVIDENCE_LABELS: Record<EvidencePlayerState, string> = {
  available: "待检查",
  discovered: "新证据",
  examined: "已检查",
  connected: "已关联",
  verified: "已核实",
  dismissed: "已搁置",
};

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

export function GameShell() {
  const { projection, events, status, saveState, dispatch } = useMysteryRuntime();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("scene");
  const [question, setQuestion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [effectsVolume, setEffectsVolume] = useState(.45);
  const [ambientVolume, setAmbientVolume] = useState(.16);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [online, setOnline] = useState(true);
  const audioRef = useRef<AudioEngine | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    audioRef.current = new AudioEngine();
    const stored = localStorage.getItem("black-soup-settings");
    if (stored) {
      try {
        const value = JSON.parse(stored) as { muted?: boolean; reducedMotion?: boolean; highContrast?: boolean; effectsVolume?: number; ambientVolume?: number };
        setMuted(Boolean(value.muted));
        setReducedMotion(Boolean(value.reducedMotion));
        setHighContrast(Boolean(value.highContrast));
        if (typeof value.effectsVolume === "number") setEffectsVolume(value.effectsVolume);
        if (typeof value.ambientVolume === "number") setAmbientVolume(value.ambientVolume);
      } catch { /* Ignore an invalid local preference record. */ }
    }
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      audioRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    audio?.setMuted(muted);
    audio?.setEffectsVolume(effectsVolume);
    audio?.setAmbientVolume(ambientVolume);
    audio?.toggleAmbient(ambient && !muted);
    localStorage.setItem("black-soup-settings", JSON.stringify({ muted, reducedMotion, highContrast, effectsVolume, ambientVolume }));
  }, [muted, ambient, effectsVolume, ambientVolume, reducedMotion, highContrast]);

  useEffect(() => {
    const last = events.at(-1);
    if (last?.type === "question_answered") audioRef.current?.play("question");
    if (last?.type === "evidence_updated") audioRef.current?.play("inspect");
    if (last?.type === "theory_judged" && last.judgement !== "solved") audioRef.current?.play("contradiction");
    if (last?.type === "case_solved") audioRef.current?.play("solved");
  }, [events]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }, [projection?.transcript.length, reducedMotion]);

  const activeDraft = projection?.theoryDrafts.find((draft) => draft.id === projection.activeTheoryId);
  const eventOptions = useMemo(() => new Map(projection?.eventOptions.map((event) => [event.id, event]) ?? []), [projection?.eventOptions]);
  const activeTheoryOption = projection?.theoryOptions.find((option) => option.id === activeDraft?.hypothesisId);
  const toast = eventMessage(events.at(-1));

  const send = (command: GameCommand) => dispatch(command);
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    send({ type: "ask_text", rawText: question });
    setQuestion("");
  };

  if (status === "loading" || !projection) {
    return <main className={styles.boot}><div className={styles.soupMark}>深</div><p>正在校验案件档案…</p><span>DETERMINISTIC TRUTH CORE</span></main>;
  }
  if (status === "error") {
    return <main className={styles.boot}><div className={styles.soupMark}>!</div><h1>档案无法打开</h1><p>本地推理核心没有成功启动，请刷新页面。</p></main>;
  }

  const evidenceCount = projection.evidence.filter((item) => item.state !== "available" && item.state !== "dismissed").length;
  const linkedCount = activeDraft?.evidenceIds.length ?? 0;

  return (
    <main className={styles.game} data-high-contrast={highContrast || undefined} data-reduced-motion={reducedMotion || undefined}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandGlyph}>深</span>
          <div><strong>THE BLACK SOUP</strong><small>EVIDENCE-FIRST MYSTERY</small></div>
        </div>
        <div className={styles.caseIdentity}>
          <span>CASE 01</span><strong>{projection.case.title}</strong><small>{projection.case.targetMinutes.min}–{projection.case.targetMinutes.max} MIN · {projection.case.difficulty.toUpperCase()}</small>
        </div>
        <div className={styles.systemCluster}>
          <span className={styles.statusLight} data-offline={!online || undefined}>{online ? "ONLINE / OFFLINE READY" : "OFFLINE MODE"}</span>
          <span className={styles.saveState}><Icon name="save" />{saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "本地已保存"}</span>
          <button className={styles.iconButton} onClick={() => setSettingsOpen(true)} aria-label="打开设置"><Icon name="settings" /></button>
        </div>
      </header>

      {toast && <div className={styles.toast} role="status"><span />{toast}</div>}

      <div className={styles.workspace}>
        <section className={`${styles.column} ${styles.sceneColumn} ${mobilePanel === "scene" ? styles.mobileActive : ""}`} aria-label="现场与证据">
          <div className={styles.sectionHeader}><span>01</span><div><small>OBSERVE</small><h2>现场与证据</h2></div><b>{evidenceCount}/{projection.evidence.length}</b></div>
          <div className={styles.sceneFrame}>
            <img src="/scene-cold-room.svg" alt="凌晨两点的冷藏室走廊，封闭的门与监控面板被冷光照亮" />
            <div className={styles.sceneStamp}>02:00<br/><span>SEALED</span></div>
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

          <div className={styles.evidenceList}>
            {projection.evidence.map((evidence, index) => {
              const linked = activeDraft?.evidenceIds.includes(evidence.id) ?? false;
              return (
                <article className={styles.evidenceCard} data-state={evidence.state} key={evidence.id}>
                  <div className={styles.evidenceIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <div className={styles.evidenceBody}>
                    <div className={styles.evidenceMeta}><span>{evidence.sourceLabel}</span><b>{EVIDENCE_LABELS[evidence.state]}</b></div>
                    <h3>{evidence.title}</h3>
                    <p>{evidence.observation}</p>
                    <div className={styles.evidenceActions}>
                      {evidence.state === "available" || evidence.state === "discovered" ? (
                        <button onClick={() => send({ type: "set_evidence_state", evidenceId: evidence.id, state: "examined" })}>检查证据</button>
                      ) : evidence.state === "dismissed" ? (
                        <button onClick={() => send({ type: "set_evidence_state", evidenceId: evidence.id, state: "examined" })}>恢复证据</button>
                      ) : (
                        <>
                          <button data-active={linked || undefined} onClick={() => send({ type: "link_theory_evidence", theoryId: projection.activeTheoryId, evidenceId: evidence.id, linked: !linked })}>{linked ? "已关联当前理论" : "关联当前理论"}</button>
                          <button onClick={() => send({ type: "set_evidence_state", evidenceId: evidence.id, state: evidence.state === "verified" ? "examined" : "verified" })}>{evidence.state === "verified" ? "取消核实" : "标记已核实"}</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`${styles.column} ${styles.questionColumn} ${mobilePanel === "questions" ? styles.mobileActive : ""}`} aria-label="主持问答">
          <div className={styles.sectionHeader}><span>02</span><div><small>ASK & VERIFY</small><h2>主持问答</h2></div><b>{projection.transcript.length} ASKED</b></div>
          <div className={styles.transcript} aria-live="polite">
            {projection.transcript.length === 0 && (
              <div className={styles.hostOpening}>
                <span className={styles.hostSigil}>○</span>
                <div><small>ARCHIVIST / 确定性主持</small><p>不要猜一句答案。先验证一个事实：谁、什么、何时，或者哪条物理约束不成立。</p></div>
              </div>
            )}
            {projection.transcript.map((entry) => (
              <div className={styles.exchange} key={entry.id}>
                <div className={styles.playerQuestion}><span>YOU</span><p>{entry.rawQuestion}</p></div>
                <div className={styles.hostAnswer} data-code={entry.answerCode}>
                  <div><b>{ANSWER_LABELS[entry.answerCode]}</b>{entry.repeated && <em>已验证</em>}</div>
                  <p>{entry.answerText}</p>
                  <small>系统理解：{entry.interpretedAs}</small>
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          {projection.interpretation && (
            <div className={styles.interpretation} role="dialog" aria-label="确认问题解释">
              <small>你的问题存在多种可验证解释</small>
              <strong>“{projection.interpretation.rawText}”</strong>
              <div>{projection.interpretation.candidates.map((candidate) => <button key={candidate.queryId} onClick={() => send({ type: "confirm_interpretation", queryId: candidate.queryId })}>{candidate.label}<span>{candidate.predicate}</span></button>)}</div>
            </div>
          )}

          <div className={styles.askDock}>
            <form onSubmit={submitQuestion}>
              <label htmlFor="question-input">写下一个可以被证实或否定的问题</label>
              <div className={styles.questionInput}>
                <input id="question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这扇门会自动上锁吗？" autoComplete="off" />
                <button type="submit" disabled={!question.trim()}>验证</button>
              </div>
            </form>
            <div className={styles.quickQuestions}>
              {projection.questionScaffolds.slice(0, 3).map((candidate) => <button key={candidate.queryId} onClick={() => send({ type: "ask_text", rawText: candidate.label })}>{candidate.label}</button>)}
            </div>
            <details className={styles.builder}>
              <summary>打开问题构建器 <span>对象 + 关系 + 条件</span></summary>
              <div>{projection.questionScaffolds.map((candidate) => <button key={candidate.queryId} onClick={() => setQuestion(candidate.label)}><b>{candidate.predicate}</b><span>{candidate.label}</span></button>)}</div>
            </details>
            <button className={styles.undoQuestion} disabled={projection.transcript.length === 0} onClick={() => send({ type: "undo_last_question" })}>撤销上一轮提问</button>
          </div>
        </section>

        <section className={`${styles.column} ${styles.theoryColumn} ${mobilePanel === "theory" ? styles.mobileActive : ""}`} aria-label="笔记与假设">
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

              <div className={styles.eventPalette}>
                <div className={styles.subhead}><span>已知事件</span><small>把有证据的事件加入时间链</small></div>
                <div>{projection.eventOptions.map((event) => {
                  const added = activeDraft.eventIds.includes(event.id);
                  return <button key={event.id} disabled={added} onClick={() => send({ type: "upsert_theory_event", theoryId: activeDraft.id, eventId: event.id })}><time>{event.timeLabel}</time><span>{event.label}</span><b>{added ? "已加入" : "+"}</b></button>;
                })}</div>
              </div>

              <ol className={styles.causalChain}>
                {activeDraft.eventIds.length === 0 && <li className={styles.emptyChain}>先检查证据，再把已知事件放入因果链。</li>}
                {activeDraft.eventIds.map((eventId, index) => {
                  const event = eventOptions.get(eventId);
                  if (!event) return null;
                  return <li key={eventId}><div className={styles.chainRail}><span>{index + 1}</span>{index < activeDraft.eventIds.length - 1 && <i />}</div><div><time>{event.timeLabel}</time><strong>{event.label}</strong><nav><button disabled={index === 0} onClick={() => send({ type: "move_theory_event", theoryId: activeDraft.id, eventId, direction: -1 })} aria-label="事件上移">↑</button><button disabled={index === activeDraft.eventIds.length - 1} onClick={() => send({ type: "move_theory_event", theoryId: activeDraft.id, eventId, direction: 1 })} aria-label="事件下移">↓</button><button onClick={() => send({ type: "remove_theory_event", theoryId: activeDraft.id, eventId })}>移除</button></nav></div></li>;
                })}
              </ol>

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
            </section>
          )}
        </section>
      </div>

      <nav className={styles.mobileNav} aria-label="调查区域">
        <button data-active={mobilePanel === "scene" || undefined} onClick={() => setMobilePanel("scene")}><Icon name="eye" /><span>现场</span></button>
        <button data-active={mobilePanel === "questions" || undefined} onClick={() => setMobilePanel("questions")}><Icon name="ask" /><span>提问</span></button>
        <button data-active={mobilePanel === "theory" || undefined} onClick={() => setMobilePanel("theory")}><Icon name="chain" /><span>推理</span></button>
      </nav>

      {settingsOpen && (
        <div className={styles.settingsBackdrop} onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <aside className={styles.settingsPanel} role="dialog" aria-modal="true" aria-label="游戏设置">
            <div className={styles.settingsTitle}><div><small>LOCAL SETTINGS</small><h2>调查设置</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button></div>
            <label className={styles.toggle}><span><b>静音</b><small>关闭所有环境音与反馈音</small></span><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} /></label>
            <label className={styles.toggle}><span><b>环境低频</b><small>仅用于气氛，不包含解谜信息</small></span><input type="checkbox" checked={ambient} disabled={muted} onChange={(event) => setAmbient(event.target.checked)} /></label>
            <label className={styles.range}><span>反馈音量</span><input type="range" min="0" max="1" step=".05" value={effectsVolume} onChange={(event) => setEffectsVolume(Number(event.target.value))} /></label>
            <label className={styles.range}><span>环境音量</span><input type="range" min="0" max=".5" step=".025" value={ambientVolume} onChange={(event) => setAmbientVolume(Number(event.target.value))} /></label>
            <label className={styles.toggle}><span><b>减少动态</b><small>停用非必要转场与滚动动画</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /></label>
            <label className={styles.toggle}><span><b>高对比</b><small>增强边界、正文与状态标记</small></span><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /></label>
            <div className={styles.settingsFoot}><p>案件真相与存档保存在本机。没有账号、远程模型或分析追踪。</p><button onClick={() => { if (window.confirm("确定清空 C01 的本地调查进度吗？")) { send({ type: "restart_case" }); setSettingsOpen(false); } }}>重新开始案件</button></div>
          </aside>
        </div>
      )}
    </main>
  );
}
