"use client";

import Link from "next/link";
import { challengeRotation, emptyMasteryRecord, recordMasterySolve, type GameCommand, type GameEvent, type PlayerProjection, type SaveEnvelope, type CaseMasteryRecord } from "@turtle-soup/mystery-core";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import styles from "./variant-shell.module.css";
import { useFunGateSession } from "@/lib/use-fun-gate-session";
import { FunGateTools } from "./fun-gate-tools";
import { StorageRecovery } from "./storage-recovery";
import type { RestoreStatus } from "@/lib/worker-protocol";
import { AudioEngine } from "@/lib/audio-engine";
import { getSoundscapeProfile } from "@/lib/audio-profiles";
import { ReasoningBoard } from "./reasoning-board";
import { useHostRewrite } from "@/lib/use-host-rewrite";
import { HostRewriteControls } from "./host-rewrite-controls";
import { loadMastery, saveMastery } from "@/lib/mastery-store";
import { useLocalDiagnostics } from "@/lib/use-local-diagnostics";
import { EvidenceInspector } from "./evidence-inspector";
import { LegacyTheoryWorkbench } from "./legacy-theory-workbench";
import { goldenExperience } from "@/lib/golden-experience";

const ANSWERS: Record<string, string> = { yes: "是", no: "不是", partial: "部分相关", unknown: "信息不足", irrelevant: "无关", invalid_premise: "前提不成立", unanswerable: "无法判断", unrecognized: "无法识别" };

function lastMessage(events: GameEvent[]) {
  const event = events.at(-1);
  if (!event) return "先观察一个异常，再验证一个事实。";
  if (event.type === "question_answered") return event.entry.repeated ? "这个事实已经验证过；没有消耗额外线索。" : event.entry.answerText;
  if (event.type === "interpretation_required") return "这个问题有多种可验证解释；请选择你真正想确认的事实。";
  if (event.type === "question_rejected") return "没有改变案件状态。请明确对象、动作或时间，或使用推荐问题。";
  if (event.type === "question_undone") return "上一轮提问已经撤销，证据检查状态保持不变。";
  if (event.type === "evidence_updated") return "证据状态已更新；现在可以把它接入或移出证明链。";
  if (event.type === "theory_judged") return event.message;
  if (event.type === "case_solved") return "证明链闭合。案件已结案。";
  if (event.type === "replay_ready") return "结案回放已经生成，每一拍都能追溯到证据来源。";
  if (event.type === "reasoning_board_updated") return "推理板已更新；提交时会同时检查这些关系。";
  if (event.type === "chapter_unlocked") return "新的调查阶段已经解锁。";
  if (event.type === "replay_mode_started") return "重玩挑战已经开始，案件状态已安全重置。";
  if (event.type === "command_rejected") return event.message;
  return "记录已更新。";
}

function actionLabel(id: string, fallback: string) {
  const labels: Record<string, string> = {
    "snow-route": "物理路线",
    "second-shadow": "身份档案",
    "mail-room": "封存链",
    "switchboard": "电路链",
    "harbor-ledger": "航次链",
    "key-archive": "钥匙回收链",
    "sound-lab": "录音来源链",
    "rain-room": "水痕链",
    "telegraph-room": "端点链",
    "signature-desk": "签名链",
    "elevator-control": "楼层链",
  };
  return labels[id] ?? fallback;
}

