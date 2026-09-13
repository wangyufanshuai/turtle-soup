/** Author-side fixture producer. Dynamic imports MUST resolve only inside the exported old tree. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [oldRootArgument, outputArgument, pinnedRef, timestamp] = process.argv.slice(2);
assert(oldRootArgument && outputArgument && /^[0-9a-f]{40}$/.test(pinnedRef));
const oldRoot = resolve(oldRootArgument), output = resolve(outputArgument);
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const within = (base: string, path: string) => {
  const rel = relative(base, resolve(path));
  assert(rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `Unsafe output/import path: ${path}`);
  return resolve(path);
};
const oldImport = (path: string) => import(pathToFileURL(within(oldRoot, resolve(oldRoot, path))).href);
const core = await oldImport("packages/mystery-core/src/index.ts");
const { createCanonicalSave } = await oldImport("tools/lib/canonical-save.ts");
const { loadCaseFile, loadReleaseContent, loadQuestionCorpus } = await oldImport("tools/lib/release-content.ts");
const { mergePresentationPatch, mergeQuestionAliasPacks } = await oldImport("tools/lib/v17-overlays.ts");
const readOldJson = (path: string) => JSON.parse(readFileSync(within(oldRoot, resolve(oldRoot, path)), "utf8"));
const basePatches = readOldJson("content/zh/presentation/v1.4/patches.json");
const overlayPatches = readOldJson("content/zh/presentation/v1.7/patches.json");
const aliases = mergeQuestionAliasPacks(readOldJson("content/zh/question-aliases/v1.6/packs.json"), readOldJson("content/zh/question-aliases/v1.7/packs.json"));
const { entries } = loadReleaseContent(oldRoot, "v2.11-internal-rc");
assert.equal(entries.length, 84);
mkdirSync(output, { recursive: true });

function writeJson(path: string, value: unknown) {
  const destination = within(output, resolve(output, path));
  mkdirSync(dirname(destination), { recursive: true });
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(destination, raw, "utf8");
  return { path, sha256: sha256(raw), bytes: Buffer.byteLength(raw) };
}

function oldIdMap(file: any) {
  const event = Object.fromEntries([...file.events].sort((a, b) => a.order - b.order).map((item, index) => [`event-${String(index + 1).padStart(2, "0")}`, item.id]));
  const board = Object.fromEntries((file.reasoningBoards ?? []).map((item: any, index: number) => [`board-${String(index + 1).padStart(2, "0")}`, {
    id: item.id, slots: Object.fromEntries(item.slots.map((slot: any, slotIndex: number) => [`slot-${String(slotIndex + 1).padStart(2, "0")}`, slot.id])),
  }]));
  return { event, board };
}

/** Expected facts come solely from old RuntimeState, not from v2.12 or a v2.12 projection. */
function semantic(file: any, state: any) {
  const ids = oldIdMap(file);
  const decodeEvent = (id: string) => { assert(ids.event[id], `Unknown old event ${id}`); return ids.event[id]; };
  return {
    game: Object.fromEntries(Object.entries(state.game).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])),
    transcript: state.transcript.map((item: any) => ({ id: item.id, rawQuestion: item.rawQuestion, answerCode: item.answerCode, repeated: item.repeated })),
    evidenceStates: state.evidenceStates,
    theoryDrafts: state.theoryDrafts.map((draft: any) => ({ id: draft.id, hypothesisId: draft.hypothesisId, eventIds: draft.eventIds, evidenceIds: [...draft.evidenceIds].sort(), motiveKey: draft.motiveKey ?? null })),
    activeTheoryId: state.activeTheoryId,
    pendingInterpretation: state.pendingInterpretation ?? null,
    lastQuestionSnapshot: state.lastQuestionSnapshot ? {
      game: Object.fromEntries(Object.entries(state.lastQuestionSnapshot.game).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])),
      transcriptLength: state.lastQuestionSnapshot.transcriptLength,
    } : null,
    solved: state.solved,
    replayBeatIds: state.replayBeatIds,
    acceptedCommandCount: state.acceptedCommandCount,
    unlockedChapterIds: [...state.unlockedChapterIds].sort(),
    reasoningBoards: Object.fromEntries(Object.entries(state.reasoningBoards).map(([publicId, draft]: [string, any]) => {
      const board = ids.board[publicId];
      assert(board, `Unknown old board ${publicId}`);
      return [board.id, {
        placements: Object.fromEntries(Object.entries(draft.placements).map(([slot, item]) => { assert(board.slots[slot]); return [board.slots[slot], decodeEvent(item as string)]; })),
        connections: draft.connections.map((item: any) => ({ fromEventId: decodeEvent(item.fromItemId), toEventId: decodeEvent(item.toItemId), relation: item.relation })).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
      }];
    })),
    replayMode: state.replayMode,
  };
}

