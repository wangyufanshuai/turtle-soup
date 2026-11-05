import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  sanitizeGameCommand,
  type CaseFile,
  type GameCommand,
  type SaveEnvelope,
} from "@turtle-soup/mystery-core";
import { createRuntimeWorkerHandler } from "./runtime-handler.ts";
import type { RuntimeWorkerResponse } from "../lib/worker-protocol.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const readCase = (id = "c01-cold-room-knock") =>
  JSON.parse(readFileSync(`${root}/content/zh/cases/${id}.json`, "utf8")) as CaseFile;
type Response = Extract<RuntimeWorkerResponse, { projection: unknown }>;
async function worker(save?: SaveEnvelope, file = readCase()) {
  let sequence = 0,
    response: Response;
  const dependencies: Parameters<typeof createRuntimeWorkerHandler>[0] & {
    investigationRevision: "m2";
  } = {
    investigationRevision: "m2",
    questionLanguageRevision: "m01",
    loadCase: async () => file,
    postMessage: (r) => {
      assert.ok("projection" in r, JSON.stringify(r));
      response = r;
    },
  };
  const handler = createRuntimeWorkerHandler(dependencies);
  await handler({ id: ++sequence, type: "initialize", caseId: file.id, save });
  return {
    initial: response!,
    async command(command: GameCommand) {
      await handler({ id: ++sequence, type: "command", command });
      return response;
    },
  };
}
test("M2 fresh drafts have no chosen explanation and no anonymous numbered alternatives", async () => {
  const w = await worker();
  assert.ok(w.initial.projection.theoryDrafts.every((d) => d.hypothesisId === ""));
  assert.deepEqual(w.initial.projection.theoryOptions, []);
  assert.equal(w.initial.projection.canSubmit, false);
  assert.deepEqual((await worker(w.initial.save)).initial.projection, w.initial.projection);
});

