import type { GameCommand, GameEvent, PlayerProjection, SaveEnvelope } from "@turtle-soup/mystery-core";

export type RuntimeWorkerRequest =
  | { id: number; type: "initialize"; save?: SaveEnvelope }
  | { id: number; type: "command"; command: GameCommand };

export interface RuntimeWorkerResponse {
  id: number;
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
  save: SaveEnvelope;
  restoreStatus?: "new" | "restored" | "incompatible";
}
