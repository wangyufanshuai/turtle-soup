import {
  createRuntimeState,
  reduceGameCommand,
  type CaseFile,
  type GameCommand,
  type RuntimeState,
  type SaveEnvelope,
} from "../../packages/mystery-core/src/index.ts";

function publicHypothesisId(caseFile: CaseFile, id: string): string {
  if (id === caseFile.solutionCertificate.canonicalHypothesisId) return caseFile.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical";
  const aliases: Record<string, string> = { "hypothesis-fang-entered": "path-late-entry", "hypothesis-guard-faked": "path-corridor-fake" };
  return aliases[id] ?? `path-${id.replace(/^hypothesis-/, "")}`;
}

function publicEventId(caseFile: CaseFile, id: string): string {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === id);
  return `event-${String(index + 1).padStart(2, "0")}`;
}

function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand, commands: GameCommand[]) {
  const result = reduceGameCommand(caseFile, state, command);
  if (result.accepted) commands.push(command);
  return result;
}

function ask(caseFile: CaseFile, state: RuntimeState, rawText: string, commands: GameCommand[]): RuntimeState {
  const result = apply(caseFile, state, { type: "ask_text", rawText }, commands);
  const interpretation = result.events.find((event) => event.type === "interpretation_required");
  if (interpretation?.type === "interpretation_required" && interpretation.interpretation.candidates[0]) {
    return apply(caseFile, result.state, { type: "confirm_interpretation", queryId: interpretation.interpretation.candidates[0].queryId }, commands).state;
  }
  return result.state;
}

export function createCanonicalSave(caseFile: CaseFile): SaveEnvelope {
  let state = createRuntimeState(caseFile);
  const commands: GameCommand[] = [];
  const askAll = () => {
    for (const query of caseFile.questionSemantics) state = ask(caseFile, state, query.examplePhrases?.[0] ?? query.id, commands);
  };
  askAll();
  for (let pass = 0; pass < 3; pass += 1) {
    askAll();
    for (const location of caseFile.entities.filter((entity) => entity.kind === "location")) state = apply(caseFile, state, { type: "visit_location", locationId: entityId(location.id) }, commands).state;
    for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: entityId(evidence.id), state: "examined" }, commands).state;
  }
  const canonical = caseFile.solutionCertificate.canonicalHypothesisId;
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId(caseFile, canonical) }, commands).state;
  for (const evidenceId of caseFile.solutionCertificate.requiredEvidenceIds) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true }, commands).state;
  for (const eventId of caseFile.hypotheses.find((item) => item.id === canonical)?.claim?.eventIds ?? []) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) }, commands).state;
  const motiveKey = caseFile.solutionCertificate.acceptedMotiveKeys?.[0];
  if (motiveKey) state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey }, commands).state;
  for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
    const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
    for (const [slotIndex, slot] of board.slots.entries()) state = apply(caseFile, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) }, commands).state;
    for (const connection of caseFile.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id).flatMap((item) => item.requiredConnections ?? []) ?? []) state = apply(caseFile, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation }, commands).state;
  }
  state = apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }, commands).state;
  state = apply(caseFile, state, { type: "request_proof_replay" }, commands).state;
  if (!state.solved) throw new Error(`Canonical browser fixture did not solve ${caseFile.id}`);
  return {
    schemaVersion: 1,
    caseId: caseFile.id,
    caseVersion: caseFile.metadata?.contentVersion ?? 1,
    contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
    commands,
    updatedAt: new Date().toISOString(),
    completed: true,
  };
}

function entityId(value: string) {
  return value;
}
