import type { EvidencePlayerState, GameCommand, SaveEnvelope } from "./types.ts";

export type SaveValidationCode = "invalid" | "unsupported_schema" | "incompatible";

export type SaveValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SaveValidationCode; reason: string };

export interface SaveIdentity {
  caseVersion: number;
  contentHash: string;
}

export interface SaveArchive {
  archiveSchemaVersion: 1;
  product: "turtle-soup";
  exportedAt: string;
  saves: SaveEnvelope[];
}

const EVIDENCE_STATES = new Set<EvidencePlayerState>([
  "available",
  "discovered",
  "examined",
  "connected",
  "verified",
  "dismissed",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown, maxLength = 256): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function theoryId(value: unknown): "theory-a" | "theory-b" | undefined {
  return value === "theory-a" || value === "theory-b" ? value : undefined;
}

function sanitizeCommand(value: unknown): GameCommand | undefined {
  const item = record(value);
  if (!item || typeof item.type !== "string") return undefined;
  const id = (key: string) => text(item[key]);
  const draftId = () => theoryId(item.theoryId);

  switch (item.type) {
    case "start_case": return { type: "start_case" };
    case "ask_text": {
      const rawText = text(item.rawText, 2_000);
      return rawText ? { type: "ask_text", rawText } : undefined;
    }
    case "ask_resolved_text": {
      const rawText = text(item.rawText, 2_000);
      const queryId = id("queryId");
      const contextHash = text(item.contextHash, 128);
      return rawText && queryId && contextHash && item.resolutionSource === "ai-confirmed"
        ? { type: "ask_resolved_text", rawText, queryId, resolutionSource: "ai-confirmed", contextHash }
        : undefined;
    }
    case "confirm_interpretation": {
      const queryId = id("queryId");
      return queryId ? { type: "confirm_interpretation", queryId } : undefined;
    }
    case "undo_last_question": return { type: "undo_last_question" };
    case "visit_location": {
      const locationId = id("locationId");
      return locationId ? { type: "visit_location", locationId } : undefined;
    }
    case "set_evidence_state": {
      const evidenceId = id("evidenceId");
      const state = item.state as EvidencePlayerState;
      return evidenceId && EVIDENCE_STATES.has(state) ? { type: "set_evidence_state", evidenceId, state } : undefined;
    }
    case "select_theory": {
      const value = draftId();
      return value ? { type: "select_theory", theoryId: value } : undefined;
    }
    case "set_theory_hypothesis": {
      const value = draftId();
      const hypothesisId = id("hypothesisId");
      return value && hypothesisId ? { type: "set_theory_hypothesis", theoryId: value, hypothesisId } : undefined;
    }
    case "upsert_theory_event": {
      const value = draftId();
      const eventId = id("eventId");
      const index = item.index;
      if (!value || !eventId || (index !== undefined && (!Number.isInteger(index) || Number(index) < 0 || Number(index) > 1_000))) return undefined;
      return index === undefined
        ? { type: "upsert_theory_event", theoryId: value, eventId }
        : { type: "upsert_theory_event", theoryId: value, eventId, index: Number(index) };
    }
    case "remove_theory_event": {
      const value = draftId();
      const eventId = id("eventId");
      return value && eventId ? { type: "remove_theory_event", theoryId: value, eventId } : undefined;
    }
    case "move_theory_event": {
      const value = draftId();
      const eventId = id("eventId");
      const direction = item.direction;
      return value && eventId && (direction === -1 || direction === 1)
        ? { type: "move_theory_event", theoryId: value, eventId, direction }
        : undefined;
    }
    case "link_theory_evidence": {
      const value = draftId();
      const evidenceId = id("evidenceId");
      return value && evidenceId && typeof item.linked === "boolean"
        ? { type: "link_theory_evidence", theoryId: value, evidenceId, linked: item.linked }
        : undefined;
    }
    case "set_theory_motive": {
      const value = draftId();
      const motiveKey = item.motiveKey === undefined ? undefined : id("motiveKey");
      return value && (item.motiveKey === undefined || motiveKey)
        ? { type: "set_theory_motive", theoryId: value, motiveKey }
        : undefined;
    }
    case "submit_theory": {
      const value = draftId();
      return value ? { type: "submit_theory", theoryId: value } : undefined;
    }
    case "request_proof_replay": return { type: "request_proof_replay" };
    case "place_reasoning_item": {
      const boardId = id("boardId");
      const slotId = id("slotId");
      const itemId = id("itemId");
      return boardId && slotId && itemId ? { type: "place_reasoning_item", boardId, slotId, itemId } : undefined;
    }
    case "remove_reasoning_item": {
      const boardId = id("boardId");
      const slotId = id("slotId");
      return boardId && slotId ? { type: "remove_reasoning_item", boardId, slotId } : undefined;
    }
    case "connect_reasoning_items":
    case "disconnect_reasoning_items": {
      const boardId = id("boardId");
      const fromItemId = id("fromItemId");
      const toItemId = id("toItemId");
      const relation = id("relation");
      return boardId && fromItemId && toItemId && relation
        ? { type: item.type, boardId, fromItemId, toItemId, relation }
        : undefined;
    }
    case "set_replay_mode": {
      const mode = item.mode;
      return mode === "standard" || mode === "limited-questions" || mode === "minimal-proof" || mode === "no-scaffolds"
        ? { type: "set_replay_mode", mode }
        : undefined;
    }
    case "restart_case": return { type: "restart_case" };
    default: return undefined;
  }
}

function sanitizeSettings(value: unknown): SaveEnvelope["settings"] | undefined {
  if (value === undefined) return undefined;
  const item = record(value);
  if (!item) return undefined;
  const booleanKeys = ["muted", "reducedMotion", "highContrast"] as const;
  for (const key of booleanKeys) if (item[key] !== undefined && typeof item[key] !== "boolean") return undefined;
  const numberKeys = ["ambientVolume", "effectsVolume"] as const;
  for (const key of numberKeys) {
    const number = item[key];
    if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 1)) return undefined;
  }
  return {
    muted: item.muted as boolean | undefined,
    reducedMotion: item.reducedMotion as boolean | undefined,
    highContrast: item.highContrast as boolean | undefined,
    ambientVolume: item.ambientVolume as number | undefined,
    effectsVolume: item.effectsVolume as number | undefined,
  };
}

