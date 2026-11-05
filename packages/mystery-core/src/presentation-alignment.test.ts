import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectHistoricalQuestionRoutingContexts, selectPresentationPatches } from "../../../tools/generate-content-registry.ts";
import { loadReleaseContent } from "../../../tools/lib/release-content.ts";
import { mergePresentationPatch, mergeQuestionAliasPacks } from "../../../tools/lib/v17-overlays.ts";
import { askNaturalLanguage, createInitialState, discoverEvidence, getDiscoverableEvidenceIds, normalizeQuestion, visitLocation } from "./engine.ts";
import { applyPresentationPatch, validatePresentationPatch } from "./presentation-patch.ts";
import { applyQuestionAliasPack, validateQuestionAliasPack } from "./question-alias-pack.ts";
import { createQuestionRoutingOffer, createRuntimeState, projectPlayerState, reduceGameCommand, replayCommands } from "./runtime.ts";
import type { AnswerCode, CaseFile, CasePresentationPatch, GameCommand, QuestionAliasPack, SaveEnvelope } from "./types.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const casePath = resolve(root, "content/zh/cases/c01-cold-room-knock.json");
const originalBytes = readFileSync(casePath);
const original = JSON.parse(originalBytes.toString("utf8")) as CaseFile;
const originalSerialization = JSON.stringify(original);
const readJson = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const patches = (version: string) => readJson<CasePresentationPatch[]>(`content/zh/presentation/${version}/patches.json`);
const aliases = (version: string) => readJson<QuestionAliasPack[]>(`content/zh/question-aliases/${version}/packs.json`);
const aliasPack = mergeQuestionAliasPacks(aliases("v1.6"), aliases("v1.7")).find((pack) => pack.caseId === original.id)!;
const selectedIds = loadReleaseContent(root, "v2.12-internal-rc").entries.map((entry) => entry.id);
const selectedPatch = selectPresentationPatches(root, "v2.12-internal-rc", selectedIds).get(original.id)!;
const file = applyQuestionAliasPack(applyPresentationPatch(original, selectedPatch), aliasPack);
const expected: Array<{ id: string; label: string; code: AnswerCode; changed: boolean }> = [
  { id: "query-person-inside", label: "敲击发生时，冷藏室里是否有人？", code: "no", changed: false },
  { id: "query-knock-source", label: "敲门声是人敲的吗？", code: "no", changed: true },
  { id: "query-door-mechanism", label: "这扇门关闭后会自动锁住吗？", code: "yes", changed: false },
  { id: "query-phone-inside", label: "手机在冷藏室里吗？", code: "yes", changed: true },
  { id: "query-lin-ownership", label: "留下的设备属于林澈吗？", code: "yes", changed: false },
  { id: "query-sample-location", label: "样本在外面的储物柜里吗？", code: "yes", changed: true },
  { id: "query-lin-motive", label: "林澈这么做是为了拖延检查吗？", code: "yes", changed: true },
  { id: "query-fang-entered", label: "方砚后来进过冷藏室吗？", code: "no", changed: true },
  { id: "query-irrelevant-color", label: "金属托盘是什么颜色？", code: "irrelevant", changed: true },
];

// Deterministic engine fixture, not a blind-player or browser execution claim.
function discoverAuthoredEvidence(caseFile: CaseFile) {
  let state = createInitialState(caseFile);
  for (let pass = 0; pass < 4; pass += 1) {
    for (const query of caseFile.questionSemantics) state = askNaturalLanguage(caseFile, state, query.examplePhrases![0]).state;
    for (const location of caseFile.entities.filter((item) => item.kind === "location")) state = visitLocation(caseFile, state, location.id).state;
    for (const evidenceId of getDiscoverableEvidenceIds(caseFile, state)) state = discoverEvidence(caseFile, state, evidenceId).state;
  }
  return state;
}

test("v2.12 C01 overlay contains only six reviewed public labels, all authored original examples", () => {
  const corrections = patches("v2.12");
  assert.equal(corrections.length, 1);
  const correction = corrections[0];
  assert.deepEqual(Object.keys(correction).sort(), ["baseCanonicalHash", "caseId", "presentationRevision", "questionLabels"]);
  assert.equal(correction.caseId, original.id);
  assert.equal(validatePresentationPatch(correction, original).ok, true);
  assert.equal(validateQuestionAliasPack(original, aliasPack).valid, true);
  assert.deepEqual(Object.keys(correction.questionLabels!).sort(), expected.filter((item) => item.changed).map((item) => item.id).sort());
  for (const [id, label] of Object.entries(correction.questionLabels!)) {
    assert.ok(original.questionSemantics.find((query) => query.id === id)?.examplePhrases?.includes(label), id);
  }
});

