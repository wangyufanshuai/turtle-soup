"use client";

import { challengeRotation, normalizeMasteryRecord, type CaseMasteryRecord, type PlayerProjection } from "@turtle-soup/mystery-core";

const DB_NAME = "turtle-soup-mastery-v1";
const STORE_NAME = "case-mastery";
const DB_VERSION = 1;
const FALLBACK_KEY = "black-soup:mastery:v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("indexeddb_unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("mastery_open_failed"));
  });
}

function fallbackRead(): Record<string, CaseMasteryRecord> {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? "{}") as Record<string, CaseMasteryRecord>; } catch { return {}; }
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = fn(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("mastery_request_failed"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("mastery_transaction_failed"));
  });
}

export async function loadMastery(caseId: string, projection?: Pick<PlayerProjection, "case">): Promise<CaseMasteryRecord | undefined> {
  try {
    const value = await withStore<unknown>("readonly", (store) => store.get(caseId));
    return projection ? normalizeMasteryRecord(value, projection.case) : value as CaseMasteryRecord | undefined;
  } catch {
    const value = fallbackRead()[caseId];
    return projection ? normalizeMasteryRecord(value, projection.case) : value;
  }
}

export async function listMastery(): Promise<CaseMasteryRecord[]> {
  try { return await withStore<CaseMasteryRecord[]>("readonly", (store) => store.getAll()); }
  catch { return Object.values(fallbackRead()); }
}

export async function saveMastery(record: CaseMasteryRecord): Promise<void> {
  try { await withStore("readwrite", (store) => store.put(record, record.caseId)); }
  catch {
    const all = fallbackRead(); all[record.caseId] = record;
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(all)); } catch { /* optional local progress */ }
  }
}

export async function clearMastery(): Promise<void> {
  try { await withStore("readwrite", (store) => store.clear()); } catch { /* fallback below */ }
  try { localStorage.removeItem(FALLBACK_KEY); } catch { /* optional */ }
}

export function masterySummary(record: CaseMasteryRecord | undefined) {
  if (!record) return { completedCount: 0, nextChallenge: "complete" as const };
  const rotation = challengeRotation(record);
  return { completedCount: rotation.completedCount, nextChallenge: rotation.nextChallenge };
}