function live(file: any, commands: any[]) {
  let state = core.createRuntimeState(file);
  const steps: any[] = [];
  for (const [index, command] of commands.entries()) {
    const result = core.reduceGameCommand(file, state, command);
    steps.push({ index, type: command.type, accepted: result.accepted, events: result.events.map((event: any) => ({ type: event.type, ...(event.type === "theory_judged" ? { judgement: event.judgement, proofFailureCategory: event.proofFailureCategory ?? null } : {}) })) });
    assert(result.accepted, `Old accepted-command fixture rejected ${file.id}:${index}:${command.type}`);
    state = result.state;
  }
  return { state, steps };
}

const fixtures: any[] = [], negatives: any[] = [], milestoneCoverage: any[] = [];
function saveFixture(file: any, name: string, commands: any[], expectations: Record<string, unknown> = {}) {
  const observed = live(file, commands);
  const expected = semantic(file, observed.state);
  const oldReplayed = semantic(file, core.replayCommands(file, commands).state);
  assert.deepEqual(oldReplayed, expected, `Old live/replay differs for ${file.id}:${name}; do not treat a corrupt legacy log as compatible`);
  for (const [key, value] of Object.entries(expectations)) assert.deepEqual(expected[key as keyof typeof expected], value, `${file.id}:${name}:${key}`);
  const save = { schemaVersion: 1, caseId: file.id, caseVersion: file.metadata.contentVersion, contentHash: file.metadata.canonicalHash, commands, updatedAt: timestamp, completed: observed.state.solved };
  const prefix = `fixtures/${file.id}/${name}`;
  const raw = writeJson(`${prefix}.save.json`, save);
  const oracle = writeJson(`${prefix}.expected.json`, { source: "pinned-old-runtime generated oracle", pinnedRef, expected, oldLiveEqualsOldReplay: true, expectations, steps: observed.steps });
  fixtures.push({ caseId: file.id, name, commands: commands.length, raw, oracle });
  return observed;
}

