import type { SaveEnvelope } from "@turtle-soup/mystery-core";

const DB_NAME = "turtle-soup";
const STORE_NAME = "case-saves";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地存档"));
  });
}

export async function loadCaseSave(caseId: string): Promise<SaveEnvelope | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(caseId);
    request.onsuccess = () => resolve(request.result as SaveEnvelope | undefined);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地存档"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveCase(save: SaveEnvelope): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(save, save.caseId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("无法写入本地存档"));
  });
}
