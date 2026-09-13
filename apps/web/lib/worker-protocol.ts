import type { CaseId, GameCommand, GameEvent, PlayerProjection, QuestionRoutingOffer, SaveEnvelope } from "@turtle-soup/mystery-core";

export type RestoreStatus = "new" | "restored" | "incompatible" | "corrupt";

export type RuntimeWorkerRequest =
  | { id: number; type: "initialize"; caseId: CaseId; save?: unknown; saveReadFailed?: boolean }
  | { id: number; type: "prepare_question_routing"; rawText: string }
  | { id: number; type: "command"; command: GameCommand };

export type RuntimeWorkerResponse = {
  id: number;
  type?: "result";
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
  save: SaveEnvelope;
  restoreStatus?: RestoreStatus;
  persistenceBlocked?: boolean;
  recoverySave?: SaveEnvelope;
} | {
  id: number;
  type: "routing_context";
  offer: QuestionRoutingOffer;
} | {
  id: number;
  type: "error";
  code: "case_load_failed" | "not_initialized" | "invalid_request" | "runtime_failed";
  message: string;
  restoreStatus?: undefined;
};
