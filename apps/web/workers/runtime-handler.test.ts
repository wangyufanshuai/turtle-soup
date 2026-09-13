import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyPresentationPatch, applyQuestionAliasPack, replayCommands, validateSaveEnvelope, type GameCommand, type HistoricalQuestionRoutingContext, type SaveEnvelope } from "@turtle-soup/mystery-core";
import { loadCaseFile, loadReleaseContent } from "../../../tools/lib/release-content.ts";
import { createCanonicalSave } from "../../../tools/lib/canonical-save.ts";
import { selectHistoricalQuestionRoutingContexts, selectPresentationPatches } from "../../../tools/generate-content-registry.ts";
import { QUESTION_ALIAS_PACKS } from "../.generated/question-alias-registry.ts";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "../lib/worker-protocol.ts";
import { createRuntimeWorkerHandler } from "./runtime-handler.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const profileId = "v2.12-internal-rc";
const { entries } = loadReleaseContent(root, profileId);
// The same read-only selectors supply production-generated content; only loading and transport are injected.
const patches = selectPresentationPatches(root, profileId, entries.map((entry) => entry.id));
const historicalContexts = selectHistoricalQuestionRoutingContexts(root, profileId, entries.map((entry) => entry.id));
const cases = entries.map((entry) => applyQuestionAliasPack(applyPresentationPatch(loadCaseFile(entry), patches.get(entry.id)), QUESTION_ALIAS_PACKS[entry.id]));
const c61 = cases.find((item) => item.id.startsWith("c61-"))!;
const rawText = "关键记录是否相关，按第1种理解？";
type Result = Extract<RuntimeWorkerResponse, { projection: unknown }>;

function worker(contexts: Readonly<Record<string, readonly HistoricalQuestionRoutingContext[]>> = historicalContexts) {
  const responses: RuntimeWorkerResponse[] = [];
  const handle = createRuntimeWorkerHandler({ loadCase: async (caseId) => {
    const caseFile = cases.find((item) => item.id === caseId);
    if (!caseFile) throw new Error("private-error-solutionCertificate");
    return caseFile;
  }, historicalQuestionRoutingContexts: contexts, postMessage: (response) => responses.push(structuredClone(response)) });
  let sequence = 0;
  const send = async (request: Omit<Extract<RuntimeWorkerRequest, { type: "initialize" }>, "id"> | Omit<Extract<RuntimeWorkerRequest, { type: "command" }>, "id"> | Omit<Extract<RuntimeWorkerRequest, { type: "prepare_question_routing" }>, "id">) => {
    const id = ++sequence;
    await handle({ ...request, id } as RuntimeWorkerRequest);
    const response = responses.find((item) => item.id === id)!;
    assert.ok(response);
    return response;
  };
  const result = async (request: Parameters<typeof send>[0]): Promise<Result> => {
    const response = await send(request);
    assert.ok("projection" in response, JSON.stringify(response));
    return response;
  };
  return { send, result, command: (command: GameCommand) => result({ type: "command", command }) };
}

test("production Worker handler: all manifest cases initialize neutral, opaque and save a versioned draft order", async () => {
  let firstCanonical = 0;
  for (const caseFile of cases) {
    const instance = worker();
    const opening = await instance.result({ type: "initialize", caseId: caseFile.id });
    assert.equal(opening.restoreStatus, "new");
    assert.deepEqual(opening.save.commands, [{ type: "start_case", initialDraftOrder: "opaque" }]);
    assert.equal(opening.save.schemaVersion, 1);
    assert.ok(opening.projection.theoryOptions.every((item) => /^待验证解释 \d+（先整理证据）$/.test(item.label)), caseFile.id);
    assert.deepEqual(opening.projection.theoryOptions.map((item) => item.id), opening.projection.theoryOptions.map((item) => item.id).sort());
    const text = JSON.stringify(opening.projection);
    for (const forbidden of ["solutionCertificate", "path-canonical", ...caseFile.facts.map((item) => item.id), ...caseFile.events.map((item) => item.id), ...caseFile.hypotheses.map((item) => item.id)]) assert.equal(text.includes(forbidden), false, `${caseFile.id}:${forbidden}`);
    const restoredState = replayCommands(caseFile, opening.save.commands).state;
    if (restoredState.theoryDrafts[0].hypothesisId === caseFile.solutionCertificate.canonicalHypothesisId) firstCanonical += 1;
    const refreshed = await worker().result({ type: "initialize", caseId: caseFile.id, save: opening.save });
    assert.deepEqual(refreshed.projection, opening.projection);
  }
  assert.ok(firstCanonical > 0 && firstCanonical < cases.length, "correct path is not the fixed first/default choice");
});

