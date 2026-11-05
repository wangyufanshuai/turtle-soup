"use client";

import Link from "next/link";
import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CASE_CATALOG, RELEASE_PROFILE } from "@/lib/case-catalog";
import { listCaseSaves } from "@/lib/save-store";
import { listMastery, masterySummary } from "@/lib/mastery-store";
import { GOLDEN_PATH } from "@/lib/golden-experience";
import { homeCaseArt } from "@/lib/home-cinema-assets";
import { ArchiveTools } from "./archive-tools";
import { CinemaHero } from "./home/cinema-hero";
import { SeasonSelector } from "./home/season-selector";
import { CaseFilters, difficultyLabel, type CompletionFilter } from "./home/case-filters";
import { CaseDirectory } from "./home/case-directory";
import styles from "./case-select.module.css";

const SEASON_KEY = "black-soup:active-season:v19";
const TAG_LABELS: Record<string, string> = {
  suspense: "悬疑",
  "non-graphic-danger": "非血腥危险",
  "lateral-thinking": "情境推理",
  "physical-deduction": "物理推理",
  "identity-deduction": "身份推理",
  theater: "剧院",
  "document-chain": "文书来源",
  "time-verification": "时间核验",
  "electrical-topology": "电路拓扑",
  perspective: "视角",
  "record-provenance": "记录来源",
  "time-order": "时序",
  "mechanical-causality": "机械因果",
  "space-constraint": "空间约束",
  "audio-provenance": "音频来源",
  "buffered-recording": "缓存记录",
  "environmental-lag": "环境延迟",
  "water-system": "水系统",
  "telephony-protocol": "电话协议",
  "endpoint-state": "终端状态",
  "call-provenance": "呼叫来源",
  "document-provenance": "文档来源",
  "stamp-impression": "印章痕迹",
  "timeline-proof": "时间链证明",
  "state-machine": "状态机",
  "display-vs-motion": "显示与运动",
  "sensor-provenance": "传感器来源",
};
const tagLabel = (value: string) => TAG_LABELS[value] ?? value;
const SKILLS = [
  ...new Set(CASE_CATALOG.flatMap((entry) => entry.mechanicTags ?? entry.contentTags)),
].map((value) => ({ value, label: tagLabel(value) }));
const DIFFICULTIES = [...new Set(CASE_CATALOG.map((entry) => entry.difficulty))];
const CATALOG_IDS = new Set<string>(CASE_CATALOG.map((entry) => entry.id));

