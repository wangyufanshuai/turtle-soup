"use client";

import { closeDiagnosticSession, diagnosticCsv, newDiagnosticSession, reduceDiagnosticSession, type LocalDiagnosticSession, type GameEvent, type PlayerProjection } from "@turtle-soup/mystery-core";
import { useCallback, useEffect, useRef, useState } from "react";

const DB_NAME = "turtle-soup-diagnostics-v1";
const STORE_NAME = "sessions";
const DB_VERSION = 1;
const SETTINGS_KEY = "black-soup:diagnostics-settings:v1";
const MAX_SESSIONS = 500;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function id() { return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function enabled() { try { return localStorage.getItem(SETTINGS_KEY) !== "off"; } catch { return true; } }
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { if (typeof indexedDB === "undefined") return reject(new Error("diagnostics_indexeddb_unavailable")); const request = indexedDB.open(DB_NAME, DB_VERSION); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "sessionId" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("diagnostics_open_failed")); }); }
async function put(session: LocalDiagnosticSession) { try { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).put(session); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* diagnostics never blocks play */ } }
async function all(): Promise<LocalDiagnosticSession[]> { try { const db = await openDb(); return await new Promise<LocalDiagnosticSession[]>((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readonly"); const request = tx.objectStore(STORE_NAME).getAll(); request.onsuccess = () => { db.close(); resolve(request.result as LocalDiagnosticSession[]); }; request.onerror = () => reject(request.error); }); } catch { return []; } }
async function prune() { const records = (await all()).filter((item) => Date.parse(item.startedAt) >= Date.now() - MAX_AGE_MS).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, MAX_SESSIONS); try { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); store.clear(); records.forEach((record) => store.put(record)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* optional */ } }

export function useLocalDiagnostics(projection: PlayerProjection | undefined, events: GameEvent[]) {
  const [recording, setRecording] = useState(() => enabled());
  const [session, setSession] = useState<LocalDiagnosticSession>();
  const sessionRef = useRef<LocalDiagnosticSession | undefined>(undefined);
  const lastCase = useRef<string | undefined>(undefined);
  useEffect(() => {
    const close = () => {
      const current = sessionRef.current;
      if (!current || current.endedAt) return;
      const closed = closeDiagnosticSession(current);
      sessionRef.current = closed;
      setSession(closed);
      void put(closed);
    };
    window.addEventListener("pagehide", close);
    return () => window.removeEventListener("pagehide", close);
  }, []);
  useEffect(() => {
    if (!projection || lastCase.current === projection.case.id) return;
    if (sessionRef.current && !sessionRef.current.endedAt) {
      const closed = closeDiagnosticSession(sessionRef.current);
      sessionRef.current = closed;
      void put(closed);
    }
    lastCase.current = projection.case.id;
    if (!enabled()) { setRecording(false); return; }
    const next = newDiagnosticSession({ caseId: projection.case.id, caseVersion: projection.case.version, canonicalHash: projection.case.contentHash }, id());
    sessionRef.current = next; setSession(next); void put(next); void prune();
  }, [projection]);
  useEffect(() => { if (!recording || !sessionRef.current || events.length === 0) return; const next = reduceDiagnosticSession(sessionRef.current, events); sessionRef.current = next; setSession(next); void put(next); }, [events, recording]);
  const toggle = useCallback((value: boolean) => { setRecording(value); try { localStorage.setItem(SETTINGS_KEY, value ? "on" : "off"); } catch { /* optional */ } }, []);
  const exportSessions = useCallback(async (format: "json" | "csv") => { const records = await all(); const body = format === "json" ? JSON.stringify(records, null, 2) : diagnosticCsv(records); const blob = new Blob([body], { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `turtle-soup-diagnostics.${format}`; anchor.click(); URL.revokeObjectURL(url); }, []);
  const clear = useCallback(async () => { try { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* optional */ } }, []);
  return { recording, toggle, exportSessions, clear, session };
}
