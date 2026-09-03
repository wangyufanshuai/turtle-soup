"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { CSSProperties, Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { challengeRotation, emptyMasteryRecord, recordMasterySolve, type CaseMasteryRecord, type GameCommand, type GameEvent, type PlayerProjection, type QuestionRoutingOffer, type SaveEnvelope } from "@turtle-soup/mystery-core";
import type { RestoreStatus } from "@/lib/worker-protocol";
import { useHostRewrite } from "@/lib/use-host-rewrite";
import { useQuestionRouter } from "@/lib/use-question-router";
import { useFunGateSession } from "@/lib/use-fun-gate-session";
import { useLocalDiagnostics } from "@/lib/use-local-diagnostics";
import { loadPlayerSummary, savePlayerSummary } from "@/lib/player-summary-store";
import { downloadExperienceIssues, type ExperienceIssueRecord } from "@/lib/experience-issue-log";
import { deriveProofReadiness, hasExaminedEvidence } from "@/lib/proof-readiness";
import { reasoningBoardUi } from "@/lib/reasoning-board-ui";
import { loadMastery, saveMastery } from "@/lib/mastery-store";
import { StorageRecovery } from "./storage-recovery";
import { AiInterpretationStrip } from "./ai-interpretation-strip";
import { FunGateTools } from "./fun-gate-tools";
import styles from "./investigation-shell.module.css";