for (const entry of entries) {
  const raw = loadCaseFile(entry);
  const patch = mergePresentationPatch(basePatches.find((item: any) => item.caseId === raw.id), overlayPatches.find((item: any) => item.caseId === raw.id));
  const file = core.applyQuestionAliasPack(core.applyPresentationPatch(raw, patch), aliases.find((item: any) => item.caseId === raw.id));
  const canonical = createCanonicalSave(file);
  assert.equal(canonical.schemaVersion, 1);
  saveFixture(file, "canonical-solved-replay", canonical.commands, { solved: true });
  if (!/^(c01|c61|c84)-/.test(file.id)) continue;
  const commands = canonical.commands;
  const firstTheory = commands.findIndex((command: any) => command.type === "set_theory_hypothesis");
  assert(firstTheory > 0);
  const investigated = commands.slice(0, firstTheory);
  saveFixture(file, "empty", [], { solved: false });
  const firstQuestion = commands.findIndex((command: any) => command.type === "ask_text");
  assert(firstQuestion >= 0);
  const partial = commands.slice(0, firstQuestion + 1);
  saveFixture(file, "partial-question", partial, { solved: false });
  saveFixture(file, "undo-question", [...partial, { type: "undo_last_question" }], { solved: false, transcript: [] });
  saveFixture(file, "investigated-evidence", investigated, { solved: false });
  const wrongInternal = file.hypotheses.find((item: any) => item.id !== file.solutionCertificate.canonicalHypothesisId).id;
  const oldProjection = core.projectPlayerState(file, live(file, investigated).state);
  // Old runtime stores hypotheses internally and projects each draft independently; obtain the old handle through that public boundary.
  const wrongState = live(file, investigated).state;
  wrongState.theoryDrafts = wrongState.theoryDrafts.map((draft: any) => draft.id === "theory-a" ? { ...draft, hypothesisId: wrongInternal } : draft);
  const wrongId = core.projectPlayerState(file, wrongState).theoryDrafts.find((item: any) => item.id === "theory-a").hypothesisId;
  assert(oldProjection.theoryOptions.some((item: any) => item.id === wrongId));
  saveFixture(file, "wrong-theory", [...investigated, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: wrongId }, { type: "submit_theory", theoryId: "theory-a" }], { solved: false });
  const submitIndex = commands.findLastIndex((command: any) => command.type === "submit_theory");
  saveFixture(file, "solved-before-replay", commands.slice(0, submitIndex + 1), { solved: true, replayBeatIds: [] });
  const firstBoard = commands.findIndex((command: any) => command.type === "place_reasoning_item");
  if (firstBoard >= 0) saveFixture(file, "partial-board", commands.slice(0, firstBoard + 1), { solved: false });
  for (const challenge of file.replayChallenges ?? []) {
    const reset = [...commands, { type: "set_replay_mode", mode: challenge.mode }];
    saveFixture(file, `challenge-${challenge.mode}-start`, reset, { solved: false, replayMode: challenge.mode, transcript: [], replayBeatIds: [] });
    saveFixture(file, `challenge-${challenge.mode}-partial`, [...reset, commands[firstQuestion]], { solved: false, replayMode: challenge.mode });
    if (challenge.mode !== "limited-questions") saveFixture(file, `challenge-${challenge.mode}-solved-replay`, [...reset, ...commands], { solved: true, replayMode: challenge.mode });
    else milestoneCoverage.push({ caseId: file.id, stage: `challenge-${challenge.mode}-recompletion`, coverage: "not-run", passed: null, reason: "Only challenge reset and first question are covered; no claim of full limited-question re-completion." });
  }
  if (file.id.startsWith("c61-")) {
    const corpus = await loadQuestionCorpus(entry);
    const ambiguousText = corpus.find((item: any) => item.expectedStatus === "ambiguous")?.rawQuestion;
    assert(ambiguousText, "Pinned C61 corpus must supply a real ambiguity vector");
    const initial = core.createRuntimeState(file);
    const asked = core.reduceGameCommand(file, initial, { type: "ask_text", rawText: ambiguousText });
    assert(!asked.accepted && asked.state.pendingInterpretation?.candidateQueryIds.length > 1);
    const command = { type: "confirm_interpretation", queryId: asked.state.pendingInterpretation.candidateQueryIds[0] };
    const confirmed = core.reduceGameCommand(file, asked.state, command);
    assert(confirmed.accepted && confirmed.state.transcript.length === 1);
    const replayed = core.replayCommands(file, [command]);
    assert.equal(replayed.state.transcript.length, 0);
    const rawRef = writeJson(`negative/${file.id}-confirm-only.save.json`, { schemaVersion: 1, caseId: file.id, caseVersion: file.metadata.contentVersion, contentHash: file.metadata.canonicalHash, commands: [command], updatedAt: timestamp, completed: false });
    const expectedRef = writeJson(`negative/${file.id}-confirm-only.expected.json`, { pinnedRef, source: "pinned-old-runtime generated corruption regression; NOT a compatible fixture", originalQuestionKnownOnlyFromReproduction: ambiguousText, oldLive: semantic(file, confirmed.state), oldReplay: semantic(file, replayed.state), liveTranscriptCount: 1, replayTranscriptCount: 0, originalQuestionPersistedInRawSave: false, requiredNewBehavior: "reject replay, retain original bytes, never invent missing raw question", compatiblePassEligible: false });
    negatives.push({ caseId: file.id, name: "confirm-only-irrecoverable", raw: rawRef, oracle: expectedRef });
  }
}
assert.equal(fixtures.filter((item) => item.name === "canonical-solved-replay").length, 84);
assert.equal(negatives.length, 1);
writeJson("oracle-index.json", {
  version: 1, generator: "pinned-old-runtime generated oracle", pinnedRef, profile: "v2.11-internal-rc", humanParticipants: 0,
  noHistoricalHumanSaveClaim: true, nodeVersion: process.version, caseCount: entries.length,
  fixtures, negatives, milestoneCoverage,
  normalization: "Old RuntimeState facts/evidence and internal theory order; board/slot/event public IDs mapped explicitly to authored semantic IDs. UI labels are not compatibility invariants.",
});
console.log(JSON.stringify({ pinnedRef, caseCount: entries.length, compatibleFixtures: fixtures.length, corruptionRegressions: negatives.length, humanParticipants: 0 }));