test("production Worker handler: ambiguity survives pending refresh, confirmation refresh, undo and restart", async () => {
  let instance = worker();
  await instance.result({ type: "initialize", caseId: c61.id });
  const pending = await instance.command({ type: "ask_text", rawText });
  assert.equal(pending.accepted, false);
  assert.equal(pending.projection.transcript.length, 0);
  assert.equal(pending.projection.interpretation?.requiresConfirmation, true);
  instance = worker();
  const restoredPending = await instance.result({ type: "initialize", caseId: c61.id, save: pending.save });
  assert.deepEqual(restoredPending.projection, pending.projection);
  const queryId = restoredPending.projection.interpretation!.candidates[0].queryId;
  const confirmed = await instance.command({ type: "confirm_interpretation", queryId });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.projection.transcript[0].rawQuestion, rawText);
  assert.deepEqual(confirmed.save.commands.at(-1), { type: "confirm_interpretation", queryId, rawText });
  instance = worker();
  const restored = await instance.result({ type: "initialize", caseId: c61.id, save: confirmed.save });
  assert.equal(restored.restoreStatus, "restored");
  assert.deepEqual(restored.projection, confirmed.projection);
  const undone = await instance.command({ type: "undo_last_question" });
  assert.equal(undone.projection.transcript.length, 0);
  assert.deepEqual((await worker().result({ type: "initialize", caseId: c61.id, save: undone.save })).projection, undone.projection);
  const restarted = await instance.command({ type: "restart_case" });
  assert.deepEqual(restarted.save.commands, [{ type: "start_case", initialDraftOrder: "opaque" }]);
});

test("production Worker handler: incomplete legacy restore is quarantined; explicit restart is required to replace", async () => {
  const instance = worker();
  const opening = await instance.result({ type: "initialize", caseId: c61.id });
  const pending = await instance.command({ type: "ask_text", rawText });
  const broken: SaveEnvelope = { ...opening.save, commands: [{ type: "confirm_interpretation", queryId: pending.projection.interpretation!.candidates[0].queryId }] };
  const input = structuredClone(broken);
  const restored = await instance.result({ type: "initialize", caseId: c61.id, save: broken });
  assert.equal(restored.restoreStatus, "corrupt");
  assert.equal(restored.persistenceBlocked, true);
  assert.equal(restored.accepted, false);
  assert.deepEqual(restored.recoverySave, input);
  assert.deepEqual(broken, input);
  const attempted = await instance.command({ type: "ask_text", rawText: c61.questionSemantics[0].examplePhrases![0] });
  assert.equal(attempted.accepted, false);
  assert.equal(attempted.persistenceBlocked, true);
  assert.deepEqual(attempted.recoverySave, input);
  const restart = await instance.command({ type: "restart_case" });
  assert.equal(restart.persistenceBlocked, false);
  assert.equal(restart.restoreStatus, "new");
  assert.equal(restart.recoverySave, undefined);
});