for (const [id, materials] of [
  [
    "c01-cold-room-knock",
    ["evidence-door-latch", "evidence-knock-recording", "evidence-metal-tray-mark"],
  ],
  [
    "c03-second-shadow",
    ["evidence-witness-statement", "evidence-costume-rack", "evidence-call-sheet"],
  ],
  [
    "c61-missing-tape-turn",
    ["evidence-c61-01", "evidence-c61-02", "evidence-c61-03", "evidence-c61-05"],
  ],
  [
    "c84-handoff-after-stop",
    ["evidence-c84-01", "evidence-c84-03", "evidence-c84-04", "evidence-c84-05"],
  ],
] as const)
  test(`${id}: all alternatives appear together after reading, explicit choices and notes survive save/undo/restart`, async () => {
    const file = readCase(id),
      w = await worker(undefined, file);
    const early = await w.command({
      type: "set_theory_hypothesis",
      theoryId: "theory-a",
      hypothesisId: "path-canonical",
    });
    assert.equal(early.accepted, false);
    let r = w.initial;
    for (const [index, evidenceId] of materials.entries()) {
      r = await w.command({ type: "set_evidence_state", evidenceId, state: "examined" });
      assert.equal(r.accepted, true, evidenceId);
      assert.equal(r.projection.theoryOptions.length, index === materials.length - 1 ? 3 : 0);
    }
    assert.ok(r.projection.theoryDrafts.every((d) => d.hypothesisId === ""));
    assert.ok(
      r.projection.theoryOptions.every(
        (o) => o.label.length >= 8 && !/解释\s*\d|待验证解释/u.test(o.label),
      ),
    );
    const choice = r.projection.theoryOptions[1].id;
    r = await w.command({
      type: "set_theory_hypothesis",
      theoryId: "theory-a",
      hypothesisId: choice,
    });
    assert.equal(r.save.commands.at(-1)?.type, "choose_explanation");
    assert.equal(r.projection.theoryDrafts[0].hypothesisId, choice);
    await w.command({
      type: "set_theory_note",
      revision: "m2",
      theoryId: "theory-a",
      text: "我认为",
    });
    r = await w.command({
      type: "set_theory_note",
      revision: "m2",
      theoryId: "theory-a",
      text: "我认为需要核对来源，暂不下结论。",
    });
    assert.equal(r.save.commands.filter((c) => c.type === "set_theory_note").length, 1);
    await w.command({ type: "select_theory", theoryId: "theory-b" });
    await w.command({
      type: "set_theory_note",
      revision: "m2",
      theoryId: "theory-b",
      text: "另一种可能，需要反证。",
    });
    r = await w.command({ type: "select_theory", theoryId: "theory-a" });
    assert.equal(r.projection.theoryDrafts[0].note, "我认为需要核对来源，暂不下结论。");
    assert.equal(r.projection.theoryDrafts[1].note, "另一种可能，需要反证。");
    assert.equal(r.projection.theoryDrafts[1].hypothesisId, "");
    assert.deepEqual((await worker(r.save, file)).initial.projection, r.projection);
    const question = r.projection.questionScaffolds.find((c) => c.starterEligible)!;
    r = await w.command({ type: "ask_text", rawText: question.label });
    assert.equal(r.accepted, true, question.label);
    const entry = r.projection.transcript.at(-1)!;
    assert.ok(
      entry.relatedEvidenceIds?.every((eid) => r.projection.evidence.some((e) => e.id === eid)),
    );
    r = await w.command({ type: "undo_last_question" });
    assert.equal(r.projection.theoryDrafts[0].hypothesisId, choice);
    assert.equal(r.projection.theoryDrafts[0].note, "我认为需要核对来源，暂不下结论。");
    assert.deepEqual((await worker(r.save, file)).initial.projection, r.projection);
    const eventId = r.projection.eventOptions[0]?.id;
    assert.ok(eventId);
    r = await w.command({ type: "upsert_theory_event", theoryId: "theory-a", eventId });
    assert.equal(r.accepted, true);
    r = await w.command({
      type: "link_theory_evidence",
      theoryId: "theory-a",
      evidenceId: materials[0],
      linked: true,
    });
    assert.equal(r.accepted, true);
    const draftBefore = r.projection.theoryDrafts[0];
    r = await w.command({ type: "clear_explanation", revision: "m2", theoryId: "theory-a" });
    assert.equal(r.projection.theoryDrafts[0].hypothesisId, "");
    assert.deepEqual(r.projection.theoryDrafts[0].eventIds, draftBefore.eventIds);
    assert.deepEqual(r.projection.theoryDrafts[0].evidenceIds, draftBefore.evidenceIds);
    assert.equal(r.projection.theoryDrafts[0].note, draftBefore.note);
    assert.equal(r.projection.canSubmit, false);
    assert.deepEqual((await worker(r.save, file)).initial.projection, r.projection);
    r = await w.command({ type: "restart_case" });
    assert.ok(
      r.projection.theoryDrafts.every((d) => d.hypothesisId === "" && d.note === undefined),
    );
    assert.equal(r.save.commands.length, 1);
    assert.equal(r.save.commands[0].type, "begin_investigation");
  });