export function CaseSelect() {
  const [saves, setSaves] = useState<SaveEnvelope[]>([]);
  const [mastery, setMastery] = useState<
    Record<string, Awaited<ReturnType<typeof listMastery>>[number]>
  >({});
  const [revision, setRevision] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [difficulty, setDifficulty] = useState("all");
  const [skill, setSkill] = useState("all");
  const [completion, setCompletion] = useState<CompletionFilter>("all");
  const [search, setSearch] = useState("");
  const [activeSeason, setActiveSeason] = useState("season-1");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEASON_KEY);
      if (stored && CASE_CATALOG.some((entry) => (entry.seasonId ?? "season-1") === stored))
        setActiveSeason(stored);
    } catch {
      /* A season preference is optional. */
    }
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listCaseSaves()
        .then((records) => {
          if (active) {
            setSaves(records.filter((save) => CATALOG_IDS.has(save.caseId)));
            setStorageError(false);
          }
        })
        .catch(() => {
          if (active) setStorageError(true);
        });
      void listMastery()
        .then((records) => {
          if (active)
            setMastery(Object.fromEntries(records.map((record) => [record.caseId, record])));
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [revision]);

  const completed = useMemo(
    () => new Set(saves.filter((save) => save.completed).map((save) => save.caseId)),
    [saves],
  );
  const started = useMemo(() => new Set(saves.map((save) => save.caseId)), [saves]);
  const orderedSaves = useMemo(
    () => [...saves].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [saves],
  );
  const latest = orderedSaves.find((save) => !save.completed) ?? orderedSaves[0];
  const featured =
    CASE_CATALOG.find((entry) => entry.id === (latest?.caseId ?? "c01-cold-room-knock")) ??
    CASE_CATALOG[0];
  const recent = orderedSaves.slice(0, 3).flatMap((save) => {
    const entry = CASE_CATALOG.find((entry) => entry.id === save.caseId);
    return entry ? [{ save, entry }] : [];
  });
  const solvedOrMastered = new Set([
    ...completed,
    ...Object.values(mastery)
      .filter((record) => record.standardSolved)
      .map((record) => record.caseId),
  ]);
  const firstUnfinished =
    GOLDEN_PATH.find((step) => !solvedOrMastered.has(step.caseId)) ??
    GOLDEN_PATH[GOLDEN_PATH.length - 1];
  const recommendedStep =
    firstUnfinished.caseId === featured.id
      ? (GOLDEN_PATH.find(
          (step) => step.caseId !== featured.id && !solvedOrMastered.has(step.caseId),
        ) ?? firstUnfinished)
      : firstUnfinished;
  const recommended = CASE_CATALOG.find((entry) => entry.id === recommendedStep.caseId)!;
  const seasonEntries = CASE_CATALOG.filter(
    (entry) => (entry.seasonId ?? "season-1") === activeSeason,
  );
  const needle = search.trim().toLocaleLowerCase("zh-CN");
  const filtered = seasonEntries.filter((entry) => {
    if (
      needle &&
      ![
        entry.id,
        entry.title,
        entry.surface,
        ...(entry.mechanicTags ?? entry.contentTags).flatMap((tag) => [tag, tagLabel(tag)]),
        ...entry.contentTags,
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(needle)
    )
      return false;
    if (difficulty !== "all" && entry.difficulty !== difficulty) return false;
    if (skill !== "all" && !(entry.mechanicTags ?? entry.contentTags).includes(skill)) return false;
    if (completion === "closed" && !completed.has(entry.id)) return false;
    if (completion === "open" && completed.has(entry.id)) return false;
    if (completion === "progress" && (!started.has(entry.id) || completed.has(entry.id)))
      return false;
    return true;
  });
  const clear = () => {
    setSearch("");
    setDifficulty("all");
    setSkill("all");
    setCompletion("all");
  };
  const selectSeason = (id: string) => {
    setActiveSeason(id);
    try {
      localStorage.setItem(SEASON_KEY, id);
    } catch {
      /* UI preference only. */
    }
  };
  const challenges = Object.fromEntries(
    Object.entries(mastery).map(([id, record]) => [id, masterySummary(record).completedCount]),
  );

  return (
    <main id="main-content" tabIndex={-1} className={styles.page}>
      <CinemaHero
        entry={featured}
        state={latest ? (latest.completed ? "closed" : "continue") : "new"}
        difficulty={difficultyLabel(featured.difficulty)}
      />
      <div className={styles.content}>
        {storageError && (
          <div className={styles.storageNotice} role="status">
            <p>暂时无法读取本地存档。你仍可以打开案件，进度能否保存取决于浏览器的存储权限。</p>
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              重新读取
            </button>
          </div>
        )}
        <SeasonSelector selected={activeSeason} completed={completed} onSelect={selectSeason} />
        {recent.length > 0 && (
          <section className={styles.recent} aria-label="最近调查">
            <h2>最近调查</h2>
            <div>
              {recent.map(({ entry, save }) => (
                <Link href={`/case/${entry.id}`} key={entry.id} prefetch={false}>
                  <span>{save.completed ? "已结案" : "调查中"}</span>
                  <b>{entry.title}</b>
                  <ArrowRightIcon size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}
        <section id="case-library" className={styles.library} aria-labelledby="library-heading">
          <div className={styles.libraryHeading}>
            <div>
              <p className={styles.eyebrow}>THE CASE FILES</p>
              <h2 id="library-heading">{seasonEntries[0]?.seasonTitle}</h2>
            </div>
            <span>
              {seasonEntries.filter((entry) => completed.has(entry.id)).length}
              <small> / {seasonEntries.length} 已结案</small>
            </span>
          </div>
          <Link
            prefetch={false}
            href={`/case/${recommended.id}`}
            className={styles.recommendation}
            aria-label={`推荐下一案：${recommended.title}`}
          >
            <img
              src={homeCaseArt(recommended.id).thumbnail}
              alt=""
              width={640}
              height={400}
              loading="lazy"
            />
            <div>
              <span className={styles.eyebrow}>下一份值得打开的档案</span>
              <h3>{recommended.title}</h3>
              <p>
                {recommendedStep.estimatedMinutes.min}–{recommendedStep.estimatedMinutes.max} 分钟
                <span>练习{recommendedStep.nextSkill}</span>
              </p>
            </div>
            <span className={styles.recommendationAction}>
              开始调查
              <ArrowRightIcon size={22} weight="light" aria-hidden="true" />
            </span>
          </Link>
          <CaseFilters
            search={search}
            difficulty={difficulty}
            skill={skill}
            completion={completion}
            resultCount={filtered.length}
            skills={SKILLS}
            difficulties={DIFFICULTIES}
            onSearch={setSearch}
            onDifficulty={setDifficulty}
            onSkill={setSkill}
            onCompletion={setCompletion}
            onClear={clear}
          />
          <div
            id="active-season-cases"
            role="tabpanel"
            aria-labelledby={`tab-${activeSeason}`}
            tabIndex={0}
            key={activeSeason}
            className={styles.casePanel}
          >
            <CaseDirectory
              entries={filtered}
              completed={completed}
              started={started}
              challenges={challenges}
              onClear={clear}
            />
          </div>
        </section>
        <section id="local-archive" className={styles.localArchive} aria-label="存档管理">
          <ArchiveTools onImported={() => setRevision((value) => value + 1)} />
        </section>
        <footer className={styles.footer}>
          <div>
            <span className={styles.footerBrand}>深汤</span>
            <span>THE BLACK SOUP</span>
          </div>
          <details>
            <summary>版本说明 · {RELEASE_PROFILE.id.toUpperCase()}</summary>
            <p>
              五季 · {CASE_CATALOG.length}{" "}
              案。当前为开发预览版，尚未完成真人评测。存档保存在本机，可在上方导出备份。
            </p>
          </details>
          <a href="#main-content">
            回到开场
            <ArrowRightIcon size={16} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
