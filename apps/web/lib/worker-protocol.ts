import type { CaseId, GameCommand, GameEvent, PlayerProjection, SaveEnvelope } from "@turtle-soup/mystery-core";

export type RestoreStatus = "new" | "restored" | "incompatible" | "corrupt";

export type RuntimeWorkerRequest =
  | { id: number; type: "initialize"; caseId: CaseId; save?: unknown }
  | { id: number; type: "command"; command: GameCommand };

export type RuntimeWorkerResponse = {
  id: number;
  type?: "result";
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
  save: SaveEnvelope;
  restoreStatus?: RestoreStatus;
} | {
  id: number;
  type: "error";
  code: "case_load_failed" | "not_initialized";
  message: string;
  restoreStatus?: undefined;
};
