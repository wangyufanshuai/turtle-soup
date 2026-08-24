import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createRuntimeState, normalizeQuestion, projectPlayerState, reduceGameCommand, replayCommands, validateBoardBehavior, validateCaseShape, validateCompatibleSave, type CaseFile, type GameCommand, type QueryCorpusEntry, type RuntimeState, type SaveEnvelope } from "./index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const caseDir = resolve(root, "content/zh/cases");
const manifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.season4.v1.3.json"), "utf8")) as { status: string; publishable: boolean; humanEvaluation: { status: string; participants: number }; cases: Array<{ id: string; file: string }> };
const cases = manifest.cases.map((entry) => JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as CaseFile);

function publicEventId(caseFile: CaseFile, eventId: string) { const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === eventId); return `event-${String(index + 1).padStart(2, "0")}`; }
function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand, log?: GameCommand[]) { const result = reduceGameCommand(caseFile, state, command); assert.equal(result.accepted, true, `${caseFile.id}:${command.type}:${JSON.stringify(result.events)}`); log?.push(command); return result.state; }
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

test("Season 4 is a public preview with 24 non-leaking cases", () => {
  assert.equal(manifest.status, "public-preview"); assert.equal(manifest.publishable, false); assert.deepEqual(manifest.humanEvaluation, { status: "pending", participants: 0, requiredBeforePublish: true }); assert.equal(cases.length, 24);
  for (const caseFile of cases) { validateCaseShape(caseFile); assert.ok(caseFile.events.length >= 10 && caseFile.events.length <= 14, caseFile.id); assert.ok(caseFile.facts.length >= 16 && caseFile.facts.length <= 22, caseFile.id); assert.ok(caseFile.evidenceItems.length >= 10 && caseFile.evidenceItems.length <= 14, caseFile.id); assert.ok(caseFile.proofReplay.length >= 6, caseFile.id); assert.equal(caseFile.solutionCertificate.minimumProofSets.length, 2, caseFile.id); assert.ok((caseFile.reasoningBoards?.length ?? 0) >= 2, caseFile.id); const serialized = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile))); assert.equal(serialized.includes("solutionCertificate"), false, caseFile.id); assert.equal(serialized.includes(caseFile.solutionCertificate.canonicalHypothesisId), false, caseFile.id); for (const fact of caseFile.facts) assert.equal(serialized.includes(fact.id), false, `${caseFile.id}:${fact.id}`); for (const event of caseFile.events) assert.equal(serialized.includes(event.id), false, `${caseFile.id}:${event.id}`); }
});

test("Season 4 board combinations and corpora are distinct and fail closed", async () => {
  const fingerprints = cases.map((item) => (item.reasoningBoards ?? []).map((board) => board.mode).join("+")); assert.equal(new Set(fingerprints).size, fingerprints.length);
  let total = 0;
  for (const caseFile of cases) { const code = caseFile.id.match(/^(c\d+)/)?.[1] ?? ""; const imported = await import(pathToFileURL(resolve(caseDir, `${code}-question-corpus.ts`)).href) as Record<string, unknown>; const corpus = Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? []; assert.ok(corpus.length >= 220, caseFile.id); const normalized = corpus.filter((item) => item.expectedStatus === "matched").map((item) => normalizeQuestion(caseFile, item.rawQuestion).normalizedText); assert.ok(1 - new Set(normalized).size / normalized.length < 0.1, caseFile.id); total += corpus.length; for (const vector of corpus) { const result = normalizeQuestion(caseFile, vector.rawQuestion); assert.equal(result.status, vector.expectedStatus, vector.id); if (vector.expectedQueryId) assert.equal(result.queryId, vector.expectedQueryId, vector.id); } }
  assert.ok(total >= 5280, String(total));
});

test("both Season 4 minimum proof sets solve, mutations fail, and red herrings stay optional", () => {
  for (const caseFile of cases) for (const proofSet of caseFile.solutionCertificate.minimumProofSets) { const solved = finish(caseFile, proofSet.evidenceIds); assert.equal(solved.solved, true, `${caseFile.id}:${proofSet.id}`); for (const evidenceId of proofSet.evidenceIds) assert.equal(finish(caseFile, proofSet.evidenceIds.filter((id) => id !== evidenceId)).solved, false, `${caseFile.id}:${proofSet.id}:${evidenceId}`); const redHerring = caseFile.evidenceItems.find((item) => item.importance === "irrelevant"); assert.ok(redHerring); assert.equal(proofSet.evidenceIds.includes(redHerring.id), false, caseFile.id); }
});

test("Season 4 commands replay and old schema saves remain isolated", () => {
  for (const caseFile of cases) { const commands: GameCommand[] = []; const state = finish(caseFile, undefined, true, commands); const replayed = replayCommands(caseFile, commands); assert.deepEqual(projectPlayerState(caseFile, replayed.state), projectPlayerState(caseFile, state), caseFile.id); const save: SaveEnvelope = { schemaVersion: 1, caseId: caseFile.id, caseVersion: 1, contentHash: caseFile.metadata?.canonicalHash ?? "", commands, updatedAt: new Date(0).toISOString(), completed: true }; assert.equal(validateCompatibleSave(save, caseFile.id, { caseVersion: 1, contentHash: save.contentHash }).ok, true); assert.equal(validateCompatibleSave(save, cases.find((item) => item.id !== caseFile.id)!.id, { caseVersion: 1, contentHash: save.contentHash }).ok, false); }
});

test("C60 chapters and replay modes reset deterministically", () => {
  const c60 = cases.find((item) => item.id.startsWith("c60-")); assert.ok(c60); assert.equal(c60.chapters?.length, 2); const solved = finish(c60); for (const challenge of c60.replayChallenges ?? []) { const result = reduceGameCommand(c60, solved, { type: "set_replay_mode", mode: challenge.mode }); assert.equal(result.accepted, true, challenge.mode); assert.equal(result.state.solved, false); assert.equal(result.state.replayMode, challenge.mode); }
});

test("Season 4 board modes expose distinct interaction contracts", () => {
  const fingerprints = new Set<string>();
  for (const caseFile of cases) for (const board of caseFile.reasoningBoards ?? []) {
    assert.equal(validateBoardBehavior(board.mode, board.allowedRelations ?? []), true, `${caseFile.id}:${board.mode}`);
    const projection = projectPlayerState(caseFile, createRuntimeState(caseFile));
    const projected = projection.reasoningBoards.find((item) => item.mode === board.mode);
    assert.ok(projected?.behavior, `${caseFile.id}:${board.mode}`);
    fingerprints.add(`${projected?.behavior?.interaction}:${projected?.behavior?.slotRoles.join("/")}:${projected?.behavior?.connectionVerbs.join("/")}`);
  }
  assert.ok(fingerprints.size >= 15, String(fingerprints.size));
});
