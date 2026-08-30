"use client";

import Link from "next/link";
import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CASE_CATALOG, RELEASE_PROFILE } from "@/lib/case-catalog";
import { listCaseSaves } from "@/lib/save-store";
import { listMastery, masterySummary } from "@/lib/mastery-store";
import { GOLDEN_PATH } from "@/lib/golden-experience";
import styles from "./case-select.module.css";
import { ArchiveTools } from "./archive-tools";

type CompletionFilter = "all" | "open" | "closed";
const SEASON_KEY = "black-soup:active-season:v19";
const DIFFICULTY_LABELS: Record<string, string> = { intro: "入门", intermediate: "进阶", advanced: "高难", expert: "专家" };
const TAG_LABELS: Record<string, string> = {
  suspense: "悬疑", "non-graphic-danger": "非血腥危险", "lateral-thinking": "情境推理", "physical-deduction": "物理推理",
  "identity-deduction": "身份推理", theater: "剧院", "document-chain": "文书来源", "time-verification": "时间核验",
  "electrical-topology": "电路拓扑", perspective: "视角", "record-provenance": "记录来源", "time-order": "时序",
  "mechanical-causality": "机械因果", "space-constraint": "空间约束", "audio-provenance": "音频来源", "buffered-recording": "缓存记录",
  "environmental-lag": "环境延迟", "water-system": "水系统", "telephony-protocol": "电话协议", "endpoint-state": "终端状态",
  "call-provenance": "呼叫来源", "document-provenance": "文档来源", "stamp-impression": "印章痕迹", "timeline-proof": "时间链证明",
  "state-machine": "状态机", "display-vs-motion": "显示与运动", "sensor-provenance": "传感器来源",
};
function difficultyLabel(value: string) { return DIFFICULTY_LABELS[value] ?? value; }
function tagLabel(value: string) { return TAG_LABELS[value] ?? value; }

function releaseStatus() {
  const status = String(RELEASE_PROFILE.status);
  return status === "published" ? "正式版" : status === "public-preview" ? "公开预览 · 等待真人评测" : "内部候选 · 等待真人评测";
}

function readAiStatus() {
  if (typeof window === "undefined") return "离线可玩";
  if (!navigator.onLine) return "离线可玩";
  try {
    const settings = JSON.parse(localStorage.getItem("black-soup:ai-router-settings:v1") ?? "null") as { enabled?: boolean } | null;
    const key = sessionStorage.getItem("black-soup:ai-router-key:v1");
    return settings?.enabled && key ? "已连接" : "未配置";
  } catch { return "未配置"; }
}

