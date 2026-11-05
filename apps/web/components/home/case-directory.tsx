import Link from "next/link";
import type { CaseCatalogEntry } from "@turtle-soup/mystery-core";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { homeCaseArt } from "@/lib/home-cinema-assets";
import { difficultyLabel } from "./case-filters";
import styles from "../case-select.module.css";

type Props = {
  entries: CaseCatalogEntry[];
  completed: Set<string>;
  started: Set<string>;
  challenges: Record<string, number>;
  onClear: () => void;
};
export function CaseDirectory({ entries, completed, started, challenges, onClear }: Props) {
  return (
    <div className={styles.caseGrid}>
      {entries.map((entry) => {
        const art = homeCaseArt(entry.id);
        return (
          <Link
            prefetch={false}
            className={styles.caseCard}
            href={`/case/${entry.id}`}
            key={entry.id}
          >
            <div className={styles.caseImage}>
              <img
                src={art.thumbnail}
                alt=""
                width={640}
                height={400}
                loading="lazy"
                style={{ objectPosition: art.focus }}
              />
              <span className={styles.caseNumber}>{entry.id.match(/^c(\d+)/)?.[1]}</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.caseMeta}>
                <span>
                  {difficultyLabel(entry.difficulty)}
                  <span>
                    {entry.targetMinutes.min}–{entry.targetMinutes.max} 分钟
                  </span>
                </span>
                <span className={completed.has(entry.id) ? styles.closed : undefined}>
                  {completed.has(entry.id) ? "已结案" : started.has(entry.id) ? "调查中" : "未开启"}
                </span>
              </div>
              <h3>{entry.title}</h3>
              <p>
                {entry.surface
                  .split(/(?<=[。！？])/u)
                  .slice(0, 2)
                  .join("")}
              </p>
              <span className={styles.caseAction}>
                {started.has(entry.id)
                  ? completed.has(entry.id)
                    ? "重返现场"
                    : "继续调查"
                  : "打开档案"}
                {challenges[entry.id] !== undefined && <small>挑战 {challenges[entry.id]}/3</small>}
                <ArrowUpRightIcon size={20} aria-hidden="true" />
              </span>
            </div>
          </Link>
        );
      })}
      {entries.length === 0 && (
        <div className={styles.noResults}>
          <MagnifyingGlassIcon size={34} weight="light" aria-hidden="true" />
          <h3>线索暂时没有交集</h3>
          <p>当前季没有符合条件的案件。试着减少筛选条件，或换一季看看。</p>
          <button type="button" onClick={onClear}>
            清除筛选
          </button>
        </div>
      )}
    </div>
  );
}
