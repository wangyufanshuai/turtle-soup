"use client";

import type { GameEvent, PlayerProjection } from "@turtle-soup/mystery-core";
import type { CSSProperties } from "react";
import { deriveInvestigationMomentum, type MomentumArea } from "@/lib/investigation-momentum";
import styles from "./momentum-rail.module.css";

export function MomentumRail({
  projection,
  events,
  openingMoves,
  onNavigate,
}: {
  projection: PlayerProjection;
  events: readonly GameEvent[];
  openingMoves?: readonly [string, string, string];
  onNavigate: (area: MomentumArea) => void;
}) {
  const momentum = deriveInvestigationMomentum(projection, events, openingMoves);
  return <aside className={styles.rail} data-momentum-stage={momentum.stage} data-collection-risk={momentum.collectionRisk || undefined} aria-label="调查推进">
    <div className={styles.copy}>
      <small>MOMENTUM / {String(momentum.score).padStart(2, "0")}</small>
      <b>{momentum.headline}</b>
      <p>{momentum.detail}</p>
    </div>
    <ol aria-label="首次调查节拍">
      {momentum.beats.map((beat, index) => <li key={beat.id} data-done={beat.done || undefined}><span>{beat.done ? "✓" : index + 1}</span><small>{beat.label}</small></li>)}
    </ol>
    <button type="button" onClick={() => onNavigate(momentum.nextArea)}>{momentum.nextAction}<span aria-hidden="true">→</span></button>
    <div className={styles.meter} role="progressbar" aria-label="调查推进代理，不代表答案正确率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={momentum.score}><i style={{ "--momentum": `${momentum.score}%` } as CSSProperties} /></div>
  </aside>;
}
