import { useRef, type KeyboardEvent } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CASE_CATALOG } from "@/lib/case-catalog";
import { HOME_CINEMA } from "@/lib/home-cinema-assets";
import styles from "../case-select.module.css";

const SEASON_LABELS = ["第一季", "第二季", "第三季", "第四季", "第五季"];
export function SeasonSelector({
  selected,
  completed,
  onSelect,
}: {
  selected: string;
  completed: Set<string>;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
      ? 1
      : ["ArrowLeft", "ArrowUp"].includes(event.key)
        ? -1
        : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 4
          : direction
            ? (index + direction + 5) % 5
            : -1;
    if (next < 0) return;
    event.preventDefault();
    onSelect(HOME_CINEMA.seasons[next].id);
    refs.current[next]?.focus({ preventScroll: true });
    refs.current[next]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  };
  return (
    <section className={styles.seasons} aria-labelledby="seasons-heading">
      <div className={styles.sectionHeading}>
        <h2 id="seasons-heading">五季悬案，等你入局</h2>
        <p>
          {CASE_CATALOG.length} 份谜案<span>单人调查</span>
          <span>离线可玩</span>
        </p>
      </div>
      <div className={styles.seasonTabs} role="tablist" aria-label="案件季节">
        {HOME_CINEMA.seasons.map((season, index) => {
          const entries = CASE_CATALOG.filter(
            (entry) => (entry.seasonId ?? "season-1") === season.id,
          );
          const count = entries.filter((entry) =>
            completed.has(entry.id),
          ).length;
          return (
            <button
              type="button"
              key={season.id}
              id={`tab-${season.id}`}
              ref={(node) => {
                refs.current[index] = node;
              }}
              role="tab"
              aria-selected={selected === season.id}
              aria-controls="active-season-cases"
              tabIndex={selected === season.id ? 0 : -1}
              className={styles.seasonPoster}
              onClick={() => onSelect(season.id)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <img
                src={season.image}
                alt=""
                width={640}
                height={800}
                loading="lazy"
                style={{ objectPosition: season.focus }}
              />
              <span className={styles.seasonSelected} aria-hidden="true">
                <CheckIcon size={14} weight="bold" />
                当前季
              </span>
              <span className={styles.seasonCopy}>
                <span className={styles.seasonNumber}>
                  SEASON {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.seasonName}>
                  {SEASON_LABELS[index]}
                  <span>
                    {count} / {entries.length}
                    <span className="srOnly"> 已结案</span>
                  </span>
                </span>
                <span className={styles.seasonSubtitle}>
                  {entries[0]?.seasonTitle?.split(/[:：]/).slice(1).join("：")}
                </span>
              </span>
              <span
                className={styles.seasonProgress}
                style={{ width: `${(count / entries.length) * 100}%` }}
              />
            </button>
          );
        })}
      </div>
      <p className={styles.seasonNote}>
        {HOME_CINEMA.seasons.find((season) => season.id === selected)?.line}
        <span>全部案件均可直接进入</span>
      </p>
    </section>
  );
}