export function validateSaveEnvelope(value: unknown): SaveValidationResult<SaveEnvelope> {
  const item = record(value);
  if (!item) return { ok: false, code: "invalid", reason: "存档不是对象" };
  if (item.schemaVersion !== 1) return { ok: false, code: "unsupported_schema", reason: "存档格式版本不受支持" };
  const caseId = text(item.caseId);
  const contentHash = text(item.contentHash);
  if (!caseId || !contentHash || !Number.isInteger(item.caseVersion) || Number(item.caseVersion) <= 0) {
    return { ok: false, code: "invalid", reason: "案件身份字段缺失或无效" };
  }
  if (!Array.isArray(item.commands) || item.commands.length > 10_000) {
    return { ok: false, code: "invalid", reason: "命令日志缺失或过长" };
  }
  const commands = item.commands.map(sanitizeCommand);
  const invalidCommand = commands.findIndex((command) => !command);
  if (invalidCommand >= 0) return { ok: false, code: "invalid", reason: `命令日志第 ${invalidCommand + 1} 项无效` };
  const updatedAt = text(item.updatedAt);
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return { ok: false, code: "invalid", reason: "更新时间无效" };
  if (item.completed !== undefined && typeof item.completed !== "boolean") return { ok: false, code: "invalid", reason: "结案状态无效" };
  const settings = sanitizeSettings(item.settings);
  if (item.settings !== undefined && !settings) return { ok: false, code: "invalid", reason: "设置字段无效" };
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      caseId,
      caseVersion: Number(item.caseVersion),
      contentHash,
      commands: commands as GameCommand[],
      updatedAt,
      ...(settings ? { settings } : {}),
      ...(typeof item.completed === "boolean" ? { completed: item.completed } : {}),
    },
  };
}

export function validateCompatibleSave(value: unknown, caseId: string, identity: SaveIdentity): SaveValidationResult<SaveEnvelope> {
  const validation = validateSaveEnvelope(value);
  if (!validation.ok) return validation;
  const save = validation.value;
  if (save.caseId !== caseId || save.caseVersion !== identity.caseVersion || save.contentHash !== identity.contentHash) {
    return { ok: false, code: "incompatible", reason: "存档属于其他案件或内容版本" };
  }
  return validation;
}

export function createSaveArchive(saves: unknown[], exportedAt = new Date().toISOString()): SaveArchive {
  const validated = saves.map(validateSaveEnvelope);
  const failure = validated.find((result) => !result.ok);
  if (failure && !failure.ok) throw new Error(failure.reason);
  return {
    archiveSchemaVersion: 1,
    product: "turtle-soup",
    exportedAt,
    saves: validated.map((result) => result.ok ? result.value : neverResult()),
  };
}

function neverResult(): never {
  throw new Error("unreachable validation state");
}

export function validateSaveArchive(value: unknown, identities?: Readonly<Record<string, SaveIdentity>>): SaveValidationResult<SaveArchive> {
  const item = record(value);
  if (!item || item.product !== "turtle-soup") return { ok: false, code: "invalid", reason: "不是 TURTLE SOUP 存档包" };
  if (item.archiveSchemaVersion !== 1) return { ok: false, code: "unsupported_schema", reason: "存档包版本不受支持" };
  const exportedAt = text(item.exportedAt);
  if (!exportedAt || Number.isNaN(Date.parse(exportedAt)) || !Array.isArray(item.saves) || item.saves.length > 50) {
    return { ok: false, code: "invalid", reason: "存档包结构无效" };
  }
  const saves: SaveEnvelope[] = [];
  const seen = new Set<string>();
  for (const candidate of item.saves) {
    const validation = validateSaveEnvelope(candidate);
    if (!validation.ok) return validation;
    const save = validation.value;
    if (seen.has(save.caseId)) return { ok: false, code: "invalid", reason: `案件 ${save.caseId} 重复` };
    seen.add(save.caseId);
    const identity = identities?.[save.caseId];
    if (identities && !identity) return { ok: false, code: "incompatible", reason: `未知案件 ${save.caseId}` };
    if (identity && (save.caseVersion !== identity.caseVersion || save.contentHash !== identity.contentHash)) {
      return { ok: false, code: "incompatible", reason: `案件 ${save.caseId} 的内容版本不兼容` };
    }
    saves.push(save);
  }
  return { ok: true, value: { archiveSchemaVersion: 1, product: "turtle-soup", exportedAt, saves } };
}
