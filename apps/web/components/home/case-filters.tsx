import { useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import styles from "../case-select.module.css";

export type CompletionFilter = "all" | "open" | "closed" | "progress";
export const DIFFICULTY_LABELS: Record<string, string> = {
  intro: "入门",
  intermediate: "进阶",
  advanced: "高难",
  expert: "专家",
};
export const COMPLETION_LABELS: Record<CompletionFilter, string> = {
  all: "全部状态",
  open: "未结案",
  closed: "已结案",
  progress: "调查中",
};
export const difficultyLabel = (value: string) => DIFFICULTY_LABELS[value] ?? value;
type Option = { value: string; label: string };
type Props = {
  search: string;
  difficulty: string;
  skill: string;
  completion: CompletionFilter;
  resultCount: number;
  skills: Option[];
  difficulties: string[];
  onSearch: (value: string) => void;
  onDifficulty: (value: string) => void;
  onSkill: (value: string) => void;
  onCompletion: (value: CompletionFilter) => void;
  onClear: () => void;
};
export function CaseFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const count =
    Number(props.difficulty !== "all") +
    Number(props.skill !== "all") +
    Number(props.completion !== "all");
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div className={styles.filterArea}>
      <div className={styles.searchRow}>
        <label className={styles.search}>
          <span className="srOnly">搜索当前季</span>
          <MagnifyingGlassIcon size={21} weight="light" aria-hidden="true" />
          <input
            type="search"
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="搜索案件、题面、技能"
            autoComplete="off"
          />
        </label>
        <button
          ref={trigger}
          type="button"
          className={styles.filterToggle}
          aria-expanded={open}
          aria-controls="case-filter-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontalIcon size={20} aria-hidden="true" />
          <span>筛选</span>
          {count > 0 && <b>{count}</b>}
        </button>
      </div>
      <div
        id="case-filter-panel"
        hidden={!open}
        className={styles.filterPanel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className={styles.filterPanelHead}>
          <span>缩小调查范围</span>
          <button type="button" aria-label="收起筛选" onClick={close}>
            <XIcon size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.filters}>
          <label>
            难度
            <select
              value={props.difficulty}
              onChange={(event) => props.onDifficulty(event.target.value)}
            >
              <option value="all">全部难度</option>
              {props.difficulties.map((value) => (
                <option key={value} value={value}>
                  {difficultyLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            推理技能
            <select value={props.skill} onChange={(event) => props.onSkill(event.target.value)}>
              <option value="all">全部技能</option>
              {props.skills.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            档案状态
            <select
              value={props.completion}
              onChange={(event) => props.onCompletion(event.target.value as CompletionFilter)}
            >
              {Object.entries(COMPLETION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={styles.filterSummary}>
        <p role="status" aria-live="polite" aria-atomic="true">
          找到 <b>{props.resultCount}</b> 份案件
          {props.search.trim() ? ` · “${props.search.trim()}”` : ""}
        </p>
        {(count > 0 || props.search) && (
          <div className={styles.activeFilters}>
            {props.difficulty !== "all" && (
              <button
                type="button"
                onClick={() => props.onDifficulty("all")}
                aria-label={`移除难度：${difficultyLabel(props.difficulty)}`}
              >
                {difficultyLabel(props.difficulty)}
                <XIcon size={13} aria-hidden="true" />
              </button>
            )}
            {props.skill !== "all" && (
              <button type="button" onClick={() => props.onSkill("all")} aria-label="移除技能筛选">
                {props.skills.find((option) => option.value === props.skill)?.label}
                <XIcon size={13} aria-hidden="true" />
              </button>
            )}
            {props.completion !== "all" && (
              <button
                type="button"
                onClick={() => props.onCompletion("all")}
                aria-label="移除状态筛选"
              >
                {COMPLETION_LABELS[props.completion]}
                <XIcon size={13} aria-hidden="true" />
              </button>
            )}
            <button type="button" className={styles.clearFilters} onClick={props.onClear}>
              清除全部
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
