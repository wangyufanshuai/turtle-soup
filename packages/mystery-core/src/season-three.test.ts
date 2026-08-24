import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createRuntimeState, normalizeQuestion, projectPlayerState, reduceGameCommand, replayCommands, validateCaseShape, validateCompatibleSave, type CaseFile, type GameCommand, type QueryCorpusEntry, type RuntimeState, type SaveEnvelope } from "./index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const caseDir = resolve(root, "content/zh/cases");
const manifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.season3.v1.1.json"), "utf8")) as { status: string; publishable: boolean; humanEvaluation: { status: string; participants: number }; cases: Array<{ id: string; file: string; canonicalHash: string; contentVersion: number }> };
const cases = manifest.cases.map((entry) => JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as CaseFile);

function publicEventId(caseFile: CaseFile, eventId: string) {
  const index = [...caseFile.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === eventId);
  return `event-${String(index + 1).padStart(2, "0")}`;
}

function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand, log?: GameCommand[]) {
  const result = reduceGameCommand(caseFile, state, command);
  assert.equal(result.accepted, true, `${caseFile.id}:${command.type}:${JSON.stringify(result.events)}`);
  log?.push(command);
  return result.state;
}

function finish(caseFile: CaseFile, evidenceIds = caseFile.solutionCertificate.minimumProofSets[0].evidenceIds, includeBoards = true, log?: GameCommand[]) {
  let state = createRuntimeState(caseFile);
  for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }, log);
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-canonical" }, log);
  for (const evidenceId of evidenceIds) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true }, log);
  const canonical = caseFile.hypotheses.find((hypothesis) => hypothesis.kind === "canonical");
  for (const eventId of canonical?.claim?.eventIds ?? []) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(caseFile, eventId) }, log);
  state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: caseFile.solutionCertificate.acceptedMotiveKeys?.[0] }, log);
  if (includeBoards) {
    for (const [boardIndex, board] of (caseFile.reasoningBoards ?? []).entries()) {
      const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`;
      for (const [slotIndex, slot] of board.slots.entries()) state = apply(caseFile, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(caseFile, slot.acceptsEventIds[0]) }, log);
      for (const connection of caseFile.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id).flatMap((item) => item.requiredConnections ?? []) ?? []) state = apply(caseFile, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(caseFile, connection.fromEventId), toItemId: publicEventId(caseFile, connection.toEventId), relation: connection.relation }, log);
    }
  }
  return apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" }, log);
}

test("Season 3 manifest is an internal RC with twelve non-leaking cases", () => {
  assert.equal(manifest.status, "internal-rc");
  assert.equal(manifest.publishable, false);
  assert.deepEqual(manifest.humanEvaluation, { status: "pending", participants: 0, requiredBeforePublish: true });
  assert.equal(cases.length, 12);
  for (const caseFile of cases) {
    validateCaseShape(caseFile);
    assert.ok(caseFile.events.length >= 9 && caseFile.events.length <= 14, caseFile.id);
    assert.ok(caseFile.facts.length >= 14 && caseFile.facts.length <= 22, caseFile.id);
    assert.ok(caseFile.evidenceItems.length >= 9 && caseFile.evidenceItems.length <= 14, caseFile.id);
    assert.ok(caseFile.proofReplay.length >= 6, caseFile.id);
    assert.equal(caseFile.solutionCertificate.minimumProofSets.length, 2, caseFile.id);
    assert.ok((caseFile.reasoningBoards?.length ?? 0) >= 2, caseFile.id);
    const serialized = JSON.stringify(projectPlayerState(caseFile, createRuntimeState(caseFile)));
    assert.equal(serialized.includes("solutionCertificate"), false, caseFile.id);
    assert.equal(serialized.includes(caseFile.solutionCertificate.canonicalHypothesisId), false, caseFile.id);
    for (const fact of caseFile.facts) assert.equal(serialized.includes(fact.id), false, `${caseFile.id}:${fact.id}`);
    for (const event of caseFile.events) assert.equal(serialized.includes(event.id), false, `${caseFile.id}:${event.id}`);
  }
});

test("Season 3 has distinct reasoning fingerprints", () => {
  const fingerprints = cases.map((caseFile) => (caseFile.reasoningBoards ?? []).map((board) => board.mode).join("+"));
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});

test("all Season 3 question corpora normalize exactly or fail closed", async () => {
  let total = 0;
  for (const caseFile of cases) {
    const code = caseFile.id.match(/^(c\d+)/)?.[1] ?? "";
    const imported = await import(pathToFileURL(resolve(caseDir, `${code}-question-corpus.ts`)).href) as Record<string, unknown>;
    const corpus = Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? [];
    assert.ok(corpus.length >= 220, caseFile.id);
    const normalized = corpus.filter((item) => item.expectedStatus === "matched").map((item) => normalizeQuestion(caseFile, item.rawQuestion).normalizedText);
    const duplicateRate = 1 - new Set(normalized).size / normalized.length;
    assert.ok(duplicateRate < 0.1, `${caseFile.id}:${duplicateRate}`);
    total += corpus.length;
    for (const vector of corpus) {
      const result = normalizeQuestion(caseFile, vector.rawQuestion);
      assert.equal(result.status, vector.expectedStatus, vector.id);
      if (vector.expectedQueryId) assert.equal(result.queryId, vector.expectedQueryId, vector.id);
    }
  }
  assert.ok(total >= 2640, String(total));
});

test("both certified minimum proof sets solve and all boards are mandatory", () => {
  for (const caseFile of cases) {
    for (const proofSet of caseFile.solutionCertificate.minimumProofSets) {
      const state = finish(caseFile, proofSet.evidenceIds);
      assert.equal(state.solved, true, `${caseFile.id}:${proofSet.id}`);
    }
    assert.equal(finish(caseFile, undefined, false).solved, false, `${caseFile.id}:boards-optional`);
  }
});

test("proof mutation blocks required evidence while red herrings remain unnecessary", () => {
  for (const caseFile of cases) {
    const proof = caseFile.solutionCertificate.minimumProofSets[0].evidenceIds;
    for (const proofSet of caseFile.solutionCertificate.minimumProofSets) for (const evidenceId of proofSet.evidenceIds) assert.equal(finish(caseFile, proofSet.evidenceIds.filter((id) => id !== evidenceId)).solved, false, `${caseFile.id}:${proofSet.id}:${evidenceId}`);
    const redHerring = caseFile.evidenceItems.find((item) => item.importance === "irrelevant");
    assert.ok(redHerring, caseFile.id);
    assert.equal(proof.includes(redHerring.id), false, caseFile.id);
  }
});

test("command logs replay identically and saves remain schema v1 compatible", () => {
  for (const caseFile of cases) {
    const commands: GameCommand[] = [];
    const state = finish(caseFile, undefined, true, commands);
    const replayed = replayCommands(caseFile, commands);
    assert.deepEqual(projectPlayerState(caseFile, replayed.state), projectPlayerState(caseFile, state), caseFile.id);
    const save: SaveEnvelope = { schemaVersion: 1, caseId: caseFile.id, caseVersion: 1, contentHash: caseFile.metadata?.canonicalHash ?? "", commands, updatedAt: new Date(0).toISOString(), completed: true };
    assert.equal(validateCompatibleSave(save, caseFile.id, { caseVersion: 1, contentHash: save.contentHash }).ok, true);
    assert.equal(validateCompatibleSave(save, cases.find((item) => item.id !== caseFile.id)!.id, { caseVersion: 1, contentHash: save.contentHash }).ok, false);
  }
});

test("multi-stage cases unlock deterministically and all replay modes reset", () => {
  for (const caseFile of cases) {
    let state = createRuntimeState(caseFile);
    if (Number(caseFile.id.slice(1, 3)) >= 33) {
      assert.equal(caseFile.chapters?.length, 2);
      for (const evidence of caseFile.evidenceItems) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
      assert.equal(state.unlockedChapterIds.length, 2, caseFile.id);
    }
    state = finish(caseFile);
    for (const challenge of caseFile.replayChallenges ?? []) {
      const result = reduceGameCommand(caseFile, state, { type: "set_replay_mode", mode: challenge.mode });
      assert.equal(result.accepted, true, `${caseFile.id}:${challenge.mode}`);
      assert.equal(result.state.solved, false);
      assert.equal(result.state.replayMode, challenge.mode);
    }
  }
});
