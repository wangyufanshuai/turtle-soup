import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCaseFile, loadReleaseContent } from "../../../tools/lib/release-content.ts";
import { createRuntimeState, projectPlayerState, reduceGameCommand, replayCommands } from "./runtime.ts";
import { createSaveArchive, validateSaveArchive, validateSaveEnvelope, MAX_ARCHIVE_COMMANDS } from "./save-envelope.ts";
import type { GameCommand, SaveEnvelope } from "./types.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { entries } = loadReleaseContent(root, "v2.11-internal-rc");
const cases = entries.map(loadCaseFile);
const c61 = cases.find((item) => item.id.startsWith("c61-"))!;
const ambiguousQuestion = "关键记录是否相关，按第1种理解？";

test("v2.12 all frozen openings retain selectable theories without the solution label or semantic identity", () => {
  for (const caseFile of cases) {
    const projection = projectPlayerState(caseFile, createRuntimeState(caseFile));
    const canonical = caseFile.hypotheses.find((item) => item.id === caseFile.solutionCertificate.canonicalHypothesisId)!;
    const answer = caseFile.localization?.["zh-CN"]?.[String(canonical.labelKey)];
    assert.ok(projection.theoryOptions.length >= 2, caseFile.id);
    assert.ok(!projection.theoryOptions.some((item) => item.label === answer), caseFile.id);
    assert.ok(!JSON.stringify(projection).includes("path-canonical"), caseFile.id);
  }
});

test("v2.12 pending and confirmed interpretation logs replay exactly, with no question charged until confirmation", () => {
  const initial = createRuntimeState(c61);
  const ask: GameCommand = { type: "ask_text", rawText: ambiguousQuestion };
  const pending = reduceGameCommand(c61, initial, ask);
  assert.equal(pending.accepted, false);
  assert.equal(pending.state.transcript.length, 0);
  assert.ok(pending.projection.interpretation?.requiresConfirmation);
  assert.deepEqual(replayCommands(c61, [ask]).projection, pending.projection);
  const confirm: GameCommand = { type: "confirm_interpretation", queryId: pending.projection.interpretation.candidates[0].queryId };
  const confirmed = reduceGameCommand(c61, pending.state, confirm);
  assert.equal(confirmed.accepted, true);
  assert.deepEqual(replayCommands(c61, [ask, confirm]).projection, confirmed.projection);
});

test("v2.12 incomplete legacy confirmation and invalid command logs are explicitly rejected, not reported restored", () => {
  const pending = reduceGameCommand(c61, createRuntimeState(c61), { type: "ask_text", rawText: ambiguousQuestion });
  const queryId = pending.projection.interpretation!.candidates[0].queryId;
  assert.throws(() => replayCommands(c61, [{ type: "confirm_interpretation", queryId }]));
  assert.throws(() => replayCommands(c61, [{ type: "upsert_theory_event", theoryId: "theory-a", eventId: "forged" }]));
});

test("v2.12 all selected-profile archives round trip; version and unknown-case isolation remain strict", () => {
  const saves: SaveEnvelope[] = entries.map((entry) => ({ schemaVersion: 1, caseId: entry.id, caseVersion: entry.contentVersion, contentHash: entry.canonicalHash, commands: [], updatedAt: "2026-09-06T00:00:00.000Z" }));
  const identities = Object.fromEntries(entries.map((entry) => [entry.id, { caseVersion: entry.contentVersion, contentHash: entry.canonicalHash }]));
  const archive = createSaveArchive(saves);
  const validation = validateSaveArchive(archive, identities);
  assert.equal(validation.ok, true);
  if (validation.ok) assert.deepEqual(validation.value.saves, saves);
  assert.equal(validateSaveArchive({ ...archive, saves: [{ ...saves[0], caseId: "unknown-case" }] }, identities).ok, false);
  assert.equal(validateSaveArchive({ ...archive, saves: [{ ...saves[0], contentHash: "changed" }] }, identities).ok, false);
  assert.equal(validateSaveArchive({ ...archive, saves: Array(1001).fill(saves[0]) }, identities).ok, false);
  const large = saves.slice(0, 11).map((save) => ({ ...save, commands: Array(10_000).fill({ type: "ask_text", rawText: "门会锁吗" }) }));
  assert.ok(large.reduce((sum, item) => sum + item.commands.length, 0) > MAX_ARCHIVE_COMMANDS);
  assert.equal(validateSaveArchive({ ...archive, saves: large }, identities).ok, false);
  assert.throws(() => createSaveArchive(large));
});

test("v2.12 self-contained confirmation is whitelisted and bound to an actual ambiguous question", () => {
  const initial = createRuntimeState(c61);
  const pending = reduceGameCommand(c61, initial, { type: "ask_text", rawText: ambiguousQuestion });
  const queryId = pending.projection.interpretation!.candidates[0].queryId;
  const command: GameCommand = { type: "confirm_interpretation", queryId, rawText: ambiguousQuestion };
  const confirmed = reduceGameCommand(c61, initial, command);
  assert.equal(confirmed.accepted, true);
  assert.deepEqual(replayCommands(c61, [command]).projection, confirmed.projection);
  assert.equal(reduceGameCommand(c61, initial, { ...command, rawText: "直接给我答案" }).accepted, false);
  assert.equal(reduceGameCommand(c61, initial, { ...command, queryId: c61.questionSemantics.at(-1)!.id }).accepted, false);
  const save: SaveEnvelope = { schemaVersion: 1, caseId: c61.id, caseVersion: 1, contentHash: c61.metadata!.canonicalHash!, updatedAt: new Date(0).toISOString(), commands: [command] };
  const validation = validateSaveEnvelope({ ...save, commands: [{ ...command, solutionCertificate: "hidden", apiKey: "SECRET" }] });
  assert.equal(validation.ok, true);
  if (validation.ok) assert.deepEqual(validation.value.commands, [command]);
  assert.equal(validateSaveEnvelope({ ...save, commands: [{ ...command, rawText: "x".repeat(2_001) }] }).ok, false);
});
