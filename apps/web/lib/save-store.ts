import { validateSaveEnvelope, type SaveEnvelope } from "@turtle-soup/mystery-core";

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

export class SaveStoreError extends Error {
  constructor(public readonly code: "read" | "write" | "quota" | "invalid", message: string) {
    super(message);
    this.name = "SaveStoreError";
  }
}

function writeError(error: DOMException | null): SaveStoreError {
  return error?.name === "QuotaExceededError"
    ? new SaveStoreError("quota", "浏览器本地空间不足，无法保存进度")
    : new SaveStoreError("write", "无法写入本地存档");
}

export async function loadCaseSave(caseId: string): Promise<unknown> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(caseId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new SaveStoreError("read", "无法读取本地存档"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveCase(save: SaveEnvelope): Promise<void> {
  const validation = validateSaveEnvelope(save);
  if (!validation.ok) throw new SaveStoreError("invalid", validation.reason);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    try {
      transaction.objectStore(STORE_NAME).put(validation.value, validation.value.caseId);
    } catch (error) {
      database.close();
      reject(writeError(error instanceof DOMException ? error : null));
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(writeError(transaction.error));
  });
}

export async function listCaseSaves(): Promise<SaveEnvelope[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(((request.result as unknown[]) ?? []).flatMap((value) => {
      const validation = validateSaveEnvelope(value);
      return validation.ok ? [validation.value] : [];
    }));
    request.onerror = () => reject(new SaveStoreError("read", "无法读取案件存档"));
    transaction.oncomplete = () => database.close();
  });
}

export async function importCaseSaves(saves: SaveEnvelope[]): Promise<void> {
  const validated = saves.map(validateSaveEnvelope);
  const failure = validated.find((result) => !result.ok);
  if (failure && !failure.ok) throw new SaveStoreError("invalid", failure.reason);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    try {
      for (const result of validated) if (result.ok) transaction.objectStore(STORE_NAME).put(result.value, result.value.caseId);
    } catch (error) {
      database.close();
      reject(writeError(error instanceof DOMException ? error : null));
      return;
    }
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(writeError(transaction.error));
  });
}
