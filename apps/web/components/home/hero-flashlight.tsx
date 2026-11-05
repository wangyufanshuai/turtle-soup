"use client";

import { useEffect, useRef } from "react";
import styles from "../case-select.module.css";

/**
 * Decorative flashlight beam that follows a fine pointer across the hero.
 * Touch / coarse pointers and reduced-motion users get a fixed, gently
 * breathing beam instead. Writes only CSS custom properties — no re-renders.
 */
export function HeroFlashlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const beam = ref.current;
    const hero = beam?.parentElement;
    if (!beam || !hero) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    let frame = 0;
    let targetX = 0.62;
    let targetY = 0.42;
    let x = targetX;
    let y = targetY;

    const tick = () => {
      // Ease toward the pointer so the beam has a little weight.
      x += (targetX - x) * 0.14;
      y += (targetY - y) * 0.14;
      beam.style.setProperty("--fx", `${(x * 100).toFixed(2)}%`);
      beam.style.setProperty("--fy", `${(y * 100).toFixed(2)}%`);
      if (Math.abs(targetX - x) > 0.001 || Math.abs(targetY - y) > 0.001) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
      }
    };
    const onMove = (event: PointerEvent) => {
      const rect = hero.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width;
      targetY = (event.clientY - rect.top) / rect.height;
      beam.dataset.active = "true";
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      targetX = 0.62;
      targetY = 0.42;
      delete beam.dataset.active;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className={styles.heroFlashlight} aria-hidden="true" />;
}
