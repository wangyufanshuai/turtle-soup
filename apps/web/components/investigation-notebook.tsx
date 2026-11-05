"use client";
import { useEffect, useRef } from "react";
import type { PlayerProjection } from "@turtle-soup/mystery-core";
import styles from "./investigation-shell.module.css";

export function InvestigationNotebook({
  projection,
  summary,
  setSummary,
  onClose,
}: {
  projection: PlayerProjection;
  summary: string;
  setSummary: (text: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => previous?.isConnected && previous.focus({ preventScroll: true }));
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.journalDialog}
      aria-modal="true"
      aria-labelledby="journal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <small>随手记 · 自动保存在本机</small>
          <h2 id="journal-title">调查札记</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭调查札记">
          ×
        </button>
      </header>
      <p className={styles.journalPremise}>{projection.case.surface}</p>
      <label>
        全案札记
        <textarea
          name="case-notebook"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={4000}
          placeholder="记录人物、时间，以及还想确认的事…"
        />
        <small>札记不参与判定；暂定解释在每份假设中单独保存。</small>
      </label>
      <section>
        <h3>
          最近核对的事实 <span>{projection.transcript.length} 问</span>
        </h3>
        {projection.transcript.length === 0 ? (
          <p>还没有回答。先在札记里留下你注意到的异常。</p>
        ) : (
          <ol>
            {projection.transcript
              .slice(-8)
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  <p>{entry.interpretedAs}</p>
                  <b>
                    {(
                      {
                        yes: "是",
                        no: "不是",
                        partial: "部分相关",
                        irrelevant: "与真相无关",
                        unknown: "信息不足",
                        invalid_premise: "前提不成立",
                        unanswerable: "无法判断",
                        unrecognized: "无法识别",
                      } as Record<string, string>
                    )[entry.answerCode] ?? "待核对"}
                  </b>
                </li>
              ))}
          </ol>
        )}
      </section>
    </dialog>
  );
}