test("production Worker handler: invalid, forged, stale interpretation and cross-case imports fail closed", async () => {
  const instance = worker();
  const opening = await instance.result({ type: "initialize", caseId: c61.id });
  const pending = await instance.command({ type: "ask_text", rawText });
  const queryId = pending.projection.interpretation!.candidates[0].queryId;
  for (const command of [
    { type: "confirm_interpretation", queryId: "forged", rawText },
    { type: "confirm_interpretation", queryId, rawText: "任意新问题" },
    { type: "confirm_interpretation", queryId, rawText: 12 },
    { type: "ask_text", rawText: null },
    { type: "reveal_solution" },
  ]) {
    const rejected = await instance.command(command as GameCommand);
    assert.equal(rejected.accepted, false);
    assert.deepEqual(rejected.projection, pending.projection);
    assert.deepEqual(rejected.save.commands, pending.save.commands);
  }
  const otherCase = cases.find((item) => item.id !== c61.id)!;
  const other = await instance.result({ type: "initialize", caseId: otherCase.id, save: opening.save });
  assert.equal(other.restoreStatus, "incompatible");
  assert.equal(other.persistenceBlocked, true);
  const error = await instance.send({ type: "initialize", caseId: "unknown-case" });
  assert.equal(error.type, "error");
  assert.equal(JSON.stringify(error).includes("solutionCertificate"), false);
  assert.equal((await instance.send({ type: "command", command: { type: "ask_text", rawText } })).type, "error");
});