for (const item of expected) {
  test(`v2.12 C01 ${item.id}: public interpretation matches its predicate and original answer code`, () => {
    const query = original.questionSemantics.find((candidate) => candidate.id === item.id)!;
    const initial = createRuntimeState(file);
    const projected = projectPlayerState(file, initial).questionScaffolds.find((candidate) => candidate.queryId === item.id)!;
    assert.equal(projected.label, item.label);
    const normalized = normalizeQuestion(file, projected.label);
    assert.equal(normalized.status, "matched");
    assert.equal(normalized.queryId, query.id);
    assert.deepEqual(normalized.candidateQueryIds, [query.id]);
    assert.equal(query.answerCodeWhenVisible, item.code);

    const fresh = reduceGameCommand(file, initial, { type: "ask_text", rawText: projected.label });
    assert.equal(fresh.accepted, true);
    assert.equal(fresh.projection.transcript.at(-1)?.interpretedAs, projected.label);
    assert.equal(fresh.projection.transcript.at(-1)?.answerCode, askNaturalLanguage(original, createInitialState(original), query.examplePhrases![0]).code);

    const discovered = discoverAuthoredEvidence(file);
    assert.ok((query.supportingFactIds ?? []).every((id) => discovered.visibleFactIds.includes(id)), query.id);
    const actual = askNaturalLanguage(file, discovered, projected.label);
    const baseline = askNaturalLanguage(original, discoverAuthoredEvidence(original), query.examplePhrases![0]);
    assert.equal(actual.code, item.code);
    assert.deepEqual(actual, { ...baseline, normalization: normalized });
  });
}

test("v2.12 profile selection leaves every historical profile and every other selected case unchanged", () => {
  const byVersion = new Map(["v1.2", "v1.4", "v1.7"].map((version) => [version, new Map(patches(version).map((patch) => [patch.caseId, patch]))]));
  const profiles = readdirSync(resolve(root, "content/zh/releases")).filter((name) => name.endsWith(".json") && !["v2.12-internal-rc.json", "v2.12-m01-dev.json", "v2.12-m2-dev.json", "v2.12-m3-dev.json"].includes(name));
  assert.ok(profiles.includes("v2.11-internal-rc.json"));
  for (const name of [...profiles, "v2.12-other-profile.json", "v2.13-internal-rc.json"]) {
    const profile = name.slice(0, -5);
    const match = /^v(\d+)\.(\d+)/u.exec(profile);
    const version = match ? Number(match[1]) * 100 + Number(match[2]) : 0;
    const baseline = new Map<string, CasePresentationPatch>();
    for (const id of selectedIds) {
      const base = version >= 102 ? byVersion.get(version >= 104 ? "v1.4" : "v1.2")?.get(id) : undefined;
      const patch = mergePresentationPatch(base, version >= 107 ? byVersion.get("v1.7")?.get(id) : undefined);
      if (patch) baseline.set(id, patch);
    }
    assert.deepEqual(selectPresentationPatches(root, profile, selectedIds), baseline, profile);
  }
  const current = selectPresentationPatches(root, "v2.12-internal-rc", selectedIds);
  // The explicitly added development profile opts in to precisely the existing v2.12 copy.
  assert.deepEqual(selectPresentationPatches(root, "v2.12-m01-dev", selectedIds), current);
  assert.deepEqual(selectPresentationPatches(root, "v2.12-m2-dev", selectedIds), current);
  assert.deepEqual(selectPresentationPatches(root, "v2.12-m3-dev", selectedIds), current);
  const historical = selectPresentationPatches(root, "v2.11-internal-rc", selectedIds);
  for (const id of selectedIds.filter((id) => id !== original.id)) assert.deepEqual(current.get(id), historical.get(id), id);
  assert.deepEqual(selectPresentationPatches(root, "v2.12-internal-rc", []), new Map());
});

test("v2.12 public copy preserves frozen bytes, identity, query rules, and truth-bearing references", () => {
  const frozenHashes: Record<string, string> = {
    "content/zh/cases/c01-cold-room-knock.json": "0bfca99efbf3fbef3667241f6fbd3cd46a81c1ef58879a235fbdc4ad39df65de",
    "content/zh/presentation/v1.2/patches.json": "0dd3e4349ecdc4895f1a7458d4bbce4fac283e716de10cad4e59eda3e72741e0",
    "content/zh/presentation/v1.4/patches.json": "9f8994dc483f1c76abfb6964d786aa07b5ed6ccf0e4db80288bb9f8514e1808f",
    "content/zh/presentation/v1.7/patches.json": "64caa69f316324ca3a8c771b0229c42bc579c3b96847ef5e2591617b934eff3d",
    "content/zh/question-aliases/v1.6/packs.json": "a217b7b14d331380bced2a2af204ac83720da52f9d21215be0fb375bf94185b9",
    "content/zh/question-aliases/v1.7/packs.json": "f1fc7de27a9eeb7a876d4b5294ab228bcf78c79f2c25e3f61848372d77735be3",
  };
  for (const [path, hash] of Object.entries(frozenHashes)) assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), hash, path);
  assert.deepEqual(readFileSync(casePath), originalBytes);
  assert.equal(JSON.stringify(original), originalSerialization);
  assert.equal(file.id, original.id);
  assert.equal(file.metadata?.contentVersion, original.metadata?.contentVersion);
  assert.equal(file.metadata?.canonicalHash, original.metadata?.canonicalHash);
  for (const key of ["facts", "events", "relations", "visibilityRules", "contradictions", "solutionCertificate"] as const) assert.equal(file[key], original[key], key);
  assert.deepEqual(file.questionSemantics.map(({ labelKey: _label, ...query }) => query), original.questionSemantics.map(({ labelKey: _label, ...query }) => query));
});

