"use client";

import type { GameCommand, QuestionRouteResult, QuestionRoutingOffer } from "@turtle-soup/mystery-core";
import { useEffect, useState } from "react";
import styles from "./ai-interpretation-strip.module.css";

export function AiInterpretationStrip({ offer, route, status, message, latency, dispatch, onCancel, onManual }: { offer?: QuestionRoutingOffer; route?: QuestionRouteResult; status: string; message: string; latency: number; dispatch: (command: GameCommand) => void; onCancel: () => void; onManual: (label: string) => void }) {
  const [manualReady, setManualReady] = useState(false);
  useEffect(() => { if (status !== "working") { setManualReady(false); return; } const timer = setTimeout(() => setManualReady(true), 800); return () => clearTimeout(timer); }, [status, offer?.context.contextHash]);
  if (!offer) return null;
  const selected = route?.status === "matched" ? [route.candidateToken] : route?.status === "ambiguous" ? route.candidateTokens : [];
  const candidates = selected.length ? offer.context.candidates.filter((candidate) => selected.includes(candidate.token)) : offer.context.candidates.slice(0, 3);
  const confirm = (token: string) => {
    const binding = offer.bindings.find((item) => item.token === token);
    if (!binding) return;
    dispatch({ type: "ask_resolved_text", rawText: offer.context.rawQuestion, queryId: binding.queryId, resolutionSource: "ai-confirmed", contextHash: offer.context.contextHash });
  };
  return <div className={styles.strip} data-status={status} role="group" aria-label="确认系统对问题的理解" aria-live="polite">
    <div><small>系统理解</small><b>{message}</b>{status === "ready" && latency > 0 && <span>{latency}ms</span>}</div>
    {status === "working" && !manualReady ? <button type="button" onClick={onCancel}>取消 AI，手动选择</button> : <div className={styles.candidates}>{candidates.map((candidate) => <button type="button" key={candidate.token} onClick={() => route?.status === "matched" || route?.status === "ambiguous" ? confirm(candidate.token) : onManual(candidate.label)}><b>{candidate.label}</b><span>{candidate.target} · {candidate.predicate}</span></button>)}</div>}
    {(status !== "working" || manualReady) && <button type="button" className={styles.manual} onClick={() => onManual(offer.context.rawQuestion)}>{status === "working" ? "AI 仍在处理，先手动改写" : "改写原问题"}</button>}
  </div>;
}
