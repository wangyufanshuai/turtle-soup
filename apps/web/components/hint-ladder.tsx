"use client";

import { useEffect, useState } from "react";
import type { ProofObligationKind } from "@turtle-soup/mystery-core";
import type { GoldenPathHints } from "@/lib/golden-experience";
import styles from "./hint-ladder.module.css";

const GAP_LABELS: Record<ProofObligationKind, string> = {
  time: "时间关系",
  space: "空间关系",
  source: "来源链",
  identity: "身份关系",
  measurement: "测量模型",
  "state-transition": "状态转换",
  "alternative-exclusion": "替代路径排除",
};

export function HintLadder({ caseId, hints, proofGap, onReveal }: { caseId: string; hints: GoldenPathHints; proofGap?: ProofObligationKind; onReveal: () => void }) {
  const [level, setLevel] = useState(0);
  useEffect(() => setLevel(0), [caseId]);
  const revealNext = () => {
    if (level >= 3) return;
    setLevel((current) => current + 1);
    onReveal();
  };
  const third = proofGap ? `当前缺口类别：${GAP_LABELS[proofGap]}。只补这一类证明，不需要推翻已经成立的部分。` : hints.proofObligation;
  const buttonLabel = level === 0 ? "打开第一层" : level === 1 ? "再具体一点" : "查看证明缺口类型";

  return <aside className={styles.ladder} data-hint-ladder data-hint-level={level} aria-label="渐进式调查提示">
    <header><div><small>OPTIONAL / PROGRESSIVE</small><b>需要一点方向？</b></div>{level < 3 && <button type="button" onClick={revealNext}>{buttonLabel}</button>}</header>
    <ol aria-live="polite">
      {level >= 1 && <li><span>01</span><div><small>概念方向</small><p>{hints.concept}</p></div></li>}
      {level >= 2 && <li><span>02</span><div><small>证据类别</small><p>{hints.evidenceCategory}</p></div></li>}
      {level >= 3 && <li><span>03</span><div><small>证明义务</small><p>{third}</p></div></li>}
    </ol>
    {level === 3 && <p className={styles.end}>提示只描述缺口类型；答案、事件顺序与下一问仍由你决定。</p>}
  </aside>;
}