/** Author-informed integration recipe, not a blind-player or UI test. */
function boundedRecipe(caseFile: typeof c61): GameCommand[] {
  if (caseFile.id.startsWith("c01-")) {
    const examined = (evidenceId: string): GameCommand => ({ type: "set_evidence_state", evidenceId, state: "examined" });
    const ask = (rawText: string): GameCommand => ({ type: "ask_text", rawText });
    const evidenceIds = ["evidence-cctv-exit", "evidence-door-latch", "evidence-metal-tray-mark", "evidence-knock-recording", "evidence-access-log", "evidence-phone-in-room", "evidence-phone-pairing", "evidence-sample-locker", "evidence-intent-chain"];
    return [
      ...["evidence-door-latch", "evidence-metal-tray-mark", "evidence-knock-recording", "evidence-access-log"].map(examined),
      ask("这扇门会自动上锁吗？"), ask("敲门声是人敲的吗？"), ask("手机在冷藏室里吗？"),
      examined("evidence-phone-in-room"), ask("那部手机是林澈的吗？"), examined("evidence-phone-pairing"),
      { type: "visit_location", locationId: "location-external-locker" }, examined("evidence-sample-locker"),
      ask("他是想拖延检查吗？"), examined("evidence-intent-chain"),
      { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: "path-delayed-sound" },
      ...evidenceIds.map((evidenceId): GameCommand => ({ type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true })),
      ...["event-01", "event-02", "event-03", "event-04", "event-05", "event-07"].map((eventId): GameCommand => ({ type: "upsert_theory_event", theoryId: "theory-a", eventId })),
      { type: "set_theory_motive", theoryId: "theory-a", motiveKey: "motive-delay-inspection" },
      { type: "submit_theory", theoryId: "theory-a" }, { type: "request_proof_replay" },
    ];
  }
  const seen = new Set<string>();
  return [
    ...caseFile.questionSemantics.slice(0, 3).map((query): GameCommand => ({ type: "ask_text", rawText: query.examplePhrases![0] })),
    ...createCanonicalSave(caseFile).commands.filter((command) => {
      if (["ask_text", "ask_resolved_text", "confirm_interpretation"].includes(command.type)) return false;
      const key = JSON.stringify(command);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

test("production Worker handler: authored four sample recipes complete proof, replay and all challenges with every command accepted", async () => {
  for (const caseFile of cases.filter((item) => /^(c01|c03|c61|c84)-/.test(item.id))) {
    const recipe = boundedRecipe(caseFile);
    const instance = worker();
    let latest = await instance.result({ type: "initialize", caseId: caseFile.id });
    for (const mode of ["standard", "limited-questions", "minimal-proof", "no-scaffolds"] as const) {
      if (mode !== "standard") {
        latest = await instance.command({ type: "set_replay_mode", mode });
        assert.equal(latest.accepted, true);
        assert.equal(latest.projection.solved, false);
        assert.equal(latest.projection.replayMode, mode);
        assert.equal(replayCommands(caseFile, latest.save.commands).state.initialDraftOrder, "opaque");
      }
      for (const command of recipe) {
        latest = await instance.command(command);
        assert.equal(latest.accepted, true, `${caseFile.id}:${mode}:${JSON.stringify(command)}:${JSON.stringify(latest.events)}`);
      }
      assert.equal(latest.projection.solved, true, `${caseFile.id}:${mode}`);
      assert.ok(latest.projection.replay.length > 0);
      if (mode === "limited-questions") assert.ok(latest.projection.transcript.length <= (caseFile.replayChallenges?.find((item) => item.mode === mode)?.questionLimit ?? 12));
      const restored = await worker().result({ type: "initialize", caseId: caseFile.id, save: latest.save });
      assert.equal(restored.restoreStatus, "restored");
      assert.deepEqual(restored.projection, latest.projection);
    }
  }
});

test("production Worker handler: rapid initialization and commands are serialized; outputs are independent snapshots", async () => {
  const instance = worker();
  const openingPromise = instance.result({ type: "initialize", caseId: c61.id });
  const askPromise = instance.command({ type: "ask_text", rawText });
  const [opening, pending] = await Promise.all([openingPromise, askPromise]);
  assert.equal(opening.projection.interpretation, undefined);
  assert.ok(pending.projection.interpretation);
  assert.equal(opening.save.commands.length, 1);
  assert.equal(pending.save.commands.length, 2);
  const sanitized = validateSaveEnvelope({ ...pending.save, commands: [{ type: "confirm_interpretation", queryId: pending.projection.interpretation.candidates[0].queryId, rawText, apiKey: "SECRET" }] });
  assert.equal(sanitized.ok, true);
  assert.equal(JSON.stringify(sanitized).includes("SECRET"), false);
});

test("production Worker handler: malformed transport and failed storage reads never overwrite a prior save", async () => {
  const responses: RuntimeWorkerResponse[] = [];
  const handle = createRuntimeWorkerHandler({ loadCase: async () => c61, postMessage: (item) => responses.push(item) });
  await handle(null as unknown as RuntimeWorkerRequest);
  assert.equal(responses.at(-1)?.type, "error");
  assert.equal((responses.at(-1) as { code: string }).code, "invalid_request");
  await handle({ id: 2, type: "initialize", caseId: c61.id, saveReadFailed: true });
  const result = responses.at(-1)!;
  assert.ok("projection" in result);
  assert.equal(result.persistenceBlocked, true);
  assert.equal(result.restoreStatus, "corrupt");
  assert.equal(result.recoverySave, undefined);
});

const legacyAI: Extract<GameCommand, { type: "ask_resolved_text" }> = {
  type: "ask_resolved_text", rawText: "我想问敲击声是不是人发出的？", queryId: "query-knock-source",
  resolutionSource: "ai-confirmed", contextHash: "82459ce6",
};
const legacyAISave: SaveEnvelope = {
  schemaVersion: 1, caseId: "c01-cold-room-knock", caseVersion: 1, contentHash: "sha256:c01-cold-room-knock-v1",
  commands: [{ type: "start_case" }, legacyAI], updatedAt: "2026-09-05T00:00:00.000Z", completed: false,
};

test("production Worker handler: pinned v2.11 AI log restores current copy and unchanged commands; live old hash stays stale", async () => {
  const c01Entry = entries.find((entry) => entry.id === legacyAISave.caseId)!;
  const historicalPatch = selectPresentationPatches(root, "v2.11-internal-rc", [c01Entry.id]).get(c01Entry.id);
  const historicalCase = applyQuestionAliasPack(applyPresentationPatch(loadCaseFile(c01Entry), historicalPatch), QUESTION_ALIAS_PACKS[c01Entry.id]);
  const old = replayCommands(historicalCase, legacyAISave.commands);
  const bytes = JSON.stringify(legacyAISave);
  const commandsBytes = JSON.stringify(legacyAISave.commands);
  const instance = worker();
  const restored = await instance.result({ type: "initialize", caseId: legacyAISave.caseId, save: legacyAISave });
  assert.equal(restored.restoreStatus, "restored");
  assert.equal(restored.accepted, true);
  assert.equal(restored.persistenceBlocked, false);
  assert.equal(restored.projection.transcript[0].interpretedAs, "敲门声是人敲的吗？");
  assert.equal(old.projection.transcript[0].interpretedAs, "三下敲击是否真的来自门内？");
  assert.equal(restored.projection.transcript[0].answerCode, old.projection.transcript[0].answerCode);
  assert.deepEqual(replayCommands(cases.find((item) => item.id === c01Entry.id)!, restored.save.commands, { historicalQuestionRoutingContexts: historicalContexts[c01Entry.id] }).state.game, old.state.game);
  assert.equal(JSON.stringify(restored.save.commands), commandsBytes);
  assert.equal(JSON.stringify(legacyAISave), bytes);
  const stale = await instance.command(legacyAI);
  assert.equal(stale.accepted, false);
  assert.deepEqual(stale.projection, restored.projection);
  assert.equal(JSON.stringify(stale.save.commands), commandsBytes);
  const offer = await instance.send({ type: "prepare_question_routing", rawText: legacyAI.rawText });
  assert.equal(offer.type, "routing_context");
  if (offer.type !== "routing_context") throw new Error("missing production routing offer");
  assert.notEqual(offer.offer.context.contextHash, legacyAI.contextHash);
  const accepted = await instance.command({ ...legacyAI, contextHash: offer.offer.context.contextHash });
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.save.commands.slice(0, 2), legacyAISave.commands);
  const refreshed = await worker().result({ type: "initialize", caseId: legacyAISave.caseId, save: accepted.save });
  assert.equal(refreshed.restoreStatus, "restored");
  assert.deepEqual(refreshed.projection, accepted.projection);
  assert.equal(JSON.stringify(refreshed.save.commands), JSON.stringify(accepted.save.commands));
});

test("production Worker handler: unprovable legacy AI saves remain quarantined and preserve original recovery data", async () => {
  for (const commands of [
    [{ ...legacyAI, contextHash: "00000000" }], [{ ...legacyAI, queryId: "query-c61-other-case" }],
    [{ ...legacyAI, rawText: "另一个问题" }],
  ]) {
    const save: SaveEnvelope = { ...legacyAISave, commands };
    const bytes = JSON.stringify(save);
    const instance = worker();
    const restored = await instance.result({ type: "initialize", caseId: save.caseId, save });
    assert.equal(restored.restoreStatus, "corrupt");
    assert.equal(restored.accepted, false);
    assert.equal(restored.persistenceBlocked, true);
    assert.deepEqual(restored.recoverySave, save);
    assert.equal(JSON.stringify(save), bytes);
    const denied = await instance.command({ type: "ask_text", rawText: "这扇门会自动上锁吗？" });
    assert.equal(denied.accepted, false);
    assert.deepEqual(denied.recoverySave, save);
  }
  for (const contextHash of ["", "   "]) {
    const save = { ...legacyAISave, commands: [{ ...legacyAI, contextHash }] };
    const bytes = JSON.stringify(save);
    const restored = await worker().result({ type: "initialize", caseId: save.caseId, save });
    assert.equal(restored.restoreStatus, "corrupt");
    assert.equal(restored.persistenceBlocked, true);
    assert.equal(JSON.stringify(save), bytes);
  }
  const missingAuthority = await worker({}).result({ type: "initialize", caseId: legacyAISave.caseId, save: legacyAISave });
  assert.equal(missingAuthority.restoreStatus, "corrupt");
  assert.deepEqual(missingAuthority.recoverySave, legacyAISave);
  const wrongCase = await worker().result({ type: "initialize", caseId: c61.id, save: legacyAISave });
  assert.equal(wrongCase.restoreStatus, "incompatible");
  assert.deepEqual(wrongCase.recoverySave, legacyAISave);
});

test("production Worker handler: saved or request-provided compatibility metadata cannot grant replay authority", async () => {
  const save = { ...legacyAISave, historicalQuestionRoutingContexts: historicalContexts[legacyAISave.caseId] };
  const request = { type: "initialize" as const, caseId: save.caseId, save, historicalQuestionRoutingContexts: historicalContexts };
  const restored = await worker({}).result(request);
  assert.equal(restored.restoreStatus, "corrupt");
  assert.equal(restored.persistenceBlocked, true);
  assert.deepEqual(restored.recoverySave?.commands, legacyAISave.commands);
});
