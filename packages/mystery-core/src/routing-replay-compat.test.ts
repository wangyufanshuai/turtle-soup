import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectPresentationPatches } from "../../../tools/generate-content-registry.ts";
import { createCanonicalSave } from "../../../tools/lib/canonical-save.ts";
import { mergeQuestionAliasPacks } from "../../../tools/lib/v17-overlays.ts";
import { applyPresentationPatch } from "./presentation-patch.ts";
import { applyQuestionAliasPack } from "./question-alias-pack.ts";
import { createQuestionRoutingOffer, createQuestionRoutingReplayContext, createRuntimeState, reduceGameCommand, replayCommands } from "./runtime.ts";
import type { CaseFile, GameCommand, QuestionAliasPack } from "./types.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const json = <T>(path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const base = json<CaseFile>("content/zh/cases/c01-cold-room-knock.json");
const aliases = mergeQuestionAliasPacks(json<QuestionAliasPack[]>("content/zh/question-aliases/v1.6/packs.json"), json<QuestionAliasPack[]>("content/zh/question-aliases/v1.7/packs.json")).find((pack) => pack.caseId === base.id);
const historical = applyQuestionAliasPack(applyPresentationPatch(base, selectPresentationPatches(root, "v2.11-internal-rc", [base.id]).get(base.id)), aliases);
const current = applyQuestionAliasPack(applyPresentationPatch(base, selectPresentationPatches(root, "v2.12-internal-rc", [base.id]).get(base.id)), aliases);
const context = createQuestionRoutingReplayContext(historical, "v2.11-internal-rc");
const options = { historicalQuestionRoutingContexts: [context] };
type ResolvedQuestion = Extract<GameCommand, { type: "ask_resolved_text" }>;

// Fixed v2.11 public-context witnesses, not hashes minted from the v2.12 expected state.
const door: ResolvedQuestion = { type: "ask_resolved_text", rawText: "门自己锁了吗？", queryId: "query-door-mechanism", resolutionSource: "ai-confirmed", contextHash: "3b6e4f92" };
const knock: ResolvedQuestion = { type: "ask_resolved_text", rawText: "我想问敲击声是不是人发出的？", queryId: "query-knock-source", resolutionSource: "ai-confirmed", contextHash: "82459ce6" };

test("historical routing witnesses are bound to unchanged v2.11 public-source bytes and contain no truth", () => {
  const hashes: Record<string, string> = {
    "content/zh/cases/c01-cold-room-knock.json": "0bfca99efbf3fbef3667241f6fbd3cd46a81c1ef58879a235fbdc4ad39df65de",
    "content/zh/presentation/v1.4/patches.json": "9f8994dc483f1c76abfb6964d786aa07b5ed6ccf0e4db80288bb9f8514e1808f",
    "content/zh/presentation/v1.7/patches.json": "64caa69f316324ca3a8c771b0229c42bc579c3b96847ef5e2591617b934eff3d",
    "content/zh/question-aliases/v1.6/packs.json": "a217b7b14d331380bced2a2af204ac83720da52f9d21215be0fb375bf94185b9",
    "content/zh/question-aliases/v1.7/packs.json": "f1fc7de27a9eeb7a876d4b5294ab228bcf78c79f2c25e3f61848372d77735be3",
  };
  for (const [path, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), expected, path);
  assert.deepEqual(Object.keys(context).sort(), ["sourceProfile", "caseId", "caseVersion", "contentHash", "candidates"].sort());
  for (const candidate of context.candidates) assert.deepEqual(Object.keys(candidate).sort(), ["queryId", "label", "target", "predicate", "qualifier"].sort());
  for (const forbidden of ["solutionCertificate", "truthGraph", "answerCode", "supportingFactIds", "visibleFactIds", "canonicalHypothesisId"]) assert.ok(!JSON.stringify(context).includes(forbidden));
  for (const command of [door, knock]) {
    assert.equal(createQuestionRoutingOffer(historical, createRuntimeState(historical), command.rawText).context.contextHash, command.contextHash);
    assert.equal(reduceGameCommand(historical, createRuntimeState(historical), command).accepted, true);
  }
});

test("v2.11 confirmed questions replay only with historical authority; facts and answers survive while display is current", () => {
  const commands: GameCommand[] = [{ type: "start_case" }, { ...door, rawText: `  ${door.rawText}  ` }, knock];
  const before = JSON.stringify(commands);
  const old = replayCommands(historical, commands);
  assert.throws(() => replayCommands(current, commands), /无法重放/);
  const replayed = replayCommands(current, commands, options);
  assert.equal(replayed.accepted, true);
  assert.deepEqual(replayed.state.game, old.state.game);
  assert.deepEqual(replayed.state.transcript.map((entry) => [entry.answerCode, entry.answerText, entry.rawQuestion]), old.state.transcript.map((entry) => [entry.answerCode, entry.answerText, entry.rawQuestion]));
  assert.equal(replayed.state.transcript[1].interpretedAs, "敲门声是人敲的吗？");
  assert.equal(old.state.transcript[1].interpretedAs, "三下敲击是否真的来自门内？");
  assert.equal(replayed.state.initialDraftOrder, undefined);
  assert.equal(JSON.stringify(commands), before);
  assert.deepEqual(replayed.state, replayCommands(current, commands, options).state);
});

