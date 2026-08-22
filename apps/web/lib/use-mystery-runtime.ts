"use client";

import type { GameCommand, GameEvent, PlayerProjection } from "@turtle-soup/mystery-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCaseSave, saveCase } from "./save-store";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "./worker-protocol";

const CASE_ID = "c01-cold-room-knock";

export function useMysteryRuntime() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [projection, setProjection] = useState<PlayerProjection>();
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const worker = new Worker(new URL("../workers/mystery-runtime.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    let active = true;

    worker.onmessage = (message: MessageEvent<RuntimeWorkerResponse>) => {
      if (!active) return;
      setProjection(message.data.projection);
      setEvents(message.data.events);
      setStatus("ready");
      setSaveState("saving");
      void saveCase(message.data.save)
        .then(() => active && setSaveState("saved"))
        .catch(() => active && setSaveState("error"));
    };
    worker.onerror = () => active && setStatus("error");

    void loadCaseSave(CASE_ID)
      .then((save) => {
        if (!active) return;
        const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "initialize", save };
        worker.postMessage(request);
      })
      .catch(() => {
        if (!active) return;
        const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "initialize" };
        worker.postMessage(request);
      });

    return () => {
      active = false;
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const dispatch = useCallback((command: GameCommand) => {
    const worker = workerRef.current;
    if (!worker) return;
    const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "command", command };
    worker.postMessage(request);
  }, []);

  return { projection, events, status, saveState, dispatch };
}