export function VariantShell({ projection, events, restoreStatus, saveState, online, latestSave, storageIssue, onRetrySave, dispatch }: { projection: PlayerProjection; events: GameEvent[]; restoreStatus?: RestoreStatus; saveState: "idle" | "saving" | "saved" | "error"; online: boolean; latestSave?: SaveEnvelope; storageIssue?: string; onRetrySave: () => void; dispatch: (command: GameCommand) => void }) {
  const { report, markHintUsed, exportSession } = useFunGateSession(projection.case.id, events);
  const diagnostics = useLocalDiagnostics(projection, events);
  const host = useHostRewrite(projection);
  const [mastery, setMastery] = useState<CaseMasteryRecord>();
  const masterySolveKey = useRef<string | undefined>(undefined);
  const [panel, setPanel] = useState<"scene" | "questions" | "theory">("scene");
  const [question, setQuestion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [effectsVolume, setEffectsVolume] = useState(.45);
  const [ambientVolume, setAmbientVolume] = useState(.16);
  const [audioSupported, setAudioSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [collapsedBoardIds, setCollapsedBoardIds] = useState<string[]>([]);
  const settingsRef = useRef<HTMLElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const interpretationRef = useRef<HTMLDivElement>(null);
  const interpretationWasOpen = useRef(false);
  const active = projection.theoryDrafts.find((draft) => draft.id === projection.activeTheoryId);
  const activeTheoryOption = projection.theoryOptions.find((option) => option.id === active?.hypothesisId);
  const eventMap = useMemo(() => new Map(projection.eventOptions.map((event) => [event.id, event])), [projection.eventOptions]);
  const layout = projection.case.presentation.layoutId;
  const caseCode = projection.case.id.match(/^(c\d+)/)?.[1] ?? "c01";
  const golden = goldenExperience(projection.case.id);
  const sceneDesktop = projection.case.presentation.sceneAsset;
  const sceneMobile = projection.case.presentation.sceneAssetMobile ?? sceneDesktop;
  const soundscape = getSoundscapeProfile(projection.case.id);
  const legacyProfile = layout === "snow-route"
    ? { kicker: "NIGHT ROUTE / PHYSICAL TRACE", scene: "雪面与维护路线", hint: "雪开始后，脚印不是唯一的移动证据", left: "ROUTE RECONSTRUCTION", middle: "RADIO & RECORDS", chain: "人 / 载体 / 雪面 / 时间", placeholder: "例如：“雪是什么时候开始下的？”…" }
    : layout === "second-shadow"
      ? { kicker: "BACKSTAGE DOSSIER / IDENTITY TRACE", scene: "舞台与后台影子", hint: "角色的轮廓不是人物的身份证明", left: "BACKSTAGE SCAN", middle: "WITNESS & CAST", chain: "角色 / 人物 / 服装 / 证件", placeholder: "例如：“台上的角色就是罗弈本人吗？”…" }
      : layout === "mail-room"
        ? { kicker: "NIGHT POST / CHAIN OF CUSTODY", scene: "夜班邮袋与邮戳机", hint: "显示日期必须和真实经过时间分开", left: "MAILROOM SCAN", middle: "DISPATCH RECORDS", chain: "写信 / 邮戳 / 封存 / 离港", placeholder: "例如：邮戳机器的日期错了吗？" }
        : layout === "switchboard"
          ? { kicker: "POWER OUTAGE / LIGHT PATH", scene: "停电仓库与侧廊光路", hint: "看到三道光不等于接通三条电路", left: "WAREHOUSE SCAN", middle: "INTERCOM & LOGS", chain: "光源 / 反射 / 电路 / 视角", placeholder: "例如：第三盏灯是反光造成的吗？" }
          : layout === "harbor-ledger"
            ? { kicker: "HARBOR NIGHT / SYNCED LEDGER", scene: "夜航码头与离线闸机", hint: "记录写入时间不一定是行动发生时间", left: "HARBOR SCAN", middle: "RADIO & LEDGER", chain: "扫描 / 同步 / 航次 / 类别", placeholder: "例如：23:52是扫描发生的时间吗？" }
            : layout === "key-archive"
              ? { kicker: "KEY ARCHIVE / RETURN PATH", scene: "维修柜与服务孔", hint: "钥匙回到原位，不代表有人重新开过锁", left: "LOCKER SCAN", middle: "MAINTENANCE LOGS", chain: "锁柜 / 缆线 / 磁头 / 回收", placeholder: "例如：钥匙是被维修缆线拉走的吗？" }
              : layout === "sound-lab"
                ? { kicker: "SOUND LAB / FILE PROVENANCE", scene: "隔音室与缓存设备", hint: "听见时间不一定是录下时间", left: "RECORDING SCAN", middle: "WAVEFORM & LOGS", chain: "录制 / 缓存 / 断电 / 播放", placeholder: "例如：录音是在江舟离开前录的吗？" }
                : layout === "rain-room"
                  ? { kicker: "RAIN ROOM / ENVIRONMENTAL LAG", scene: "雨停后的顶层储物间", hint: "外部状态停止，不代表内部水流立刻停止", left: "MOISTURE SCAN", middle: "WEATHER & MAINTENANCE", chain: "降雨 / 蓄水 / 管道 / 滴落", placeholder: "例如：雨停后屋顶还在漏吗？" }
                  : layout === "telegraph-room"
                    ? { kicker: "TELEGRAPH ROOM / ONE RING", scene: "地下交换机房与孤立手柄", hint: "端点收到信号，不等于外部有人呼叫", left: "SWITCH ROOM SCAN", middle: "PBX & CALL LOGS", chain: "断线 / 队列 / 回放 / 端点", placeholder: "例如：是维护测试回放让电话响的吗？" }
                    : layout === "signature-desk"
                      ? { kicker: "SIGNATURE DESK / BORROWED MARK", scene: "合同档案室与借用印章", hint: "签名外观不自动证明签署人在场", left: "DOCUMENT SCAN", middle: "ENTRY & SEAL LOGS", chain: "空白 / 印章 / 到场 / 封存", placeholder: "例如：签名是印章盖出来的吗？" }
                      : { kicker: "ELEVATOR CONTROL / VIRTUAL FLOOR", scene: "显示0层的办公楼电梯", hint: "显示编号不一定是轿厢目的地", left: "ELEVATOR SCAN", middle: "SENSOR & CONTROL LOGS", chain: "检修 / 编号 / 显示 / 位置", placeholder: "例如：0是控制器的虚拟编号吗？" };
  const baseProfile = projection.reasoningBoards.length > 0 ? {
    kicker: `SEASON ${Number(caseCode.slice(1)) >= 37 ? "FOUR" : Number(caseCode.slice(1)) >= 25 ? "THREE" : "TWO"} / ${projection.case.presentation.boardMode?.toUpperCase() ?? "PROOF BOARD"}`,
    scene: `${projection.case.title} · 核心现场`,
    hint: "观察值、记录值与真实事件必须分别证明",
    left: "SCENE & SOURCES",
    middle: "DETERMINISTIC QUERIES",
    chain: projection.reasoningBoards[0]?.title ?? "多维证明链",
    placeholder: `例如：${projection.questionScaffolds[0]?.label ?? "这条记录的来源是什么？"}`,
  } : legacyProfile;
  const profile = golden ? { ...baseProfile, scene: golden.sceneLabel, hint: golden.sceneHint } : baseProfile;
  const navLabels = projection.case.presentation.mobileNavigation;
  useEffect(() => {
    const first = projection.reasoningBoards[0]?.id ?? "";
    setActiveBoardId((current) => projection.reasoningBoards.some((board) => board.id === current) ? current : first);
    setCollapsedBoardIds((current) => current.filter((id) => projection.reasoningBoards.some((board) => board.id === id)));
  }, [projection.reasoningBoards]);
  useEffect(() => { let active = true; void loadMastery(projection.case.id, projection).then((value) => { if (active) setMastery(value); }); return () => { active = false; }; }, [projection.case.id, projection.case.version, projection.case.contentHash]);
  useEffect(() => {
    if (!projection.solved) return;
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
    const stored = localStorage.getItem("black-soup-settings");
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as { muted?: boolean; ambient?: boolean; reducedMotion?: boolean; highContrast?: boolean; effectsVolume?: number; ambientVolume?: number };
      setMuted(Boolean(value.muted));
      setAmbient(Boolean(value.ambient));
      setReducedMotion(Boolean(value.reducedMotion));
      setHighContrast(Boolean(value.highContrast));
      if (typeof value.effectsVolume === "number") setEffectsVolume(value.effectsVolume);
      if (typeof value.ambientVolume === "number") setAmbientVolume(value.ambientVolume);
    } catch { /* Invalid preferences fall back to accessible defaults. */ }
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem("black-soup-settings");
    let previous: Record<string, unknown> = {};
    try { previous = stored ? JSON.parse(stored) as Record<string, unknown> : {}; } catch { /* Replace invalid preferences. */ }
    localStorage.setItem("black-soup-settings", JSON.stringify({ ...previous, muted, ambient, effectsVolume, ambientVolume, reducedMotion, highContrast }));
  }, [muted, ambient, effectsVolume, ambientVolume, reducedMotion, highContrast]);
  useEffect(() => {
    const audio = new AudioEngine(projection.case.id);
    audioRef.current = audio;
    setAudioSupported(AudioEngine.isSupported());
    const onVisibility = () => audio.setPageHidden(document.hidden);
    const onPageHide = () => audio.setPageHidden(true);
    const onPageShow = () => audio.setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [projection.case.id]);
  useEffect(() => {
    const audio = audioRef.current;
    audio?.setMuted(muted);
    audio?.setEffectsVolume(effectsVolume);
    audio?.setAmbientVolume(ambientVolume);
    audio?.toggleAmbient(ambient && !muted);
  }, [muted, ambient, effectsVolume, ambientVolume, layout]);
  useEffect(() => {
    const last = events.at(-1);
    if (last?.type === "question_answered") audioRef.current?.play("question");
    if (last?.type === "evidence_updated" || last?.type === "location_visited") audioRef.current?.play("inspect");
    if (last?.type === "theory_judged" && last.judgement !== "solved") audioRef.current?.play("contradiction");
    if (last?.type === "case_solved") audioRef.current?.play("solved");
    if (last?.type === "replay_ready") audioRef.current?.play("replay");
  }, [events]);
  useEffect(() => {
    if (projection.interpretation) {
      interpretationWasOpen.current = true;
      requestAnimationFrame(() => interpretationRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    } else if (interpretationWasOpen.current) {
      interpretationWasOpen.current = false;
      requestAnimationFrame(() => questionInputRef.current?.focus());
    }
  }, [projection.interpretation]);
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
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    dispatch({ type: "ask_text", rawText: question });
    setQuestion("");
  };
  const sceneLabel = profile.scene;
  const inspectedEvidenceCount = projection.evidence.filter((item) => !["available", "discovered", "dismissed"].includes(item.state)).length;
  const hasObservedLocation = projection.locations.some((location) => location.visited);
  const revealEvidence = projection.transcript.length > 0 || hasObservedLocation || inspectedEvidenceCount > 0 || projection.solved;
  const revealTheory = projection.transcript.length >= 2 || inspectedEvidenceCount >= 2 || Boolean(active?.eventIds.length) || projection.solved;
  const experienceStage = revealTheory ? "theory" : revealEvidence ? "investigation" : "opening";

  return (
    <main id="main-content" tabIndex={-1} className={styles.variant} data-layout={layout} data-experience-stage={experienceStage} data-golden-cadence={golden?.cadence} data-replay-tone={golden?.replayTone} data-evidence-mode={projection.case.presentation.evidenceVisualMode} data-high-contrast={highContrast || undefined} data-reduced-motion={reducedMotion || undefined} style={{ "--accent": projection.case.presentation.accent } as CSSProperties}>
      <header className={styles.topbar} inert={settingsOpen || undefined}>
        <Link prefetch={false} href="/" className={styles.back}>← 案件档案</Link>
        <div className={styles.title}><small>{profile.kicker}</small><h1>{projection.case.title}</h1></div>
        <div className={styles.meta}><div className={styles.metaActions}><FunGateTools report={report} onHint={markHintUsed} onExport={exportSession} /><button ref={settingsButtonRef} className={styles.settingsButton} onClick={() => setSettingsOpen(true)} aria-label="打开无障碍与声音设置">设置</button></div><span className={styles.runtimeStatus}>{online ? "OFFLINE READY" : "OFFLINE MODE"} · {saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "本地已保存"}</span>{projection.case.targetMinutes.min}–{projection.case.targetMinutes.max} MIN<br/><b>{projection.solved ? "CLOSED" : "INVESTIGATING"}</b></div>
      </header>
      {settingsOpen && <div className={styles.settingsBackdrop} role="presentation" onMouseDown={closeSettings}><section ref={settingsRef} className={styles.settingsPanel} role="dialog" aria-modal="true" aria-labelledby="variant-settings-title" onKeyDown={handleSettingsKeyDown} onMouseDown={(event) => event.stopPropagation()}><header><div><small>ACCESSIBILITY / AUDIO</small><h2 id="variant-settings-title">调查设置</h2></div><button onClick={closeSettings} aria-label="关闭设置">×</button></header><div className={styles.soundscapeProfile}><span>SOUNDSCAPE / {String(Number(projection.case.id.slice(1, 3))).padStart(2, "0")}</span><b>{soundscape.label}</b><small>{audioSupported ? "案件专属程序化音景；不包含解谜信息" : "当前浏览器无 Web Audio；已自动降级为静默模式"}</small><button disabled={!audioSupported || muted} onClick={() => audioRef.current?.play("question")}>试听反馈</button></div><label><span><b>静音</b><small>关闭环境音与反馈音，不影响推理</small></span><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} /></label><label><span><b>案件音景</b><small>失去页面焦点时自动暂停</small></span><input type="checkbox" checked={ambient} disabled={muted || !audioSupported} onChange={(event) => setAmbient(event.target.checked)} /></label><label className={styles.audioRange}><span><b>反馈音量</b></span><input aria-label="反馈音量" type="range" min="0" max="1" step=".05" value={effectsVolume} disabled={muted || !audioSupported} onChange={(event) => setEffectsVolume(Number(event.target.value))} /></label><label className={styles.audioRange}><span><b>环境音量</b></span><input aria-label="环境音量" type="range" min="0" max=".5" step=".025" value={ambientVolume} disabled={muted || !audioSupported} onChange={(event) => setAmbientVolume(Number(event.target.value))} /></label><label><span><b>减少动态</b><small>停用非必要的转场和滚动动画</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /></label><label><span><b>高对比</b><small>增强正文、边框与交互焦点</small></span><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /></label><HostRewriteControls settings={host.settings} status={host.status} message={host.message} onChange={host.setSettings} onClear={host.clearCache} /><div className={styles.localTools}><small>LOCAL DIAGNOSTICS · 仅保存聚合指标，不上传</small><label><span>允许本地记录</span><input type="checkbox" checked={diagnostics.recording} onChange={(event) => diagnostics.toggle(event.target.checked)} /></label><div><button onClick={() => void diagnostics.exportSessions("json")}>导出 JSON</button><button onClick={() => void diagnostics.exportSessions("csv")}>导出 CSV</button><button onClick={() => void diagnostics.clear()}>清空</button></div></div></section></div>}
      {restoreStatus === "incompatible" && <div className={styles.restoreNotice} role="status">旧存档与当前案件版本不兼容，已安全拒绝恢复；你现在看到的是一份新的调查。</div>}
      {restoreStatus === "corrupt" && <div className={styles.restoreNotice} role="status">本地存档损坏或不完整，已安全隔离；当前从新调查开始，可从档案页导入备份。</div>}
      <StorageRecovery issue={storageIssue} save={latestSave} onRetry={onRetrySave} />
      <nav className={styles.mobileTabs} aria-label="调查区域" inert={settingsOpen || undefined}>{navLabels.map((label, index) => { const target = (["scene", "questions", "theory"] as const)[index]; const locked = target === "theory" && !revealTheory; return <button key={label} aria-controls={`variant-${target}`} aria-pressed={panel === target} data-active={panel === target || undefined} disabled={locked} onClick={() => setPanel(target)}>{locked ? "待解锁" : label}</button>; })}</nav>
      <div className={styles.board} inert={settingsOpen || undefined}>
        <section id="variant-scene" className={`${styles.left} ${panel === "scene" ? styles.mobileVisible : ""}`}>
          <div className={styles.sectionTag}>01 / {profile.left}</div>
          <div className={styles.scene}><picture><source media="(max-width: 850px)" srcSet={sceneMobile} /><img src={sceneDesktop} alt={sceneLabel} width={960} height={620} fetchPriority="high" /></picture><button className={styles.soundscapeChip} aria-pressed={ambient} disabled={!audioSupported || muted} onClick={() => setAmbient((value) => !value)}><span aria-hidden="true">◉</span>{audioSupported ? ambient ? "音景已启用" : soundscape.label : "静默模式"}</button><div className={styles.sceneLabel}>{sceneLabel}<small>{profile.hint}</small></div></div>
          <p className={styles.surface}>{projection.case.surface}</p>
          <div className={styles.locations}>{projection.locations.map((location) => <button key={location.id} disabled={location.visited} onClick={() => dispatch({ type: "visit_location", locationId: location.id })}><small>{location.visited ? "CHECKED" : "CHECK"}</small>{location.label}</button>)}</div>
          {revealEvidence ? <EvidenceInspector evidence={projection.evidence} activeTheoryId={projection.activeTheoryId} linkedEvidenceIds={active?.evidenceIds ?? []} caseCode={caseCode} dispatch={dispatch} compact interactionMode={golden?.evidenceBehavior} interactionLabel={golden?.evidenceAction} /> : <div className={styles.stageCue}><small>FIRST TRACE / SCENE</small><b>先固定现场，再打开档案</b><p>检查一个位置，或提出第一条可验证问题；证据架会按调查进度展开。</p><button onClick={() => setPanel("questions")}>前往提问 →</button></div>}
        </section>
        <section id="variant-questions" className={`${styles.middle} ${panel === "questions" ? styles.mobileVisible : ""}`}>
          <div className={styles.sectionTag}>02 / {profile.middle}</div>
          <div className={styles.signal} role="status" aria-live="polite"><span>ARCHIVIST</span><b>{lastMessage(events)}</b></div>
          <div className={styles.transcript} aria-live="polite" tabIndex={0} aria-label="主持问答记录，可滚动">{projection.transcript.length === 0 ? <div className={styles.firstRun}><small>ONE FACT AT A TIME</small><p>第一问只需要固定一个事实：对象、动作、时间或来源。歧义和无法识别都不会改变案件状态。</p></div> : projection.transcript.map((entry) => <article key={entry.id} data-transcript-entry={entry.id}><small>YOU · {entry.repeated ? "REPEATED" : "QUERY"}</small><p>{entry.rawQuestion}</p><div data-code={entry.answerCode}><b>{ANSWERS[entry.answerCode]}</b><span>{entry.answerText}{host.rewrites[entry.id] && <em className={styles.hostRewrite}><i>本地改写主持</i>{host.rewrites[entry.id].text}</em>}</span></div></article>)}</div>
          {revealTheory && golden && <aside className={styles.insight} role="status"><small>CAUSAL SHIFT / 顿悟节点</small><p>{golden.insight}</p></aside>}
          {projection.interpretation && <div ref={interpretationRef} className={styles.interpretation} role="group" aria-label="确认问题解释" aria-live="polite"><small>选择你要验证的事实</small><strong>“{projection.interpretation.rawText}”</strong>{projection.interpretation.candidates.map((candidate) => <button key={candidate.queryId} onClick={() => dispatch({ type: "confirm_interpretation", queryId: candidate.queryId })}>{candidate.label}<span>{candidate.predicate}</span></button>)}</div>}
          <form className={styles.questionForm} onSubmit={submitQuestion}><label htmlFor="variant-question">写下调查问题</label><div><input ref={questionInputRef} id="variant-question" name="investigation-question" autoComplete="off" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={profile.placeholder} /><button disabled={!question.trim()}>验证</button></div></form>
          <div className={styles.prompts}>{projection.questionScaffolds.slice(0, projection.transcript.length === 0 ? 1 : 4).map((candidate) => <button key={candidate.queryId} onClick={() => dispatch({ type: "ask_text", rawText: candidate.label })}>{candidate.label}</button>)}</div>
          <button className={styles.undoQuestion} disabled={projection.transcript.length === 0} onClick={() => dispatch({ type: "undo_last_question" })}>撤销上一轮提问</button>
        </section>
        {revealTheory && <section id="variant-theory" className={`${styles.right} ${panel === "theory" ? styles.mobileVisible : ""}`}>
          <div className={styles.sectionTag}>03 / {actionLabel(layout, "PROOF BOARD")}</div>
          {projection.chapters.length > 0 && <div className={styles.chapters} aria-label="调查章节">{projection.chapters.map((chapter, index) => <span key={chapter.id} data-unlocked={chapter.unlocked || undefined}><i>{index + 1}</i>{chapter.title}<b>{chapter.unlocked ? "OPEN" : "LOCKED"}</b></span>)}</div>}
          <div className={styles.theoryTabs}>{projection.theoryDrafts.map((draft) => <button key={draft.id} data-active={draft.id === projection.activeTheoryId || undefined} onClick={() => dispatch({ type: "select_theory", theoryId: draft.id })}>{draft.title}<small>{draft.eventIds.length} events</small></button>)}</div>
          {active && <>
            <label className="srOnly" htmlFor="variant-hypothesis">当前解释路径</label><select id="variant-hypothesis" className={styles.hypothesis} value={active.hypothesisId} onChange={(event) => dispatch({ type: "set_theory_hypothesis", theoryId: active.id, hypothesisId: event.target.value })}>{projection.theoryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            {projection.reasoningBoards.length > 0 && <div className={styles.boardTabs} role="tablist" aria-label="选择推理板">{projection.reasoningBoards.map((board) => { const placed = board.slots.filter((slot) => slot.itemId).length; const complete = placed === board.slots.length; return <button key={board.id} role="tab" aria-selected={activeBoardId === board.id} data-active={activeBoardId === board.id || undefined} onClick={() => { setActiveBoardId(board.id); setCollapsedBoardIds((current) => current.filter((id) => id !== board.id)); }}>{board.title}<small>{placed}/{board.slots.length} {complete ? "· 已闭合" : "· 待补"}</small></button>; })}</div>}
            {projection.reasoningBoards.find((board) => board.id === activeBoardId) && <ReasoningBoard board={projection.reasoningBoards.find((board) => board.id === activeBoardId)!} dispatch={dispatch} />}
            {projection.reasoningBoards.length === 0 ? <LegacyTheoryWorkbench caseId={projection.case.id} draft={active} events={projection.eventOptions} dispatch={dispatch} /> : <><div className={styles.chain}><header><span>{profile.chain}</span><small>{active.evidenceIds.length} linked</small></header>{active.eventIds.length === 0 ? <p className={styles.empty}>把已知事件放进这条证明链。</p> : <ol>{active.eventIds.map((id, index) => { const item = eventMap.get(id); return item ? <li key={id}><i>{index + 1}</i><time>{item.timeLabel}</time><b>{item.label}</b><nav><button disabled={index === 0} onClick={() => dispatch({ type: "move_theory_event", theoryId: active.id, eventId: id, direction: -1 })} aria-label="事件上移">↑</button><button disabled={index === active.eventIds.length - 1} onClick={() => dispatch({ type: "move_theory_event", theoryId: active.id, eventId: id, direction: 1 })} aria-label="事件下移">↓</button><button onClick={() => dispatch({ type: "remove_theory_event", theoryId: active.id, eventId: id })} aria-label="移除事件">×</button></nav></li> : null; })}</ol>}</div><div className={styles.eventBank}>{projection.eventOptions.map((item) => <button key={item.id} disabled={active.eventIds.includes(item.id)} onClick={() => dispatch({ type: "upsert_theory_event", theoryId: active.id, eventId: item.id })}><time>{item.timeLabel}</time>{item.label}</button>)}</div></>}
            <div className={styles.proofCount}>证据关联：<b>{active.evidenceIds.length}</b> / {projection.evidence.length}</div>
            <label className={styles.motive}>驱动条件<select value={active.motiveKey ?? ""} onChange={(event) => dispatch({ type: "set_theory_motive", theoryId: active.id, motiveKey: event.target.value || undefined })}><option value="">尚未证明</option>{activeTheoryOption?.motiveOptions.map((motive) => <option key={motive.id} value={motive.id}>{motive.label}</option>)}</select></label>
            <button className={styles.submit} disabled={!projection.canSubmit || projection.solved} onClick={() => dispatch({ type: "submit_theory", theoryId: active.id })}>{projection.solved ? "CASE CLOSED" : "提交证明"}</button>
          </>}
          {projection.solved && <div className={styles.replay}><b>PROOF REPLAY READY</b>{projection.replay.length === 0 ? <button onClick={() => dispatch({ type: "request_proof_replay" })}>生成回放</button> : projection.replay.map((beat) => <p key={beat.id}><time>{beat.timeLabel}</time><span>{beat.caption}<small>证据：{beat.evidenceTitles.join(" / ") || "已验证事件链"}</small></span></p>)}{projection.debrief && <div className={styles.debrief}><span><b>{projection.debrief.proofCompleteness}%</b>证明完整</span><span><b>{projection.debrief.questionCount}</b>次提问</span><span><b>{projection.debrief.repeatedQuestionCount}</b>次重复</span></div>}{projection.replayChallenges.length > 0 && <div className={styles.challenges}><small>REPLAY CHALLENGES · {mastery ? (challengeRotation(mastery).nextChallenge === "complete" ? "MASTERED" : `下一项：${challengeRotation(mastery).nextChallenge}`) : "本机记录中"}</small>{projection.replayChallenges.map((challenge) => <button key={challenge.mode} onClick={() => dispatch({ type: "set_replay_mode", mode: challenge.mode })}>{challenge.mode === "limited-questions" ? `限定 ${challenge.questionLimit ?? 12} 问` : challenge.mode === "minimal-proof" ? "最小证据证明" : "无快捷问题"}</button>)}</div>}</div>}
        </section>}
      </div>
    </main>
  );
}