type Workspace = "scene" | "questions" | "evidence" | "theory";
type TheoryStep = "claim" | "board" | "chain" | "proof";
type SettingsSection = "experience" | "ai" | "data";
const DeferredPanel = () => <div className={styles.deferredPanel} role="status" aria-label="正在准备调查工具"><span aria-hidden="true" /><b>正在准备这一区域…</b><small>你的调查状态不会改变</small></div>;
const EvidenceInspector = dynamic(() => import("./evidence-inspector").then((module) => module.EvidenceInspector), { loading: DeferredPanel });
const ReasoningBoard = dynamic(() => import("./reasoning-board").then((module) => module.ReasoningBoard), { loading: DeferredPanel });
const LegacyTheoryWorkbench = dynamic(() => import("./legacy-theory-workbench").then((module) => module.LegacyTheoryWorkbench), { loading: DeferredPanel });
const HostRewriteControls = dynamic(() => import("./host-rewrite-controls").then((module) => module.HostRewriteControls), { loading: DeferredPanel });
const QuestionRouterControls = dynamic(() => import("./question-router-controls").then((module) => module.QuestionRouterControls), { loading: DeferredPanel });
const TABS: Array<{ id: Workspace; label: string; help: string; shortcut: string }> = [
  { id: "scene", label: "现场", help: "查看异常与位置", shortcut: "1" }, { id: "questions", label: "提问", help: "验证具体事实", shortcut: "2" },
  { id: "evidence", label: "证据", help: "检查与取舍", shortcut: "3" }, { id: "theory", label: "推断", help: "组织并证明", shortcut: "4" },
];
const WORKSPACES = new Set<Workspace>(TABS.map((tab) => tab.id));
const ANSWERS: Record<string, string> = { yes: "是", no: "不是", partial: "部分相关", unknown: "信息不足", irrelevant: "与真相无关", invalid_premise: "前提不成立", unanswerable: "无法判断", unrecognized: "无法识别" };
const GAPS: Record<string, string> = { time: "时间关系", space: "空间关系", source: "来源链", identity: "身份关系", measurement: "测量模型", "state-transition": "状态转换", "alternative-exclusion": "替代路径排除" };
function boardTitle(title: string, mode: string) { return title.replace(new RegExp(`\\s*[·•]\\s*${mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "iu"), ""); }

function lastGap(events: GameEvent[]) { for (let i = events.length - 1; i >= 0; i -= 1) { const e = events[i]; if (e.type === "theory_judged" && e.judgement !== "solved" && e.proofFailureCategory) return e.proofFailureCategory; } return undefined; }
function statusText(events: GameEvent[], restore?: RestoreStatus) {
  if (restore === "incompatible") return "存档属于其他案件或内容版本，已安全拒绝恢复。";
  if (restore === "corrupt") return "本地存档不完整，已隔离并开始新的调查。";
  const e = events.at(-1); if (!e || e.type === "case_started") return "先观察异常，再问一个可以被证实或否定的问题。";
  if (e.type === "question_answered") return e.entry.repeated ? "这个事实已经验证过，没有额外惩罚。" : "事实回答已经加入调查本。";
  if (e.type === "interpretation_required") return "这个问法有多种理解，请确认你真正想验证的事实。";
  if (e.type === "question_rejected") return "这句话还无法安全对应到案件事实；原问题已经保留。";
  if (e.type === "question_undone") return "上一轮问题已撤销，不会把你锁进错误路线。";
  if (e.type === "evidence_updated") return "证据状态已更新；可以继续检查，或把它接入当前证明。";
  if (e.type === "reasoning_board_updated") return "推理板已更新；提交时会检查全部结构。";
  if (e.type === "chapter_unlocked") return "新的调查阶段已解锁；可以继续查看公开记录。";
  if (e.type === "replay_mode_started") return "重玩挑战已开始，当前调查已安全重置。";
  if (e.type === "location_visited") return "现场位置已记录；可以继续检查其他公开位置。";
  if (e.type === "theory_judged" || e.type === "command_rejected") return e.message;
  if (e.type === "case_solved") return "证据链闭合。你已经证明了事件如何发生。";
  if (e.type === "replay_ready") return "真相回放已经生成。";
  return "调查记录已更新。";
}

export function InvestigationShell(props: { projection: PlayerProjection; events: GameEvent[]; restoreStatus?: RestoreStatus; saveState: "idle" | "saving" | "saved" | "error"; online: boolean; latestSave?: SaveEnvelope; storageIssue?: string; onRetrySave: () => void; dispatch: (command: GameCommand) => void; prepareQuestionRouting: (raw: string) => Promise<QuestionRoutingOffer> }) {
  const { projection, events, dispatch, prepareQuestionRouting } = props;
  const [workspace, setWorkspace] = useState<Workspace>("scene"), [question, setQuestion] = useState(""), [settingsOpen, setSettingsOpen] = useState(false), [settingsSection, setSettingsSection] = useState<SettingsSection>("experience");
  const [summary, setSummary] = useState(""), [activeBoardId, setActiveBoardId] = useState(projection.reasoningBoards[0]?.id ?? ""), [theoryStep, setTheoryStep] = useState<TheoryStep>("claim");
  const [uiStateReady, setUiStateReady] = useState(false), [questionDraftReady, setQuestionDraftReady] = useState(false);
  const [muted, setMuted] = useState(false), [reducedMotion, setReducedMotion] = useState(false), [highContrast, setHighContrast] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [issueRecording, setIssueRecording] = useState(false), [issues, setIssues] = useState<ExperienceIssueRecord[]>([]);
  const [mastery, setMastery] = useState<CaseMasteryRecord>();
  const questionRef = useRef<HTMLInputElement>(null), settingsTriggerRef = useRef<HTMLButtonElement>(null), settingsReturnFocusRef = useRef<HTMLElement | null>(null), routedEventRef = useRef(""), lastAnsweredRef = useRef(""), questionDraftRef = useRef(""), submittedQuestionRef = useRef("");
  const masteryRecordedRef = useRef("");
  const host = useHostRewrite(projection), router = useQuestionRouter(projection, prepareQuestionRouting), funGate = useFunGateSession(projection.case.id, events), diagnostics = useLocalDiagnostics(projection, events);
  const active = projection.theoryDrafts.find((d) => d.id === projection.activeTheoryId) ?? projection.theoryDrafts[0];
  const theoryOption = projection.theoryOptions.find((o) => o.id === active.hypothesisId);
  const activeBoard = projection.reasoningBoards.find((b) => b.id === activeBoardId) ?? projection.reasoningBoards[0];
  const code = projection.case.id.match(/^(c\d+)/)?.[1] ?? "c01", gap = lastGap(events);
  const sceneDesktop = projection.case.presentation.sceneAsset, sceneMobile = projection.case.presentation.sceneAssetMobile ?? sceneDesktop;
  const availableEvidence = projection.evidence.filter((e) => e.state !== "available");

  useEffect(() => setSummary(loadPlayerSummary(projection.case.id, projection.case.contentHash)), [projection.case.id, projection.case.contentHash]);
  useEffect(() => {
    setUiStateReady(false);
    setQuestionDraftReady(false);
    setWorkspace("scene");
    setTheoryStep("claim");
    try {
      const raw = localStorage.getItem(`black-soup:case-ui:v24:${projection.case.id}`) ?? localStorage.getItem(`black-soup:case-ui:v23:${projection.case.id}`) ?? localStorage.getItem(`black-soup:case-ui:v22:${projection.case.id}`) ?? localStorage.getItem(`black-soup:case-ui:v21:${projection.case.id}`);
      const stored = JSON.parse(raw ?? "null") as { workspace?: Workspace; theoryStep?: TheoryStep; activeBoardId?: string } | null;
      const hashWorkspace = window.location.hash.replace(/^#/, "") as Workspace;
      if (WORKSPACES.has(hashWorkspace)) setWorkspace(hashWorkspace);
      else if (stored?.workspace && WORKSPACES.has(stored.workspace)) setWorkspace(stored.workspace);
      if (stored?.theoryStep && ["claim", "board", "chain", "proof"].includes(stored.theoryStep)) setTheoryStep(stored.theoryStep);
      if (stored?.activeBoardId && projection.reasoningBoards.some((board) => board.id === stored.activeBoardId)) setActiveBoardId(stored.activeBoardId);
      const draft = sessionStorage.getItem(`black-soup:question-draft:v24:${projection.case.id}`) ?? sessionStorage.getItem(`black-soup:question-draft:v23:${projection.case.id}`) ?? sessionStorage.getItem(`black-soup:question-draft:v22:${projection.case.id}`) ?? "";
      setQuestion(draft.slice(0, 1000)); questionDraftRef.current = draft.slice(0, 1000);
    } catch { /* UI continuation is optional */ } finally { setUiStateReady(true); setQuestionDraftReady(true); }
  }, [projection.case.id]);
  useEffect(() => {
    if (!uiStateReady) return;
    const nextHash = `#${workspace}`;
    if (window.location.hash !== nextHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }, [uiStateReady, workspace]);
  useEffect(() => { if (!uiStateReady) return; try { localStorage.setItem(`black-soup:case-ui:v24:${projection.case.id}`, JSON.stringify({ workspace, theoryStep, activeBoardId })); } catch { /* UI continuation is optional */ } }, [activeBoardId, projection.case.id, theoryStep, uiStateReady, workspace]);
  useEffect(() => { if (!questionDraftReady) return; try { sessionStorage.setItem(`black-soup:question-draft:v24:${projection.case.id}`, question); } catch { /* session draft continuation is optional */ } }, [projection.case.id, question, questionDraftReady]);
  useEffect(() => { try { const stored = JSON.parse(localStorage.getItem("black-soup:investigation-settings:v19") ?? "null") as { muted?: boolean; reducedMotion?: boolean; highContrast?: boolean } | null; if (stored) { setMuted(Boolean(stored.muted)); setReducedMotion(Boolean(stored.reducedMotion)); setHighContrast(Boolean(stored.highContrast)); } else setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* accessibility settings remain usable without storage */ } finally { setPreferencesReady(true); } }, []);
  useEffect(() => { if (!preferencesReady) return; try { localStorage.setItem("black-soup:investigation-settings:v19", JSON.stringify({ muted, reducedMotion, highContrast })); } catch { /* optional preference */ } }, [preferencesReady, muted, reducedMotion, highContrast]);
  useEffect(() => { let active = true; void loadMastery(projection.case.id, projection).then((record) => { if (active) setMastery(record ?? emptyMasteryRecord(projection.case)); }); return () => { active = false; }; }, [projection.case.id, projection.case.version, projection.case.contentHash]);
  useEffect(() => {
    if (!projection.solved) { masteryRecordedRef.current = ""; return; }
    const solveKey = `${projection.case.id}:${projection.case.contentHash}:${projection.replayMode}`;
    if (masteryRecordedRef.current === solveKey) return;
    masteryRecordedRef.current = solveKey;
    let active = true;
    void loadMastery(projection.case.id, projection).then(async (stored) => {
      const next = recordMasterySolve(stored ?? emptyMasteryRecord(projection.case), projection);
      await saveMastery(next);
      if (active) setMastery(next);
    });
    return () => { active = false; };
  }, [projection.solved, projection.replayMode, projection.case.id, projection.case.version, projection.case.contentHash, projection.debrief]);
  useEffect(() => { const timer = setTimeout(() => savePlayerSummary(projection.case.id, projection.case.contentHash, summary), 250); return () => clearTimeout(timer); }, [projection.case.id, projection.case.contentHash, summary]);
  useEffect(() => {
    if (availableEvidence.length === 0) return;
    const timer = window.setTimeout(() => { void import("./evidence-inspector"); }, 120);
    return () => window.clearTimeout(timer);
  }, [availableEvidence.length, projection.case.id]);
  useEffect(() => {
    if (projection.transcript.length === 0 && !projection.solved) return;
    const timer = window.setTimeout(() => { void import("./legacy-theory-workbench"); if (projection.reasoningBoards.length > 0) void import("./reasoning-board"); }, 180);
    return () => window.clearTimeout(timer);
  }, [projection.case.id, projection.reasoningBoards.length, projection.solved, projection.transcript.length]);
  useEffect(() => setActiveBoardId((current) => projection.reasoningBoards.some((b) => b.id === current) ? current : projection.reasoningBoards[0]?.id ?? ""), [projection.reasoningBoards]);
  useEffect(() => { if (theoryStep === "board" && projection.reasoningBoards.length === 0) setTheoryStep("chain"); }, [projection.reasoningBoards.length, theoryStep]);
  useEffect(() => { if (projection.solved) setTheoryStep("proof"); }, [projection.case.id, projection.solved]);
  useEffect(() => {
    const e = events.at(-1); if (!e) return; if (e.type === "question_answered") lastAnsweredRef.current = e.entry.rawQuestion;
    if (e.type === "question_answered" && submittedQuestionRef.current === e.entry.rawQuestion && questionDraftRef.current === e.entry.rawQuestion) { setQuestion(""); questionDraftRef.current = ""; submittedQuestionRef.current = ""; }
    const interpretation = e.type === "question_rejected" || e.type === "interpretation_required" ? e.interpretation : undefined;
    if (interpretation) { const key = `${e.type}:${interpretation.rawText}`; if (projection.replayMode !== "no-scaffolds" && routedEventRef.current !== key) { routedEventRef.current = key; void router.request(interpretation.rawText); } if (issueRecording) setIssues((list) => list.some((x) => x.id === key) ? list : [...list, { id: key, at: new Date().toISOString(), caseId: projection.case.id, rawQuestion: interpretation.rawText, path: e.type === "question_rejected" ? "unrecognized" : "ambiguous", aiRecovered: false, confirmed: false }]); }
    if (e.type === "question_undone" && issueRecording && lastAnsweredRef.current) setIssues((list) => [...list, { id: `undo:${Date.now()}`, at: new Date().toISOString(), caseId: projection.case.id, rawQuestion: lastAnsweredRef.current, path: "undone", aiRecovered: false, confirmed: false }]);
  }, [events, issueRecording, projection.case.id, projection.replayMode, router.request]);
  useEffect(() => { if (router.errorCode) diagnostics.recordError(`ai_${router.errorCode}`); }, [router.errorCode, diagnostics.recordError]);

  const send = (command: GameCommand) => { dispatch(command); if (command.type === "ask_resolved_text" && issueRecording) setIssues((list) => list.map((x) => x.rawQuestion === command.rawText ? { ...x, aiRecovered: true, confirmed: true } : x)); };
  const open = useCallback((next: Workspace, forceQuestionFocus = false) => {
    setWorkspace(next);
    if (next !== "questions") return;
    const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (forceQuestionFocus || precisePointer) requestAnimationFrame(() => questionRef.current?.focus({ preventScroll: true }));
  }, []);
  const updateQuestion = useCallback((value: string) => { questionDraftRef.current = value; setQuestion(value); }, []);
  useEffect(() => {
    const shortcuts: Record<string, Workspace> = { "1": "scene", "2": "questions", "3": "evidence", "4": "theory" };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return;
      if (event.key === "/") { event.preventDefault(); open("questions", true); return; }
      const next = shortcuts[event.key]; if (!next) return;
      event.preventDefault(); open(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const closeSettings = () => {
    setSettingsOpen(false);
    const returnTarget = settingsReturnFocusRef.current ?? settingsTriggerRef.current;
    window.setTimeout(() => requestAnimationFrame(() => returnTarget?.focus({ preventScroll: true })), 40);
  };
  const openSettings = (section: SettingsSection = "experience", returnTarget?: HTMLElement | null) => { settingsReturnFocusRef.current = returnTarget ?? settingsTriggerRef.current; setSettingsSection(section); setSettingsOpen(true); };
  const ask = (event: FormEvent) => { event.preventDefault(); const raw = question.trim(); if (!raw) return; submittedQuestionRef.current = raw; questionDraftRef.current = raw; send({ type: "ask_text", rawText: raw }); };

  return <main id="main-content" tabIndex={-1} className={styles.game} data-high-contrast={highContrast || undefined} data-reduced-motion={reducedMotion || undefined} style={{ "--case-accent": projection.case.presentation.accent } as CSSProperties}>
    <header className={styles.topbar} inert={settingsOpen || undefined}><Link href="/" prefetch={false}>← 全部案件</Link><div><small>THE BLACK SOUP · {code.toUpperCase()}</small><h1>{projection.case.title}</h1></div><nav><span>{props.online ? "离线可玩" : "离线模式"} · {props.saveState === "saving" ? "保存中" : props.saveState === "error" ? "保存失败" : "已保存"}</span><button ref={settingsTriggerRef} onClick={(event) => openSettings("experience", event.currentTarget)}>设置</button></nav></header>
    <StorageRecovery issue={props.storageIssue} save={props.latestSave} onRetry={props.onRetrySave} />
    <NextStepCue projection={projection} active={active} workspace={workspace} events={events} restoreStatus={props.restoreStatus} open={open} />
    <nav className={styles.tabs} aria-label="调查工作区" inert={settingsOpen || undefined}>{TABS.map((tab) => <button key={tab.id} aria-keyshortcuts={tab.shortcut} aria-pressed={workspace === tab.id} onClick={() => open(tab.id)}><b>{tab.label}<kbd>{tab.shortcut}</kbd></b><small>{tab.help}</small></button>)}</nav>
    <div className={styles.layout} inert={settingsOpen || undefined}><section className={styles.workarea}>
      {workspace === "scene" && <SceneWorkspace projection={projection} sceneDesktop={sceneDesktop} sceneMobile={sceneMobile} send={send} open={open} muted={muted} />}
      {workspace === "questions" && <QuestionWorkspace projection={projection} activeQuestion={question} setQuestion={updateQuestion} questionRef={questionRef} ask={ask} send={send} open={open} openAiSettings={(trigger) => openSettings("ai", trigger)} host={host} router={router} />}
      {workspace === "evidence" && <EvidenceWorkspace projection={projection} active={active} code={code} send={send} open={open} availableCount={availableEvidence.length} onContinueToProof={() => { setTheoryStep("proof"); open("theory"); }} />}
      {workspace === "theory" && <TheoryWorkspace projection={projection} active={active} theoryOption={theoryOption} activeBoard={activeBoard} setActiveBoardId={setActiveBoardId} gap={gap} summary={summary} setSummary={setSummary} mastery={mastery} theoryStep={theoryStep} setTheoryStep={setTheoryStep} send={send} />}
    </section><Notebook projection={projection} summary={summary} setSummary={setSummary} workspace={workspace} open={open} /></div>
    {settingsOpen && <SettingsPanel initialSection={settingsSection} onClose={closeSettings} muted={muted} setMuted={setMuted} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} highContrast={highContrast} setHighContrast={setHighContrast} router={router} host={host} diagnostics={diagnostics} issueRecording={issueRecording} setIssueRecording={setIssueRecording} issues={issues} setIssues={setIssues} funGate={funGate} />}
  </main>;
}

function NextStepCue({ projection, active, workspace, events, restoreStatus, open }: { projection: PlayerProjection; active: PlayerProjection["theoryDrafts"][number]; workspace: Workspace; events: GameEvent[]; restoreStatus?: RestoreStatus; open: (workspace: Workspace) => void }) {
  const asked = projection.transcript.length > 0;
  const inspected = hasExaminedEvidence(projection);
  const structured = active.eventIds.length > 0 || active.evidenceIds.length > 0 || projection.reasoningBoards.some((board) => board.slots.some((slot) => slot.itemId));
  const next: { workspace: Workspace; label: string; detail: string } = projection.solved
    ? { workspace: "theory", label: "查看我的解释与证据回放", detail: "你的证明已经成立，可以对照自己写下的真相。" }
    : !asked
      ? { workspace: "questions", label: "先问一个可验证的问题", detail: "不必猜答案；先确认人物、动作、时间或来源。" }
      : !inspected
        ? { workspace: "evidence", label: "接着检查一件证据", detail: "找出能支持或反驳刚才回答的材料。" }
        : !structured
          ? { workspace: "theory", label: "开始组织你的解释", detail: "用自己的话总结，再把事件和证据放进证明。" }
          : { workspace: "theory", label: "继续补全并提交证明", detail: projection.canSubmit ? "当前结构已可提交；错误不会让调查不可逆。" : "先补齐事件、证据或推理板中的空位。" };
  const latest = projection.transcript.at(-1);
  const latestEvent = events.at(-1);
  const showFeedback = projection.solved || restoreStatus === "incompatible" || restoreStatus === "corrupt" || Boolean(latestEvent && latestEvent.type !== "case_started");
  const feedback = projection.solved ? "证据链闭合。你已经证明了事件如何发生。" : statusText(events, restoreStatus);
  return <section className={styles.nextCue} aria-label="调查进度">
    <ol><li data-done={asked || undefined}>1 问事实</li><li data-done={inspected || undefined}>2 查证据</li><li data-done={structured || projection.solved || undefined}>3 做证明</li></ol>
    <div className={styles.nextCueCopy}><b>{next.label}</b><span>{next.detail}</span>{latest && !projection.solved && <small>最近验证：{latest.interpretedAs}</small>}</div>
    {workspace === next.workspace ? <span className={styles.currentCue}>当前区域</span> : <button type="button" onClick={() => open(next.workspace)}>前往</button>}
    {showFeedback && <p className={styles.nextCueStatus} role="status"><b>刚刚发生</b><span>{feedback}</span></p>}
  </section>;
}

function SceneWorkspace({ projection, sceneDesktop, sceneMobile, send, open, muted }: { projection: PlayerProjection; sceneDesktop: string; sceneMobile: string; send: (c: GameCommand) => void; open: (w: Workspace) => void; muted: boolean }) {
  return <div className={styles.sceneWorkspace}><div className={styles.premise}><small>案件异常 · 先读这一句</small><p>{projection.case.surface}</p><span>现场图帮助建立空间印象；所有必要信息也会以文字和证据给出。</span></div><div className={styles.scene}><picture><source media="(max-width:760px)" srcSet={sceneMobile} /><img src={sceneDesktop} alt={`${projection.case.title}的公开现场；必要线索同时以文字给出`} width={960} height={620} fetchPriority="high" /></picture><span>{muted ? "静音" : "声音仅用于气氛"}</span></div><section className={styles.locations}><h2>可以检查</h2>{projection.locations.length ? projection.locations.map((location) => <button key={location.id} disabled={location.visited} onClick={() => send({ type: "visit_location", locationId: location.id })}><b>{location.label}</b><span>{location.visited ? "已经检查" : "检查这里"}</span></button>) : <p>从提问开始，新的检查位置会随公开事实出现。</p>}</section><div className={styles.nextActions}><button onClick={() => open("questions")}>问一个事实</button><button onClick={() => open("evidence")}>查看证据</button></div></div>;
}

function QuestionWorkspace({ projection, activeQuestion, setQuestion, questionRef, ask, send, open, openAiSettings, host, router }: { projection: PlayerProjection; activeQuestion: string; setQuestion: (v: string) => void; questionRef: RefObject<HTMLInputElement | null>; ask: (e: FormEvent) => void; send: (c: GameCommand) => void; open: (workspace: Workspace) => void; openAiSettings: (trigger: HTMLElement) => void; host: ReturnType<typeof useHostRewrite>; router: ReturnType<typeof useQuestionRouter> }) {
  const useStarter = (label: string) => { setQuestion(label); requestAnimationFrame(() => questionRef.current?.focus({ preventScroll: true })); };
  const starters = projection.questionScaffolds.slice(0, 3);
  const latest = projection.transcript.at(-1);
  const questionLimit = projection.replayMode === "limited-questions" ? projection.replayChallenges.find((challenge) => challenge.mode === "limited-questions")?.questionLimit ?? 12 : undefined;
  const questionCountLabel = questionLimit ? `${projection.transcript.length}/${questionLimit} 次有效提问` : `${projection.transcript.length} 次有效提问`;
  return <div className={styles.questionWorkspace}>
    <header className={styles.workspaceHeading}><div><small>问一个事实</small><h2>系统只回答案件能够验证的内容</h2></div><span>{questionCountLabel}</span></header>
    <form className={styles.ask} onSubmit={ask}><label htmlFor="investigation-question">你的问题</label><div><input ref={questionRef} id="investigation-question" name="investigation-question" value={activeQuestion} onChange={(e) => setQuestion(e.target.value)} placeholder="例如：这扇门会自动上锁吗？" autoComplete="off" maxLength={1000} /><button disabled={!activeQuestion.trim()}>验证</button></div><p className={styles.questionSafety}>Enter 验证 · 无法识别或歧义不会计入提问次数 · 按 / 随时回到这里</p></form>
    <AiInterpretationStrip offer={router.offer} route={router.route} status={router.status} message={router.message} latency={router.latency} dispatch={send} onCancel={router.cancel} onManual={useStarter} onConfigure={openAiSettings} />
    {projection.interpretation && <div className={styles.interpretation} role="group" aria-label="选择问题解释"><small>你的原话：{projection.interpretation.rawText}</small>{projection.interpretation.candidates.slice(0, 3).map((candidate) => <button key={candidate.queryId} onClick={() => send({ type: "confirm_interpretation", queryId: candidate.queryId })}><b>{candidate.label}</b><span>{candidate.target} · {candidate.predicate}</span></button>)}</div>}
    {latest && <section className={styles.answerNext} aria-label="回答后的下一步"><div><small>刚刚验证</small><b>{latest.interpretedAs}</b><span>{latest.repeated ? "这条事实已经验证过；可以换一个角度继续。" : "回答已写入调查本。现在把它和一件材料对照，或继续问另一个具体关系。"}</span></div><div><button type="button" onClick={() => open("evidence")}>检查对应证据</button><button type="button" onClick={() => { questionRef.current?.focus({ preventScroll: true }); }}>继续提问</button></div></section>}
    {projection.transcript.length === 0 && starters.length > 0 && <section className={styles.quickStarts} aria-label="第一问示例"><header><small>不知道从哪问？</small><b>先验证一个公开前提</b></header><div>{starters.map((candidate) => <button type="button" key={candidate.queryId} onClick={() => useStarter(candidate.label)}><span>{candidate.target}</span><b>{candidate.label}</b></button>)}</div><p>按钮只会把问题放入输入框，你仍可修改后再验证。</p></section>}
    <div className={styles.transcript} aria-live="polite">{projection.transcript.length === 0 ? <div className={styles.empty}><b>第一问不必猜真相</b><p>先确认对象、动作、时间或来源。无法识别和歧义都不会消耗次数。</p></div> : [...projection.transcript].reverse().map((entry, index) => <article key={entry.id}><div className={styles.questionLine}><small>你的问题</small><p>{entry.rawQuestion}</p>{index === 0 && <button onClick={() => send({ type: "undo_last_question" })}>撤销这问</button>}</div><div className={styles.answerLine} data-code={entry.answerCode}><small>系统理解为</small><p>{entry.interpretedAs}</p><div><b>{ANSWERS[entry.answerCode]}</b><span>{entry.answerText}</span>{entry.repeated && <em>已经验证</em>}</div>{host.rewrites[entry.id] && <blockquote>{host.rewrites[entry.id].text}</blockquote>}</div></article>)}</div>
    {projection.questionScaffolds.length > 0 && <details className={styles.builder}><summary>按对象、关系或时间改写问题</summary><p>选择公开问题作为改写起点；最终仍调用同一确定性查询。</p><div>{projection.questionScaffolds.map((candidate) => <button key={candidate.queryId} onClick={() => useStarter(candidate.label)}><b>{candidate.predicate}</b><span>{candidate.label}</span></button>)}</div></details>}
  </div>;
}

function EvidenceWorkspace({ projection, active, code, send, open, availableCount, onContinueToProof }: { projection: PlayerProjection; active: PlayerProjection["theoryDrafts"][number]; code: string; send: (c: GameCommand) => void; open: (w: Workspace) => void; availableCount: number; onContinueToProof: () => void }) {
  return <div className={styles.evidenceWorkspace}><header className={styles.workspaceHeading}><div><small>检查材料</small><h2>只保留能支持或反驳当前解释的证据</h2></div><span>{active.evidenceIds.length} 件加入证明</span></header>{active.evidenceIds.length > 0 && <div className={styles.proofTray} role="status"><div><small>当前证明篮</small><b>{active.evidenceIds.length} 件证据已接入</b><span>可以先去组织解释；之后仍能回来增删。</span></div><button type="button" onClick={onContinueToProof}>去组织证明</button></div>}{availableCount === 0 && <div className={styles.empty}><b>还没有可检查的材料</b><p>回到现场检查一个位置，或在提问区验证第一条事实。</p><button onClick={() => open("scene")}>查看现场</button><button onClick={() => open("questions")}>去提问</button></div>}<EvidenceInspector evidence={projection.evidence} activeTheoryId={projection.activeTheoryId} linkedEvidenceIds={active.evidenceIds} caseCode={code} dispatch={send} onContinueToProof={onContinueToProof} interactionLabel="检查观察，再决定是否加入我的证明" /></div>;
}

function MobileSummary({ summary, setSummary }: { summary: string; setSummary: (value: string) => void }) {
  return <label className={styles.mobileSummary}>我的真相<textarea name="player-summary" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="我认为发生了什么，以及为什么…" autoComplete="off" maxLength={4000} /><small>只保存在本机，不参与胜负，也不会发送给 AI。</small></label>;
}

function TheoryWorkspace({ projection, active, theoryOption, activeBoard, setActiveBoardId, gap, summary, setSummary, mastery, theoryStep, setTheoryStep, send }: { projection: PlayerProjection; active: PlayerProjection["theoryDrafts"][number]; theoryOption?: PlayerProjection["theoryOptions"][number]; activeBoard?: PlayerProjection["reasoningBoards"][number]; setActiveBoardId: (v: string) => void; gap?: string; summary: string; setSummary: (value: string) => void; mastery?: CaseMasteryRecord; theoryStep: TheoryStep; setTheoryStep: (value: TheoryStep) => void; send: (c: GameCommand) => void }) {
  const rotation = mastery ? challengeRotation(mastery) : undefined;
  const nextChallenge = rotation?.nextChallenge === "complete" ? undefined : projection.replayChallenges.find((challenge) => challenge.mode === rotation?.nextChallenge);
  if (projection.solved) return <div className={styles.theoryWorkspace}>
    <header className={styles.workspaceHeading}><div><small>结案档案</small><h2>你已经证明事件如何发生</h2></div><span>回放已解锁</span></header>
    <SolvedArchive projection={projection} active={active} summary={summary} rotation={rotation} nextChallenge={nextChallenge} send={send} />
  </div>;
  const steps: Array<{ id: TheoryStep; label: string }> = [{ id: "claim", label: "解释" }, ...(projection.reasoningBoards.length > 0 ? [{ id: "board" as const, label: "推理板" }] : []), { id: "chain", label: "事件链" }, { id: "proof", label: "提交" }];
  const readiness = deriveProofReadiness(projection, active);
  const evidenceChoices = projection.evidence.filter((item) => item.state !== "available" && item.state !== "dismissed");
  return <div className={styles.theoryWorkspace}>
    <header className={styles.workspaceHeading}><div><small>我的推断</small><h2>排列事件，说明证据为什么支持它</h2></div>{gap && <span className={styles.gap}>还缺：{GAPS[gap]}</span>}</header>
    <ProofContext readiness={readiness} activeStep={theoryStep} setStep={setTheoryStep} />
    <nav className={styles.mobileTheorySteps} aria-label="推断步骤">{steps.map((step) => <button key={step.id} aria-pressed={theoryStep === step.id} onClick={() => setTheoryStep(step.id)}>{step.label}</button>)}</nav>
    <section className={styles.theoryStage} data-active={theoryStep === "claim" || undefined}><MobileSummary summary={summary} setSummary={setSummary} /><div className={styles.theoryTabs}>{projection.theoryDrafts.map((draft) => <button key={draft.id} aria-pressed={draft.id === active.id} onClick={() => send({ type: "select_theory", theoryId: draft.id })}><b>{draft.title}</b><span>{draft.eventIds.length} 个事件</span></button>)}</div><label className={styles.field}>当前解释<select name="current-theory" value={active.hypothesisId} onChange={(e) => send({ type: "set_theory_hypothesis", theoryId: active.id, hypothesisId: e.target.value })}>{projection.theoryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></section>
    {projection.reasoningBoards.length > 0 && <section className={styles.theoryStage} data-active={theoryStep === "board" || undefined}><div className={styles.boardTabs}>{projection.reasoningBoards.map((board) => <button key={board.id} aria-pressed={activeBoard?.id === board.id} onClick={() => setActiveBoardId(board.id)}><b>{boardTitle(board.title, board.mode)}</b><span>{reasoningBoardUi(board.mode).label} · {board.slots.filter((slot) => slot.itemId).length}/{board.slots.length}</span></button>)}</div>{activeBoard && <ReasoningBoard board={activeBoard} dispatch={send} />}</section>}
    <section className={styles.theoryStage} data-active={theoryStep === "chain" || undefined}><LegacyTheoryWorkbench caseId={projection.case.id} draft={active} events={projection.eventOptions} dispatch={send} /></section>
    <section className={styles.theoryStage} data-active={theoryStep === "proof" || undefined}>
      <section className={styles.proofChecklist} aria-label="提交前检查"><header><div><small>当前结构，不代表答案正确</small><h3>{readiness.canSubmit ? "可以提交检验" : readiness.nextLabel}</h3></div>{!readiness.canSubmit && <button type="button" onClick={() => setTheoryStep(readiness.nextStep)}>前往处理</button>}</header><ul>{readiness.boardTotal > 0 && <li data-ready={readiness.boardPlaced === readiness.boardTotal || undefined}><b>推理板</b><span>{readiness.boardPlaced}/{readiness.boardTotal} 个槽位</span></li>}<li data-ready={readiness.eventCount > 0 || undefined}><b>事件链</b><span>{readiness.eventCount} 个事件</span></li><li data-ready={readiness.evidenceCount > 0 || undefined}><b>证明证据</b><span>{readiness.evidenceCount} 件已接入</span></li>{readiness.motiveRequired && <li data-ready={readiness.motiveSelected || undefined}><b>驱动条件</b><span>{readiness.motiveSelected ? "已经选择" : "尚未选择"}</span></li>}</ul></section>
      <section className={styles.proofEvidence}><h3>加入证明的证据</h3>{evidenceChoices.length === 0 ? <p>先到“证据”检查材料，再把最能支持或反驳当前解释的证据接进来。</p> : evidenceChoices.map((item) => <button key={item.id} data-linked={active.evidenceIds.includes(item.id) || undefined} onClick={() => send({ type: "link_theory_evidence", theoryId: active.id, evidenceId: item.id, linked: !active.evidenceIds.includes(item.id) })}>{active.evidenceIds.includes(item.id) ? "✓ " : "+ "}{item.title}</button>)}</section>
      <label className={styles.field}>驱动条件<select name="theory-motive" value={active.motiveKey ?? ""} onChange={(e) => send({ type: "set_theory_motive", theoryId: active.id, motiveKey: e.target.value || undefined })}><option value="">尚未证明</option>{theoryOption?.motiveOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <button className={styles.submit} disabled={!projection.canSubmit} onClick={() => send({ type: "submit_theory", theoryId: active.id })}>提交我的证明</button>
    </section>
  </div>;
}

function SolvedArchive({ projection, active, summary, rotation, nextChallenge, send }: { projection: PlayerProjection; active: PlayerProjection["theoryDrafts"][number]; summary: string; rotation?: ReturnType<typeof challengeRotation>; nextChallenge?: PlayerProjection["replayChallenges"][number]; send: (command: GameCommand) => void }) {
  const debrief = projection.debrief;
  const replayRef = useRef<HTMLElement>(null);
  const [replayStarted, setReplayStarted] = useState(false);
  const [visibleReplayBeats, setVisibleReplayBeats] = useState(1);
  const startReplay = () => {
    setReplayStarted(true);
    setVisibleReplayBeats(1);
    if (projection.replay.length === 0) send({ type: "request_proof_replay" });
    requestAnimationFrame(() => replayRef.current?.scrollIntoView({ block: "start" }));
  };
  return <section className={styles.solved} aria-labelledby="case-closed-title">
    <header className={styles.solvedHero}><div><small>CASE CLOSED · 这是你亲手还原的真相</small><h2 id="case-closed-title">你的证明成立</h2><p>答案不是系统替你揭晓的；事件、来源和证据已经由你的证明闭合。</p><div className={styles.solvedActions}><button type="button" onClick={startReplay}>{projection.replay.length > 0 ? "从头查看证据回放" : "开始证据回放"}</button>{nextChallenge && <span>下一步：{nextChallenge.mode === "limited-questions" ? `限定 ${nextChallenge.questionLimit ?? 12} 问` : nextChallenge.mode === "minimal-proof" ? "最小证据证明" : "无辅助挑战"}</span>}</div></div><span aria-hidden="true">结</span></header>
    <dl className={styles.debrief} aria-label="本次结案统计">
      <div><dt>证明完整度</dt><dd>{debrief?.proofCompleteness ?? 100}%</dd></div>
      <div><dt>有效提问</dt><dd>{debrief?.questionCount ?? projection.transcript.length}</dd></div>
      <div><dt>重复验证</dt><dd>{debrief?.repeatedQuestionCount ?? projection.transcript.filter((entry) => entry.repeated).length}</dd></div>
      <div><dt>采用证据</dt><dd>{active.evidenceIds.length}</dd></div>
    </dl>
    <div className={styles.summaryReplay}>
      <section><small>我的解释</small><p>{summary || "你没有留下文字总结，但结构化证明已经成立。"}</p></section>
      <section ref={replayRef} aria-live="polite"><small>证据回放</small>{!replayStarted ? <div className={styles.replayTease}><p>按事件发生的顺序，逐拍对照你选过的证据。</p><button type="button" onClick={startReplay}>开始回放</button></div> : projection.replay.length === 0 ? <div className={styles.replayLoading}>正在生成回放…</div> : <><ol>{projection.replay.slice(0, visibleReplayBeats).map((beat) => <li key={beat.id}><time>{beat.timeLabel}</time><p>{beat.caption}<small>{beat.evidenceTitles.join(" / ") || "已验证事件链"}</small></p></li>)}</ol><div className={styles.replayControls}><span>{Math.min(visibleReplayBeats, projection.replay.length)} / {projection.replay.length} 拍</span>{visibleReplayBeats < projection.replay.length && <><button type="button" onClick={() => setVisibleReplayBeats((count) => Math.min(count + 1, projection.replay.length))}>继续下一拍</button><button type="button" onClick={() => setVisibleReplayBeats(projection.replay.length)}>展开全部</button></>}</div></>}</section>
    </div>
    <div className={styles.challenges}><div><small>继续精通本案</small><p>精通挑战 {rotation?.completedCount ?? 0}/3</p></div>{nextChallenge ? <button onClick={() => send({ type: "set_replay_mode", mode: nextChallenge.mode })}>{nextChallenge.mode === "limited-questions" ? `开始限定 ${nextChallenge.questionLimit ?? 12} 问` : nextChallenge.mode === "minimal-proof" ? "开始最小证据证明" : "开始无问题辅助挑战"}</button> : <b>{rotation ? "本案挑战已完成" : "正在更新本地精通记录…"}</b>}</div>
  </section>;
}

function ProofContext({ readiness, activeStep, setStep }: { readiness: ReturnType<typeof deriveProofReadiness>; activeStep: TheoryStep; setStep: (step: TheoryStep) => void }) {
  const items: Array<{ id: TheoryStep; label: string; value: string; ready: boolean }> = [
    { id: "claim", label: "暂定解释", value: readiness.hypothesisLabel, ready: readiness.hypothesisLabel !== "尚未选择" },
    ...(readiness.boardTotal > 0 ? [{ id: "board" as const, label: "推理板", value: `${readiness.boardPlaced}/${readiness.boardTotal} 槽`, ready: readiness.boardPlaced === readiness.boardTotal }] : []),
    { id: "chain", label: "事件链", value: `${readiness.eventCount} 个事件`, ready: readiness.eventCount > 0 },
    { id: "proof", label: "证明篮", value: `${readiness.evidenceCount} 件证据`, ready: readiness.evidenceCount > 0 },
  ];
  return <section className={styles.proofContext} aria-label="当前证明结构"><header><small>当前证明结构</small><b>{readiness.nextLabel}</b></header><div>{items.map((item) => <button type="button" key={item.id} aria-pressed={activeStep === item.id} data-ready={item.ready || undefined} onClick={() => setStep(item.id)}><span>{item.label}</span><b>{item.value}</b></button>)}</div></section>;
}

function Notebook({ projection, summary, setSummary, workspace, open }: { projection: PlayerProjection; summary: string; setSummary: (v: string) => void; workspace: Workspace; open: (w: Workspace) => void }) {
  return <aside className={styles.notebook} aria-label="调查本"><header><div><small>调查本</small><h2>已经确认的事实</h2></div><span>{projection.transcript.length}</span></header><ol>{projection.transcript.slice(-5).reverse().map((entry) => <li key={entry.id}><b>{ANSWERS[entry.answerCode]}</b><span>{entry.interpretedAs}</span></li>)}</ol>{projection.transcript.length === 0 && <p>回答会出现在这里，观察和推断时可以随时回看。</p>}<label>我的真相<textarea name="player-summary-desktop" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="我认为发生了什么，以及为什么…" autoComplete="off" maxLength={4000} /><small>只保存在本机，不参与胜负，也不会发送给 AI。</small></label><nav>{TABS.filter((tab) => tab.id !== workspace).slice(0, 2).map((tab) => <button key={tab.id} onClick={() => open(tab.id)}>前往{tab.label}</button>)}</nav></aside>;
}

function SettingsPanel({ initialSection, onClose, muted, setMuted, reducedMotion, setReducedMotion, highContrast, setHighContrast, router, host, diagnostics, issueRecording, setIssueRecording, issues, setIssues, funGate }: { initialSection: SettingsSection; onClose: () => void; muted: boolean; setMuted: (v: boolean) => void; reducedMotion: boolean; setReducedMotion: (v: boolean) => void; highContrast: boolean; setHighContrast: (v: boolean) => void; router: ReturnType<typeof useQuestionRouter>; host: ReturnType<typeof useHostRewrite>; diagnostics: ReturnType<typeof useLocalDiagnostics>; issueRecording: boolean; setIssueRecording: (v: boolean) => void; issues: ExperienceIssueRecord[]; setIssues: Dispatch<SetStateAction<ExperienceIssueRecord[]>>; funGate: ReturnType<typeof useFunGateSession> }) {
  const panelRef = useRef<HTMLElement>(null);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const sections: Array<{ id: SettingsSection; label: string; detail: string }> = [
    { id: "experience", label: "体验", detail: "声音与显示" },
    { id: "ai", label: "AI", detail: "可选语言桥" },
    { id: "data", label: "数据", detail: "本地导出" },
  ];
  useEffect(() => { const timer = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus()); return () => cancelAnimationFrame(timer); }, []);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [onClose]);
  const handleKey = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Escape") { event.preventDefault(); onClose(); return; } if (event.key !== "Tab" || !panelRef.current) return; const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null); if (!items.length) return; const first = items[0], last = items.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } };
  return <div className={styles.settingsBackdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside ref={panelRef} className={styles.settings} role="dialog" aria-modal="true" aria-label="调查设置" onKeyDown={handleKey}>
      <header><div><small>只影响这台设备</small><h2>调查设置</h2></div><button onClick={onClose} aria-label="关闭设置">×</button></header>
      <nav className={styles.settingsTabs} role="tablist" aria-label="设置类别">{sections.map((item, index) => <button id={`settings-tab-${item.id}`} key={item.id} role="tab" aria-selected={section === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)} onKeyDown={(event) => {
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : direction ? (index + direction + sections.length) % sections.length : -1;
        if (nextIndex < 0) return;
        event.preventDefault(); const next = sections[nextIndex]; setSection(next.id); requestAnimationFrame(() => document.getElementById(`settings-tab-${next.id}`)?.focus());
      }}><b>{item.label}</b><small>{item.detail}</small></button>)}</nav>
      {section === "experience" && <section id="settings-panel-experience" role="tabpanel" aria-labelledby="settings-tab-experience" className={styles.settingsPanel}>
        <header><small>阅读与操作</small><h3>让调查适合你的设备</h3><p>这些设置不会改变线索、答案或证明结果。</p></header>
        <label className={styles.toggle}><span><b>静音</b><small>声音不包含必要线索</small></span><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /></label>
        <label className={styles.toggle}><span><b>减少动态</b><small>关闭工作区切换动画</small></span><input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} /></label>
        <label className={styles.toggle}><span><b>高对比</b><small>加强边框与辅助文字</small></span><input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} /></label>
        <div className={styles.offlinePromise}><b>始终可以离线完成</b><p>AI、声音和诊断全部关闭时，84 案仍能从开场完成到证据回放。</p></div>
      </section>}
      {section === "ai" && <section id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" className={styles.settingsPanel}>
        <QuestionRouterControls settings={router.settings} apiKey={router.apiKey} status={router.status} message={router.message} onSettings={router.setSettings} onKey={router.setApiKey} onTest={() => void router.test()} onClear={router.clearSession} />
        <details className={styles.settingsDisclosure}><summary>主持措辞（高级，可选）</summary><p>只润色已经确定的回答，不参与理解问题或判断真相。</p><HostRewriteControls settings={host.settings} status={host.status} message={host.message} onChange={host.setSettings} onClear={host.clearCache} /></details>
      </section>}
      {section === "data" && <section id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" className={`${styles.settingsPanel} ${styles.localTools}`}>
        <header><small>只留在本机</small><h3>测试与诊断</h3><p>正常游玩不需要打开或导出这里的任何内容。</p></header>
        <div className={styles.funGateSection}><h4>体验记录（可选）</h4><p>只显示匿名聚合指标，不影响正常调查。</p><FunGateTools report={funGate.report} onHint={funGate.markHintUsed} onExport={funGate.exportSession} /></div>
        <label className={styles.toggle}><span><b>聚合诊断</b><small>不记录问题原文</small></span><input type="checkbox" checked={diagnostics.recording} onChange={(e) => diagnostics.toggle(e.target.checked)} /></label>
        <label className={styles.toggle}><span><b>临时记录交互问题</b><small>只保留本次会话</small></span><input type="checkbox" checked={issueRecording} onChange={(e) => setIssueRecording(e.target.checked)} /></label>
        {issueRecording && <div className={styles.issueList}>{issues.map((issue) => <div key={issue.id}><span>{issue.path} · {issue.rawQuestion}</span><button onClick={() => setIssues((list) => list.filter((x) => x.id !== issue.id))}>删除</button></div>)}<nav><button onClick={() => downloadExperienceIssues(issues, "json")}>导出问题 JSON</button><button onClick={() => downloadExperienceIssues(issues, "csv")}>导出问题 CSV</button><button onClick={() => setIssues([])}>清空</button></nav></div>}
        <div className={styles.diagnosticActions}><button onClick={() => void diagnostics.exportSessions("json")}>导出诊断 JSON</button><button onClick={() => void diagnostics.exportSessions("csv")}>导出诊断 CSV</button><button onClick={() => void diagnostics.clear()}>清空诊断</button></div>
      </section>}
    </aside>
  </div>;
}