test("stale confirmations fail after a newer question; cancel, notes and two drafts remain separate", async () => {
  const w = await worker(),
    raw = "冷藏室里没有人，对吗？";
  let r = await w.command({ type: "ask_text", rawText: raw });
  const oldCandidate = r.projection.interpretation!.candidates[0].queryId;
  assert.deepEqual((await worker(r.save)).initial.projection, r.projection);
  r = await w.command({ type: "ask_text", rawText: "门会自动锁住吗？" });
  const before = JSON.stringify(r.save.commands);
  r = await w.command({ type: "confirm_interpretation", queryId: oldCandidate, rawText: raw });
  assert.equal(r.accepted, false);
  assert.equal(JSON.stringify(r.save.commands), before);
  assert.equal(r.projection.transcript.length, 1);
  await w.command({ type: "ask_text", rawText: raw });
  r = await w.command({ type: "dismiss_interpretation", rawText: raw });
  assert.equal((await worker(r.save)).initial.projection.interpretation, undefined);
  const noChoice = await w.command({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(noChoice.accepted, false);
  assert.equal(noChoice.projection.solved, false);
});

test("M2 command validation preserves note whitespace and rejects malformed revisions and overlong notes", () => {
  const c = {
    type: "set_theory_note",
    revision: "m2",
    theoryId: "theory-a",
    text: " 第一行\n第二行 ",
  };
  assert.deepEqual(sanitizeGameCommand(c), c);
  assert.equal(sanitizeGameCommand({ ...c, revision: "m3" }), undefined);
  assert.equal(sanitizeGameCommand({ ...c, text: "字".repeat(4001) }), undefined);
  assert.equal(sanitizeGameCommand({ type: "begin_investigation", revision: "m3" }), undefined);
});

test("unrelated answers have no invented sources, while unknown facts never reveal hidden evidence identities", async () => {
  const w = await worker();
  let r = await w.command({ type: "ask_text", rawText: "金属托盘是什么颜色？" });
  assert.equal(r.accepted, true);
  assert.deepEqual(r.projection.transcript[0].relatedEvidenceIds, []);
  r = await w.command({ type: "ask_text", rawText: "手机属于林澈吗？" });
  assert.equal(r.accepted, true);
  assert.equal(r.projection.transcript.at(-1)?.answerCode, "unknown");
  assert.deepEqual(r.projection.transcript.at(-1)?.relatedEvidenceIds, []);
  assert.ok(!r.projection.evidence.some((e) => e.id === "evidence-phone-pairing"));
  assert.deepEqual((await worker(r.save)).initial.projection, r.projection);
});
test("M2 answer links contain only currently public evidence supporting the interpreted proposition", async () => {
  const w = await worker();
  const r = await w.command({ type: "ask_text", rawText: "门会自动锁住吗？" });
  assert.equal(r.accepted, true);
  const entry = r.projection.transcript[0] as (typeof r.projection.transcript)[0] & {
    relatedEvidenceIds?: string[];
  };
  assert.ok(entry.relatedEvidenceIds?.includes("evidence-door-latch"));
  assert.ok(entry.relatedEvidenceIds);
  assert.ok(!entry.relatedEvidenceIds.includes("evidence-phone-pairing"));
  assert.ok(entry.relatedEvidenceIds.every((id) => r.projection.evidence.some((e) => e.id === id)));
  assert.deepEqual((await worker(r.save)).initial.projection, r.projection);
});
test("M2 old default is not a player choice, while explicit historical selection remains intact", async () => {
  const w = await worker();
  const legacy: SaveEnvelope = {
    ...w.initial.save,
    commands: [{ type: "start_case", initialDraftOrder: "opaque" }],
  };
  const restored = await worker(legacy);
  assert.equal(restored.initial.restoreStatus, "restored");
  assert.ok(restored.initial.projection.theoryDrafts.every((d) => d.hypothesisId === ""));
  const chosen: SaveEnvelope = {
    ...legacy,
    commands: [
      ...legacy.commands,
      { type: "set_theory_hypothesis", theoryId: "theory-b", hypothesisId: "path-corridor-fake" },
    ],
  };
  const selected = await worker(chosen);
  assert.equal(selected.initial.restoreStatus, "restored");
  assert.notEqual(selected.initial.projection.theoryDrafts[1].hypothesisId, "");
  assert.equal(selected.initial.projection.theoryDrafts[0].hypothesisId, "");
  assert.ok(
    selected.initial.projection.theoryOptions.some(
      (o) => o.id === selected.initial.projection.theoryDrafts[1].hypothesisId,
    ),
  );
});
