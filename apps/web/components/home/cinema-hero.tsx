import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import type { CaseCatalogEntry } from "@turtle-soup/mystery-core";
import { HOME_CINEMA, homeCaseArt } from "@/lib/home-cinema-assets";
import styles from "../case-select.module.css";

export function CinemaHero({
  entry,
  state,
  difficulty,
}: {
  entry: CaseCatalogEntry;
  state: "new" | "continue" | "closed";
  difficulty: string;
}) {
  const coldRoom = entry.id === "c01-cold-room-knock";
  const art = homeCaseArt(entry.id);
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <picture className={styles.heroScene}>
        <source
          media="(max-width: 600px)"
          srcSet={coldRoom ? HOME_CINEMA.hero.mobile : art.image}
        />
        <img
          src={coldRoom ? HOME_CINEMA.hero.desktop : art.image}
          alt=""
          width={2304}
          height={1152}
          fetchPriority="high"
          style={{
            objectPosition: coldRoom ? HOME_CINEMA.hero.focus : art.focus,
          }}
        />
      </picture>
      <header className={styles.header}>
        <a className={styles.brand} href="#main-content" aria-label="深汤首页">
          <span>深汤</span>
          <small>THE BLACK SOUP</small>
        </a>
        <nav aria-label="首页导航">
          <a href="#case-library">全部案件</a>
          <a href="#local-archive">本地存档</a>
        </nav>
      </header>
      <div className={styles.heroContent}>
        <p className={styles.heroKicker}>
          {state === "continue"
            ? "未完的调查"
            : state === "closed"
              ? "重返案发现场"
              : "今夜的谜案"}
          <span>CASE {entry.id.match(/^c(\d+)/)?.[1]}</span>
        </p>
        <h1
          id="hero-title"
          className={coldRoom ? styles.coldRoomTitle : styles.otherTitle}
        >
          {coldRoom ? (
            <>
              冷藏室的
              <br />
              敲门声
            </>
          ) : (
            entry.title
          )}
        </h1>
        <p className={styles.heroStory}>
          {coldRoom ? (
            <>
              凌晨两点，封闭的冷藏室里传出三下敲击。
              <br />
              监控里，研究员一小时前已经离开。
            </>
          ) : (
            entry.surface
              .split(/(?<=[。！？])/u)
              .slice(0, 2)
              .join("")
          )}
        </p>
        <p className={styles.heroMeta}>
          <span>{difficulty}</span>
          <span>
            {entry.targetMinutes.min}–{entry.targetMinutes.max} 分钟
          </span>
          {state === "continue" && <span>进度已保存</span>}
          {state === "closed" && <span>已结案</span>}
        </p>
        <div className={styles.heroActions}>
          <Link
            prefetch={false}
            className={styles.primaryButton}
            href={`/case/${entry.id}`}
          >
            <span>
              {state === "continue"
                ? "继续调查"
                : state === "closed"
                  ? "回看案件"
                  : "开始调查"}
            </span>
            <ArrowRightIcon size={23} weight="light" aria-hidden="true" />
          </Link>
          <a className={styles.browseLink} href="#case-library">
            浏览全部案件
            <ArrowRightIcon size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className={styles.heroCaption} aria-hidden="true">
        <span>{coldRoom ? "深夜 · 一间上锁的房间" : entry.title}</span>
        <span>THE TRUTH IS IN THE DETAILS</span>
      </div>
    </section>
  );
}