test("live old contexts, forged or absent hashes, wrong raw text and non-whitelisted queries fail closed", () => {
  assert.equal(reduceGameCommand(current, createRuntimeState(current), door).accepted, false);
  for (const command of [
    { ...door, contextHash: "" }, { ...door, contextHash: "stale" }, { ...door, contextHash: "00000000" },
    { ...door, contextHash: "3b6e4f93" }, { ...door, rawText: "不是原来的问题" },
    { ...door, queryId: "query-c61-other-case" }, { ...door, queryId: "forged" },
    { ...door, resolutionSource: "forged" } as unknown as ResolvedQuestion,
  ]) {
    assert.equal(reduceGameCommand(current, createRuntimeState(current), command).accepted, false);
    assert.throws(() => replayCommands(current, [command], options), /无法重放/, JSON.stringify(command));
  }
  const liveOffer = createQuestionRoutingOffer(current, createRuntimeState(current), door.rawText);
  assert.equal(reduceGameCommand(current, createRuntimeState(current), { ...door, contextHash: liveOffer.context.contextHash }).accepted, true);
});

test("historical authority rejects wrong case/version/hash/profile and changed query whitelists", () => {
  for (const altered of [
    { ...context, caseId: "c02-snow-route" }, { ...context, caseVersion: context.caseVersion + 1 },
    { ...context, contentHash: "sha256:wrong" }, { ...context, sourceProfile: "v2.10-internal-rc" } as unknown as typeof context,
    { ...context, candidates: context.candidates.slice(1) },
    { ...context, candidates: [...context.candidates, context.candidates[0]] },
  ]) assert.throws(() => replayCommands(current, [door], { historicalQuestionRoutingContexts: [altered] }), /无法重放/);
  for (const altered of [
    { ...current, id: "c02-snow-route" },
    { ...current, metadata: { ...current.metadata, contentVersion: 2 } },
    { ...current, metadata: { ...current.metadata, canonicalHash: "different" } },
    { ...current, questionSemantics: current.questionSemantics.filter((query) => query.id !== "query-irrelevant-color") },
  ]) assert.throws(() => replayCommands(altered, [door], options), /无法重放/);
});

test("historical AI replay preserves no-scaffolds and limited-question rules", () => {
  // Author-informed solved prefix ensures rejection occurs at the AI command, not the mode gate.
  const solved = createCanonicalSave(historical).commands;
  for (const mode of ["no-scaffolds", "limited-questions"] as const) {
    const prefix: GameCommand[] = [...solved, { type: "set_replay_mode", mode }];
    assert.equal(replayCommands(current, prefix, options).state.replayMode, mode);
    assert.throws(() => replayCommands(current, [...prefix, door], options), new RegExp(`第 ${prefix.length + 1} 个操作`));
  }
  const mode: GameCommand = { type: "set_replay_mode", mode: "limited-questions" };
  const prefix = [...solved, mode];
  const oldState = replayCommands(historical, prefix).state;
  const command = { ...door, contextHash: createQuestionRoutingOffer(historical, oldState, door.rawText).context.contextHash };
  const limit = current.replayChallenges?.find((challenge) => challenge.mode === "limited-questions")?.questionLimit ?? 12;
  assert.equal(replayCommands(current, [...prefix, ...Array.from({ length: limit }, () => command)], options).state.transcript.length, limit);
  assert.throws(() => replayCommands(current, [...prefix, ...Array.from({ length: limit + 1 }, () => command)], options), new RegExp(`第 ${prefix.length + limit + 1} 个操作`));
});

test("old non-AI logs remain unchanged and new opaque-start logs remain distinct", () => {
  const oldCommands: GameCommand[] = [{ type: "start_case" }, { type: "ask_text", rawText: "这扇门会自动上锁吗？" }];
  const bytes = JSON.stringify(oldCommands);
  assert.deepEqual(replayCommands(current, oldCommands, options), replayCommands(current, oldCommands));
  assert.equal(JSON.stringify(oldCommands), bytes);
  const newCommands: GameCommand[] = [{ type: "start_case", initialDraftOrder: "opaque" }, oldCommands[1]];
  assert.equal(replayCommands(current, newCommands, options).state.initialDraftOrder, "opaque");
  assert.equal(replayCommands(current, oldCommands, options).state.initialDraftOrder, undefined);
});
