import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createRuntimeState, normalizeQuestion, projectPlayerState, reduceGameCommand, replayCommands, validateBoardBehavior, validateCaseShape, validateCompatibleSave, type CaseFile, type GameCommand, type QueryCorpusEntry, type RuntimeState, type SaveEnvelope } from "./index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const caseDir = resolve(root, "content/zh/cases");
const manifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.season5.v2.5.json"), "utf8")) as { status: string; publishable: boolean; humanEvaluation: { status: string; participants: number }; cases: Array<{ id: string; file: string }> };
const cases = manifest.cases.map((entry) => JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as CaseFile);

function publicEventId(caseFile: CaseFile, eventId: string) { const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === eventId); return `event-${String(index + 1).padStart(2, "0")}`; }
function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand, log?: GameCommand[]) { const result = reduceGameCommand(caseFile, state, command); assert.equal(result.accepted, true, `${caseFile.id}:${command.type}`); log?.push(command); return result.state; }
function finish(caseFile: CaseFile, evidenceIds = caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, includeBoards = true, log?: GameCommand[]) {
  let state = createRuntimeState(caseFile);
  for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }, log);
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-canonical" }, log);
  for (const evidenceId of evidenceIds) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true }, log);
  const canonical = caseFile.hypotheses.find((hypothesis) => hypothesis.kind === "canonical");
  for (const eventId of canonical?.claim?.eventIds ?? []) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) }, log);
  state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: caseFile.solutionCertificate.acceptedMotiveKeys?.[0] }, log);
  if (includeBoards) for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
    const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
    for (const [slotIndex, slot] of board.slots.entries()) state = apply(caseFile, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) }, log);
    for (const connection of caseFile.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id).flatMap((item) => item.requiredConnections ?? []) ?? []) state = apply(caseFile, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation }, log);
  }
  return apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }, log);
}

test("Season 5 contains 24 internal-RC cases with safe opening projections", () => {
  assert.equal(manifest.status, "internal-rc"); assert.equal(manifest.publishable, false); assert.equal(manifest.humanEvaluation.status, "pending"); assert.equal(manifest.humanEvaluation.participants, 0); assert.equal(cases.length, 24);
  for (const caseFile of cases) { validateCaseShape(caseFile); assert.ok(caseFile.events.length >= 10 && caseFile.events.length <= 15); assert.ok(caseFile.facts.length >= 16 && caseFile.facts.length <= 24); assert.ok(caseFile.evidenceItems.length >= 10 && caseFile.evidenceItems.length <= 15); assert.ok(caseFile.proofReplay.length >= 6); assert.equal(caseFile.solutionCertificate.minimumProofSets.length, 2); assert.ok((caseFile.reasoningBoards?.length ?? 0) >= 2); const serialized = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile))); assert.equal(serialized.includes("solutionCertificate"), false); for (const fact of caseFile.facts) assert.equal(serialized.includes(fact.id), false); for (const event of caseFile.events) assert.equal(serialized.includes(event.id), false); }
});

test("Season 5 board combinations and all 5,280 corpus entries are deterministic", async () => {
  const fingerprints = cases.map((item) => (item.reasoningBoards ?? []).map((board) => board.mode).join("+")); assert.equal(new Set(fingerprints).size, fingerprints.length); let total = 0;
  for (const caseFile of cases) { const code = caseFile.id.match(/^(c\d+)/)?.[1] ?? ""; const imported = await import(pathToFileURL(resolve(caseDir, `${code}-question-corpus.ts`)).href) as Record<string, unknown>; const corpus = Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? []; assert.equal(corpus.length, 220); assert.equal(corpus.filter((item) => item.expectedStatus === "ambiguous").length, 8); total += corpus.length; for (const vector of corpus) { const result = normalizeQuestion(caseFile, vector.rawQuestion); assert.equal(result.status, vector.expectedStatus, vector.id); if (vector.expectedQueryId) assert.equal(result.queryId, vector.expectedQueryId, vector.id); } }
  assert.equal(total, 5280);
});

test("both Season 5 proof sets solve while evidence mutations and wrong theories fail", () => {
  for (const caseFile of cases) { for (const proofSet of caseFile.solutionCertificate.minimumProofSets) { assert.equal(finish(caseFile, proofSet.evidenceIds).solved, true, `${caseFile.id}:${proofSet.id}`); for (const evidenceId of proofSet.evidenceIds) assert.equal(finish(caseFile, proofSet.evidenceIds.filter((id) => id !== evidenceId)).solved, false, `${caseFile.id}:${evidenceId}`); } const redHerring = caseFile.evidenceItems.find((item) => item.importance === "irrelevant"); assert.ok(redHerring); assert.ok(caseFile.solutionCertificate.minimumProofSets.every((set) => !set.evidenceIds.includes(redHerring.id))); }
});

test("Season 5 replays identically and remains save-schema-one isolated", () => {
  for (const caseFile of cases) { const commands: GameCommand[] = []; const state = finish(caseFile, undefined, true, commands); const replayed = replayCommands(caseFile, commands); assert.deepEqual(projectPlayerState(caseFile, replayed.state), projectPlayerState(caseFile, state)); const save: SaveEnvelope = { schemaVersion: 1, caseId: caseFile.id, caseVersion: 1, contentHash: caseFile.metadata?.canonicalHash ?? "", commands, updatedAt: new Date(0).toISOString(), completed: true }; assert.equal(validateCompatibleSave(save, caseFile.id, { caseVersion: 1, contentHash: save.contentHash }).ok, true); assert.equal(validateCompatibleSave(save, cases.find((item) => item.id !== caseFile.id)!.id, { caseVersion: 1, contentHash: save.contentHash }).ok, false); }
});

test("C84 chapters and all Season 5 board interactions are explicit", () => {
  const c84 = cases.find((item) => item.id.startsWith("c84-")); assert.ok(c84); assert.equal(c84.chapters?.length, 2); assert.equal(c84.reasoningBoards?.length, 3); for (const caseFile of cases) for (const board of caseFile.reasoningBoards ?? []) assert.equal(validateBoardBehavior(board.mode, board.allowedRelations ?? []), true, `${caseFile.id}:${board.mode}`);
});
