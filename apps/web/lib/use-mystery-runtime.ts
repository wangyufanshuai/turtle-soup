"use client";

import type { CaseId, GameCommand, GameEvent, PlayerProjection, QuestionRoutingOffer, SaveEnvelope } from "@turtle-soup/mystery-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCaseSave, saveCase } from "./save-store";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "./worker-protocol";

export function useMysteryRuntime(caseId: CaseId) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [projection, setProjection] = useState<PlayerProjection>();
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [restoreStatus, setRestoreStatus] = useState<"new" | "restored" | "incompatible" | "corrupt" | undefined>(undefined);
  const [latestSave, setLatestSave] = useState<SaveEnvelope>();
  const [storageIssue, setStorageIssue] = useState<string>();
  const routingRequestsRef = useRef(new Map<number, { resolve: (offer: QuestionRoutingOffer) => void; reject: (error: Error) => void }>());

  useEffect(() => {
    const worker = new Worker(new URL("../workers/mystery-runtime.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    let active = true;

    worker.onmessage = (message: MessageEvent<RuntimeWorkerResponse>) => {
      if (!active) return;
      if (message.data.type === "routing_context") {
        const pending = routingRequestsRef.current.get(message.data.id);
        if (pending) {
          routingRequestsRef.current.delete(message.data.id);
          pending.resolve(message.data.offer);
        }
        return;
      }
      if (message.data.type === "error") {
        const pending = routingRequestsRef.current.get(message.data.id);
        if (pending) {
          routingRequestsRef.current.delete(message.data.id);
          pending.reject(new Error(message.data.message));
          return;
        }
        setStorageIssue(message.data.message);
        setStatus("error");
        return;
      }
      setProjection(message.data.projection);
      setEvents(message.data.events);
      setRestoreStatus(message.data.restoreStatus);
      setLatestSave(message.data.save);
      setStatus("ready");
      setSaveState("saving");
      void saveCase(message.data.save)
        .then(() => { if (active) { setSaveState("saved"); setStorageIssue(undefined); } })
        .catch((error: unknown) => { if (active) { setSaveState("error"); setStorageIssue(error instanceof Error ? error.message : "本地存档写入失败"); } });
    };
    worker.onerror = () => active && setStatus("error");

    void loadCaseSave(caseId)
      .then((save) => {
        if (!active) return;
        const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "initialize", caseId, save };
        worker.postMessage(request);
      })
      .catch(() => {
        if (!active) return;
        setStorageIssue("浏览器无法读取本地存档；当前调查仍可运行，请在关闭前导出进度。");
        const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "initialize", caseId };
        worker.postMessage(request);
      });

    return () => {
      active = false;
      for (const pending of routingRequestsRef.current.values()) pending.reject(new Error("推理 Worker 已关闭"));
      routingRequestsRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, [caseId]);

  const dispatch = useCallback((command: GameCommand) => {
    const worker = workerRef.current;
    if (!worker) return;
    const request: RuntimeWorkerRequest = { id: ++requestIdRef.current, type: "command", command };
    worker.postMessage(request);
  }, []);

  const prepareQuestionRouting = useCallback((rawText: string) => new Promise<QuestionRoutingOffer>((resolve, reject) => {
    const worker = workerRef.current;
    if (!worker) { reject(new Error("推理 Worker 尚未就绪")); return; }
    const id = ++requestIdRef.current;
    routingRequestsRef.current.set(id, { resolve, reject });
    const request: RuntimeWorkerRequest = { id, type: "prepare_question_routing", rawText };
    worker.postMessage(request);
  }), []);

  const retrySave = useCallback(() => {
    if (!latestSave) return;
    setSaveState("saving");
    void saveCase(latestSave)
      .then(() => { setSaveState("saved"); setStorageIssue(undefined); })
      .catch((error: unknown) => { setSaveState("error"); setStorageIssue(error instanceof Error ? error.message : "本地存档写入失败"); });
  }, [latestSave]);

  return { projection, events, status, saveState, restoreStatus, latestSave, storageIssue, retrySave, dispatch, prepareQuestionRouting };
}