export function CaseSelect() {
  const [saves, setSaves] = useState<SaveEnvelope[]>([]);
  const [mastery, setMastery] = useState<Record<string, Awaited<ReturnType<typeof listMastery>>[number]>>({});
  const [revision, setRevision] = useState(0);
  const [difficulty, setDifficulty] = useState("all");
  const [skill, setSkill] = useState("all");
  const [completion, setCompletion] = useState<CompletionFilter>("all");
  const [activeSeason, setActiveSeason] = useState("season-1");
  const [aiStatus, setAiStatus] = useState("离线可玩");
  const seasonTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    void listCaseSaves().then(setSaves).catch(() => undefined);
    void listMastery().then((records) => setMastery(Object.fromEntries(records.map((record) => [record.caseId, record])))).catch(() => undefined);
    try { const storedSeason = localStorage.getItem(SEASON_KEY); if (storedSeason && CASE_CATALOG.some((entry) => (entry.seasonId ?? "season-1") === storedSeason)) setActiveSeason(storedSeason); } catch { /* UI preference only */ }
    const updateAi = () => setAiStatus(readAiStatus());
    updateAi(); window.addEventListener("online", updateAi); window.addEventListener("offline", updateAi);
    return () => { window.removeEventListener("online", updateAi); window.removeEventListener("offline", updateAi); };
  }, [revision]);

  const completed = useMemo(() => new Set(saves.filter((save) => save.completed).map((save) => save.caseId)), [saves]);
  const orderedSaves = useMemo(() => [...saves].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [saves]);
  const latest = orderedSaves[0];
  const recentCases = orderedSaves.slice(0, 3).map((save) => ({ save, entry: CASE_CATALOG.find((entry) => entry.id === save.caseId) })).filter((item) => item.entry);
  const skills = useMemo(() => [...new Set(CASE_CATALOG.flatMap((entry) => entry.mechanicTags ?? entry.contentTags))], []);
  const seasons = useMemo(() => [...new Set(CASE_CATALOG.map((entry) => entry.seasonId ?? "season-1"))], []);
  const solvedOrMastered = useMemo(() => new Set([...completed, ...Object.values(mastery).filter((record) => record.standardSolved).map((record) => record.caseId)]), [completed, mastery]);
  const recommendedStep = GOLDEN_PATH.find((step) => !solvedOrMastered.has(step.caseId)) ?? GOLDEN_PATH[GOLDEN_PATH.length - 1];
  const recommendedCase = CASE_CATALOG.find((entry) => entry.id === recommendedStep.caseId);
  const filtered = CASE_CATALOG.filter((entry) => {
    if ((entry.seasonId ?? "season-1") !== activeSeason) return false;
    if (difficulty !== "all" && entry.difficulty !== difficulty) return false;
    if (skill !== "all" && !(entry.mechanicTags ?? entry.contentTags).includes(skill)) return false;
    if (completion === "closed" && !completed.has(entry.id)) return false;
    if (completion === "open" && completed.has(entry.id)) return false;
    return true;
  });
  const activeSeasonEntries = CASE_CATALOG.filter((entry) => (entry.seasonId ?? "season-1") === activeSeason);
  const seasonTitle = activeSeasonEntries[0]?.seasonTitle ?? "黑汤档案";
  const selectSeason = (seasonId: string) => { setActiveSeason(seasonId); try { localStorage.setItem(SEASON_KEY, seasonId); } catch { /* UI preference only */ } };
  const onSeasonKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? seasons.length - 1 : direction ? (index + direction + seasons.length) % seasons.length : -1;
    if (nextIndex < 0) return;
    event.preventDefault(); selectSeason(seasons[nextIndex]); requestAnimationFrame(() => seasonTabRefs.current[nextIndex]?.focus());
  };

  return <main id="main-content" tabIndex={-1} className={styles.page}>
    <header className={styles.header}>
      <div className={styles.mark}>深</div>
      <div><small>黑汤档案室 · 60 件确定性谜案</small><h1>从一个异常开始调查</h1><p>提问验证事实，检查来源，最后用证据证明事情如何发生。</p></div>
      <div className={styles.status}><b>{releaseStatus()}</b><span>AI：{aiStatus}</span><em>没有 API 也能完整游玩</em></div>
    </header>

    <section className={styles.firstScreen} aria-label="继续与推荐">
      <div className={styles.primaryActions}>
        {latest ? <Link prefetch={false} className={styles.continueCase} href={`/case/${latest.caseId}`}><small>继续调查</small><b>{CASE_CATALOG.find((entry) => entry.id === latest.caseId)?.title ?? latest.caseId}</b><span>{latest.completed ? "回看结案与挑战" : "从上次保存的位置继续"} →</span></Link> : <Link prefetch={false} className={styles.continueCase} href="/case/c01-cold-room-knock"><small>开始第一案</small><b>冷藏室的敲门声</b><span>所有案件都可以直接进入 →</span></Link>}
        <Link prefetch={false} className={styles.recommendedCase} href={`/case/${recommendedStep.caseId}`} aria-label={`推荐下一案：${recommendedCase?.title ?? recommendedStep.caseId}`}><small>推荐下一案</small><b>{recommendedCase?.title ?? recommendedStep.caseId}</b><span>{recommendedStep.estimatedMinutes.min}–{recommendedStep.estimatedMinutes.max} 分钟 · 练习{recommendedStep.nextSkill} →</span></Link>
      </div>
      <div className={styles.recent}><h2>最近调查</h2>{recentCases.length ? recentCases.map(({ save, entry }) => <Link key={save.caseId} href={`/case/${save.caseId}`} prefetch={false}><span>{save.completed ? "已结案" : "调查中"}</span><b>{entry!.title}</b></Link>) : <p>完成第一次操作后，这里会保留最近三案。</p>}</div>
    </section>

    <section className={styles.archive} aria-labelledby="season-heading">
      <div className={styles.seasonHead}><div><small>选择季节</small><h2 id="season-heading">{seasonTitle}</h2></div><span>{activeSeasonEntries.filter((entry) => completed.has(entry.id)).length}/{activeSeasonEntries.length} 已结案</span></div>
      <div className={styles.seasonTabs} role="tablist" aria-label="案件季节">{seasons.map((seasonId, index) => { const entries = CASE_CATALOG.filter((entry) => (entry.seasonId ?? "season-1") === seasonId), selected = activeSeason === seasonId; return <button ref={(node) => { seasonTabRefs.current[index] = node; }} role="tab" tabIndex={selected ? 0 : -1} aria-selected={selected} aria-controls="active-season-cases" id={`tab-${seasonId}`} key={seasonId} onClick={() => selectSeason(seasonId)} onKeyDown={(event) => onSeasonKeyDown(event, index)}><b>第{index + 1}季</b><span>{entries.filter((entry) => completed.has(entry.id)).length}/{entries.length}</span></button>; })}</div>
      <details className={styles.filterDrawer}><summary>筛选案件 <span>{filtered.length} 件可见</span></summary><div className={styles.filters}>
        <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部难度</option>{[...new Set(CASE_CATALOG.map((entry) => entry.difficulty))].map((value) => <option key={value} value={value}>{difficultyLabel(value)}</option>)}</select></label>
        <label>推理技能<select value={skill} onChange={(event) => setSkill(event.target.value)}><option value="all">全部技能</option>{skills.map((value) => <option key={value} value={value}>{tagLabel(value)}</option>)}</select></label>
        <label>档案状态<select value={completion} onChange={(event) => setCompletion(event.target.value as CompletionFilter)}><option value="all">全部档案</option><option value="open">调查中</option><option value="closed">已结案</option></select></label>
      </div></details>
      <div id="active-season-cases" role="tabpanel" aria-labelledby={`tab-${activeSeason}`} className={styles.caseGrid}>{filtered.map((entry) => {
        const number = entry.id.match(/^c(\d+)/)?.[1] ?? "--";
        const summary = masterySummary(mastery[entry.id]);
        return <Link prefetch={false} className={styles.caseCard} data-layout={entry.layoutId} href={`/case/${entry.id}`} key={entry.id} style={{ "--card-accent": entry.accent } as React.CSSProperties}>
          <div className={styles.thumb}><picture>{entry.sceneAssetMobile && <source media="(max-width: 900px)" srcSet={entry.sceneAssetMobile} />}<img src={entry.sceneAsset} alt="" width={640} height={360} loading="lazy" /></picture><span>C{number} · {completed.has(entry.id) ? "已结案" : "可调查"}</span></div>
          <div className={styles.cardBody}><small>{difficultyLabel(entry.difficulty)} · {entry.targetMinutes.min}–{entry.targetMinutes.max} 分钟</small><h3>{entry.title}</h3><p>{entry.surface}</p><div>{entry.contentTags.slice(0, 3).map((tag) => <span key={tag}>{tagLabel(tag)}</span>)}</div>{mastery[entry.id] && <em>挑战 {summary.completedCount}/3</em>}</div>
        </Link>;
      })}{filtered.length === 0 && <div className={styles.noResults}><b>这个筛选下没有案件</b><button onClick={() => { setDifficulty("all"); setSkill("all"); setCompletion("all"); }}>清除筛选</button></div>}</div>
    </section>

    <ArchiveTools onImported={() => setRevision((value) => value + 1)} />
    <footer className={styles.footer}><span>深汤 / {RELEASE_PROFILE.id.toUpperCase()}</span><span>INTERNAL RC · HUMAN EVALUATION PENDING</span></footer>
  </main>;
}