test("v2.12 C01 fresh public projection retains the neutral-theory boundary without complete canonical copy", () => {
  const fresh = projectPlayerState(file, createRuntimeState(file));
  const canonical = file.hypotheses.find((item) => item.id === file.solutionCertificate.canonicalHypothesisId)!;
  const canonicalText = file.localization?.["zh-CN"]?.[String(canonical.labelKey)];
  assert.ok(canonicalText);
  assert.ok(!JSON.stringify(fresh).includes(canonicalText));
  assert.ok(fresh.theoryOptions.length >= 2);
  assert.deepEqual(fresh.replay, []);
  assert.deepEqual(fresh.transcript, []);
  assert.equal(fresh.solved, false);
  assert.equal(fresh.questionScaffolds.length, expected.length);
  const serialized = JSON.stringify(fresh);
  for (const denied of ["solutionCertificate", "canonicalHypothesisId", "path-canonical", "path-delayed-sound"]) assert.ok(!serialized.includes(denied), denied);
  for (const caption of Object.values(selectedPatch.replayCaptions ?? {})) assert.ok(!serialized.includes(caption), caption);
});

test("v2.12 label corrections replay a legitimate v2.11 AI-confirmed schema-one command without rewriting it", () => {
  const historicalPatch = selectPresentationPatches(root, "v2.11-internal-rc", selectedIds).get(original.id)!;
  const historicalFile = applyQuestionAliasPack(applyPresentationPatch(original, historicalPatch), aliasPack);
  const rawText = "门自己锁了吗？";
  const offer = createQuestionRoutingOffer(historicalFile, createRuntimeState(historicalFile), rawText);
  const command: GameCommand = { type: "ask_resolved_text", rawText, queryId: "query-door-mechanism", resolutionSource: "ai-confirmed", contextHash: offer.context.contextHash };
  const save: SaveEnvelope = { schemaVersion: 1, caseId: original.id, caseVersion: original.metadata!.contentVersion!, contentHash: original.metadata!.canonicalHash!, commands: [command], updatedAt: "2026-09-06T00:00:00.000Z" };
  const bytes = JSON.stringify(save);
  const historical = replayCommands(historicalFile, save.commands);
  assert.equal(historical.accepted, true);
  assert.notEqual(createQuestionRoutingOffer(file, createRuntimeState(file), rawText).context.contextHash, command.contextHash);
  // Compatibility belongs only to saved-log replay; live stale offers still fail closed.
  assert.equal(reduceGameCommand(file, createRuntimeState(file), command).accepted, false);
  const contexts = selectHistoricalQuestionRoutingContexts(root, "v2.12-internal-rc", selectedIds);
  const replayed = replayCommands(file, save.commands, { historicalQuestionRoutingContexts: contexts[original.id] });
  assert.equal(replayed.accepted, true);
  assert.equal(replayed.state.transcript.at(-1)?.answerCode, historical.state.transcript.at(-1)?.answerCode);
  assert.equal(replayed.state.transcript.at(-1)?.rawQuestion, rawText);
  assert.equal(JSON.stringify(save), bytes);
  assert.equal(save.schemaVersion, 1);
});

test("v2.12 historical routing metadata is worker-only public context scoped to C01 and the exact profile", () => {
  const contexts = selectHistoricalQuestionRoutingContexts(root, "v2.12-internal-rc", selectedIds);
  assert.deepEqual(Object.keys(contexts), [original.id]);
  assert.equal(contexts[original.id].length, 1);
  const context = contexts[original.id][0];
  assert.deepEqual(Object.keys(context).sort(), ["candidates", "caseId", "caseVersion", "contentHash", "sourceProfile"]);
  assert.equal(context.sourceProfile, "v2.11-internal-rc");
  assert.equal(context.candidates.length, 9);
  assert.equal(context.candidates.find((item) => item.queryId === "query-knock-source")?.label, "三下敲击是否真的来自门内？");
  const serialized = JSON.stringify(context);
  for (const denied of ["solutionCertificate", "canonicalHypothesisId", "supportingFactIds", "answerCode", "truth", "matchRules"]) assert.ok(!serialized.includes(denied), denied);
  for (const profile of ["v2.11-internal-rc", "v2.12-other-profile", "v2.13-internal-rc"]) assert.deepEqual(selectHistoricalQuestionRoutingContexts(root, profile, selectedIds), {}, profile);
  assert.deepEqual(selectHistoricalQuestionRoutingContexts(root, "v2.12-internal-rc", selectedIds.filter((id) => id !== original.id)), {});
});
