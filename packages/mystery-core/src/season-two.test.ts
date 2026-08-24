import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  createRuntimeState,
  normalizeQuestion,
  projectPlayerState,
  reduceGameCommand,
  replayCommands,
  validateCaseShape,
  validateCompatibleSave,
  type CaseFile,
  type GameCommand,
  type QueryCorpusEntry,
  type RuntimeState,
  type SaveEnvelope,
} from "./index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const caseDir = resolve(root, "content/zh/cases");
const manifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.season2.v1.0.json"), "utf8")) as { cases: Array<{ id: string; file: string; canonicalHash: string; contentVersion: number }> };
const cases = manifest.cases.map((entry) => JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as CaseFile);

function publicEventId(caseFile: CaseFile, eventId: string): string {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === eventId);
  return `event-${String(index + 1).padStart(2, "0")}`;
}

function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand, log?: GameCommand[]): RuntimeState {
  const result = reduceGameCommand(caseFile, state, command);
  assert.equal(result.accepted, true, `${caseFile.id}:${command.type}:${JSON.stringify(result.events)}`);
  log?.push(command);
  return result.state;
}

function inspectEverything(caseFile: CaseFile, state: RuntimeState, log?: GameCommand[]): RuntimeState {
  for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }, log);
  return state;
}

function finish(caseFile: CaseFile, selectedEvidence = caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, includeBoard = true, log?: GameCommand[]): RuntimeState {
  let state = inspectEverything(caseFile, createRuntimeState(caseFile), log);
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-canonical" }, log);
  for (const evidenceId of selectedEvidence) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true }, log);
  const canonical = caseFile.hypotheses.find((hypothesis) => hypothesis.kind === "canonical");
  for (const eventId of canonical?.claim?.eventIds ?? []) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) }, log);
  state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: caseFile.solutionCertificate.acceptedMotiveKeys?.[0] }, log);
  if (includeBoard) {
    for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
      const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
      for (const [slotIndex, slot] of board.slots.entries()) state = apply(caseFile, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) }, log);
      for (const connection of caseFile.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id).flatMap((item) => item.requiredConnections ?? []) ?? []) state = apply(caseFile, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation }, log);
    }
  }
  state = apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }, log);
  return state;
}

test("Season 2 contains twelve independently valid, non-leaking cases", () => {
  assert.equal(cases.length, 12);
  for (const caseFile of cases) {
    validateCaseShape(caseFile);
    const projection = projectPlayerState(caseFile, createRuntimeState(caseFile));
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes("solutionCertificate"), false);
    assert.equal(serialized.includes(caseFile.solutionCertificate.canonicalHypothesisId), false);
    for (const fact of caseFile.facts) assert.equal(serialized.includes(fact.id), false, `${caseFile.id}:${fact.id}`);
    for (const event of caseFile.events) assert.equal(serialized.includes(event.id), false, `${caseFile.id}:${event.id}`);
    assert.ok(projection.reasoningBoards.length > 0);
  }
});

test("all 2,800 Season 2 corpus entries normalize exactly or fail closed", async () => {
  let total = 0;
  for (const caseFile of cases) {
    const code = caseFile.id.match(/^(c\d+)/)?.[1];
    const imported = await import(pathToFileURL(resolve(caseDir, `${code}-question-corpus.ts`)).href) as Record<string, unknown>;
    const corpus = Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? [];
    assert.ok(corpus.length >= 220, caseFile.id);
    total += corpus.length;
    for (const vector of corpus) {
      const result = normalizeQuestion(caseFile, vector.rawQuestion);
      if (vector.expectedStatus) assert.equal(result.status, vector.expectedStatus, vector.id);
      if (vector.expectedQueryId) assert.equal(result.queryId, vector.expectedQueryId, vector.id);
    }
  }
  assert.equal(total, 2800);
});

test("every Season 2 case solves through both certified minimum proof sets and replays", () => {
  for (const caseFile of cases) {
    for (const proofSet of caseFile.solutionCertificate.minimumProofSets) {
      let state = finish(caseFile, proofSet.evidenceIds);
      assert.equal(state.solved, true, `${caseFile.id}:${proofSet.id}`);
      state = apply(caseFile, state, { type: "request_proof_replay" });
      assert.equal(state.replayBeatIds.length, caseFile.proofReplay.length, caseFile.id);
    }
  }
});

test("proof boards are mandatory and produce spoiler-safe gap feedback", () => {
  for (const caseFile of cases) {
    const state = finish(caseFile, caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, false);
    assert.equal(state.solved, false, caseFile.id);
  }
});

test("removing any selected minimum-proof evidence blocks solve while red herrings remain unnecessary", () => {
  for (const caseFile of cases) {
    const proof = caseFile.solutionCertificate.minimumProofSets[0].evidenceIds;
    for (const evidenceId of proof) {
      const state = finish(caseFile, proof.filter((id) => id !== evidenceId));
      assert.equal(state.solved, false, `${caseFile.id} solved without ${evidenceId}`);
    }
    const redHerring = caseFile.evidenceItems.find((item) => item.importance === "irrelevant");
    assert.ok(redHerring);
    assert.equal(proof.includes(redHerring.id), false);
    assert.equal(finish(caseFile, proof).solved, true);
  }
});

test("Season 2 command logs replay identically and old save schema remains compatible", () => {
  for (const caseFile of cases) {
    const commands: GameCommand[] = [];
    const state = finish(caseFile, caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, true, commands);
    const replayed = replayCommands(caseFile, commands);
    assert.deepEqual(projectPlayerState(caseFile, replayed.state), projectPlayerState(caseFile, state), caseFile.id);
    const save: SaveEnvelope = { schemaVersion: 1, caseId: caseFile.id, caseVersion: 1, contentHash: caseFile.metadata?.canonicalHash ?? "", commands, updatedAt: new Date(0).toISOString(), completed: true };
    assert.equal(validateCompatibleSave(save, caseFile.id, { caseVersion: 1, contentHash: save.contentHash }).ok, true);
    assert.equal(validateCompatibleSave(save, cases.find((item) => item.id !== caseFile.id)!.id, { caseVersion: 1, contentHash: save.contentHash }).ok, false);
  }
});

test("chapters unlock deterministically and all replay modes reset into a clean challenge", () => {
  for (const caseFile of cases) {
    let state = createRuntimeState(caseFile);
    if ((caseFile.chapters?.length ?? 0) > 1) {
      assert.equal(state.unlockedChapterIds.length, 1);
      state = inspectEverything(caseFile, state);
      assert.equal(state.unlockedChapterIds.length, caseFile.chapters?.length);
    }
    state = finish(caseFile);
    for (const challenge of caseFile.replayChallenges ?? []) {
      const result = reduceGameCommand(caseFile, state, { type: "set_replay_mode", mode: challenge.mode });
      assert.equal(result.accepted, true, `${caseFile.id}:${challenge.mode}`);
      assert.equal(result.state.replayMode, challenge.mode);
      assert.equal(result.state.solved, false);
    }
  }
});
