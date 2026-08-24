"use client";

import Link from "next/link";
import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import { CASE_CATALOG, RELEASE_PROFILE } from "@/lib/case-catalog";
import { listCaseSaves } from "@/lib/save-store";
import { listMastery, masterySummary } from "@/lib/mastery-store";
import styles from "./case-select.module.css";
import { ArchiveTools } from "./archive-tools";

type CompletionFilter = "all" | "open" | "closed";

function profileStatusForSeason(entries: typeof CASE_CATALOG) {
  const status = String(RELEASE_PROFILE.status);
  if (status === "published") return "PUBLISHED";
  if (status === "public-preview") return "PUBLIC PREVIEW / HUMAN PENDING";
  return "INTERNAL RC / HUMAN PENDING";
}

export function CaseSelect() {
  const [saves, setSaves] = useState<SaveEnvelope[]>([]);
  const [mastery, setMastery] = useState<Record<string, Awaited<ReturnType<typeof listMastery>>[number]>>({});
  const [revision, setRevision] = useState(0);
  const [difficulty, setDifficulty] = useState("all");
  const [skill, setSkill] = useState("all");
  const [completion, setCompletion] = useState<CompletionFilter>("all");
  const [openSeasons, setOpenSeasons] = useState<Record<string, boolean>>({ "season-1": true });
  useEffect(() => {
    void listCaseSaves().then(setSaves).catch(() => undefined);
    void listMastery().then((records) => setMastery(Object.fromEntries(records.map((record) => [record.caseId, record])))).catch(() => undefined);
    try { const stored = JSON.parse(localStorage.getItem("black-soup:season-folders:v1") ?? "null") as Record<string, boolean> | null; if (stored) setOpenSeasons((current) => ({ ...current, ...stored })); } catch { /* defaults */ }
  }, [revision]);
  const completed = useMemo(() => new Set(saves.filter((save) => save.completed).map((save) => save.caseId)), [saves]);
  const latest = useMemo(() => [...saves].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0], [saves]);
  const skills = useMemo(() => [...new Set(CASE_CATALOG.flatMap((entry) => entry.mechanicTags ?? entry.contentTags))], []);
  const filtered = CASE_CATALOG.filter((entry) => {
    if (difficulty !== "all" && entry.difficulty !== difficulty) return false;
    if (skill !== "all" && !(entry.mechanicTags ?? entry.contentTags).includes(skill)) return false;
    if (completion === "closed" && !completed.has(entry.id)) return false;
    if (completion === "open" && completed.has(entry.id)) return false;
    return true;
  });
  const seasons = [...new Set(CASE_CATALOG.map((entry) => entry.seasonId ?? "season-1"))];
  const skillProgress = skills.map((name) => ({ name, closed: CASE_CATALOG.filter((entry) => completed.has(entry.id) && (entry.mechanicTags ?? entry.contentTags).includes(name)).length })).filter((item) => item.closed > 0).slice(0, 8);
  const mostRecentSeason = latest ? CASE_CATALOG.find((entry) => entry.id === latest.caseId)?.seasonId : undefined;
  const toggleSeason = (seasonId: string, value: boolean) => { setOpenSeasons((current) => { const next = { ...current, [seasonId]: value }; try { localStorage.setItem("black-soup:season-folders:v1", JSON.stringify(next)); } catch { /* optional UI preference */ } return next; }); };

  return (
    <main id="main-content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <div className={styles.mark}>深</div>
        <div><span className={styles.kicker}>THE BLACK SOUP / FOUR SEASONS</span><h1>选择一件尚未闭合的事</h1><p>60 个有限真相。观察、提问、连接来源，再亲手证明事件如何发生。</p></div>
        <div className={styles.mode}>LOCAL ARCHIVE<br/><b>NO API KEY</b><br/>{RELEASE_PROFILE.status.toUpperCase()}</div>
      </header>

      <section className={styles.commandDeck} aria-label="档案控制台">
        {latest ? <Link prefetch={false} className={styles.continueCase} href={`/case/${latest.caseId}`}><small>CONTINUE LAST TRACE</small><b>{CASE_CATALOG.find((entry) => entry.id === latest.caseId)?.title ?? latest.caseId}</b><span>{latest.completed ? "回看已结案件" : "继续调查"} →</span></Link> : <div className={styles.continueCase}><small>FIRST TRACE</small><b>从第一件异常开始</b><span>所有案件均可直接进入</span></div>}
        <div className={styles.skillDossier}><small>INVESTIGATION SKILLS / LOCAL</small><div>{skillProgress.length ? skillProgress.map((item) => <span key={item.name}>{item.name}<b>{item.closed}</b></span>) : <p>结案后，这里会形成你的本地推理技能档案。</p>}</div></div>
      </section>

      <ArchiveTools onImported={() => setRevision((value) => value + 1)} />
      <section className={styles.filters} aria-label="筛选案件">
        <label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部难度</option>{[...new Set(CASE_CATALOG.map((entry) => entry.difficulty))].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>推理技能<select value={skill} onChange={(event) => setSkill(event.target.value)}><option value="all">全部技能</option>{skills.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>档案状态<select value={completion} onChange={(event) => setCompletion(event.target.value as CompletionFilter)}><option value="all">全部档案</option><option value="open">调查中</option><option value="closed">已结案</option></select></label>
        <span>{filtered.length} / {CASE_CATALOG.length} CASES</span>
      </section>

      {seasons.map((seasonId) => {
        const cases = filtered.filter((entry) => (entry.seasonId ?? "season-1") === seasonId);
        if (!cases.length) return null;
        const seasonTitle = cases[0].seasonTitle ?? "黑汤档案";
        const completedCount = cases.filter((entry) => completed.has(entry.id)).length;
        const challengeCount = cases.reduce((sum, entry) => sum + masterySummary(mastery[entry.id]).completedCount, 0);
        const defaultOpen = seasonId === "season-1" || seasonId === mostRecentSeason;
        const seasonStatus = seasonId === "season-1" ? "冻结基线" : profileStatusForSeason(cases);
        return <details className={styles.season} key={seasonId} open={openSeasons[seasonId] ?? defaultOpen} onToggle={(event) => toggleSeason(seasonId, event.currentTarget.open)}>
          <summary className={styles.seasonSummary} aria-controls={`cases-${seasonId}`}><div><small>{seasonId.toUpperCase()}</small><h2 id={`title-${seasonId}`}>{seasonTitle}</h2></div><p>{completedCount}/{cases.length} 已结案 · {challengeCount} 项挑战 · {seasonStatus}</p></summary>
          <div id={`cases-${seasonId}`} className={styles.caseGrid}>
            {cases.map((entry) => {
              const number = entry.id.match(/^c(\d+)/)?.[1] ?? "--";
              return <Link prefetch={false} className={styles.caseCard} data-layout={entry.layoutId} href={`/case/${entry.id}`} key={entry.id} style={{ "--card-accent": entry.accent } as React.CSSProperties}>
                <div className={styles.cardTop}><span>CASE {number}</span><b>{completed.has(entry.id) ? "CLOSED" : "OPEN"}</b></div>
                <div className={styles.thumb}><picture>{entry.sceneAssetMobile && <source media="(max-width: 900px)" srcSet={entry.sceneAssetMobile} />}<img src={entry.sceneAsset} alt="" width={640} height={360} loading="lazy" /></picture></div>
                <div className={styles.cardBody}><small>{entry.difficulty.toUpperCase()} · {entry.targetMinutes.min}–{entry.targetMinutes.max} MIN · {entry.status === "frozen" ? "FROZEN" : RELEASE_PROFILE.status.toUpperCase()}</small><h3>{entry.title}</h3><p>{entry.surface}</p><div className={styles.tags}>{entry.contentTags.map((tag) => <span key={tag}>{tag}</span>)}</div>{mastery[entry.id] && <div className={styles.mastery}><span>精通 {masterySummary(mastery[entry.id]).completedCount}/3</span><b>{masterySummary(mastery[entry.id]).nextChallenge === "complete" ? "MASTERED" : `下一项：${masterySummary(mastery[entry.id]).nextChallenge}`}</b></div>}</div>
                <div className={styles.enter}>打开档案 <span>↗</span></div>
              </Link>;
            })}
          </div>
        </details>;
      })}
      <footer className={styles.footer}><span translate="no">深汤 / {RELEASE_PROFILE.id.toUpperCase()}</span><span>60 案确定性体验门禁 · HUMAN EVALUATION PENDING</span></footer>
    </main>
  );
}
