import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  sanitizeGameCommand,
  type CaseFile,
  type GameCommand,
  type ProofOperation,
  type SaveEnvelope,
} from "@turtle-soup/mystery-core";
import { createRuntimeWorkerHandler } from "./runtime-handler.ts";
import type { RuntimeWorkerResponse } from "../lib/worker-protocol.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const readCase = (id = "c61-missing-tape-turn") =>
  JSON.parse(readFileSync(`${root}/content/zh/cases/${id}.json`, "utf8")) as CaseFile;
type Response = Extract<RuntimeWorkerResponse, { projection: unknown }>;
async function worker(file = readCase(), save?: SaveEnvelope) {
  let id = 0,
    response: Response;
  const handler = createRuntimeWorkerHandler({
    proofRevision: "m3",
    investigationRevision: "m2",
    questionLanguageRevision: "m01",
    loadCase: async () => file,
    postMessage: (r) => {
      assert.ok("projection" in r, JSON.stringify(r));
      response = r;
    },
  });
  await handler({ id: ++id, type: "initialize", caseId: file.id, save });
  return {
    initial: response!,
    async send(command: GameCommand) {
      await handler({ id: ++id, type: "command", command });
      return response;
    },
    async edit(operations: ProofOperation[]) {
      await handler({
        id: ++id,
        type: "command",
        command: { type: "edit_proof", revision: "m3", theoryId: "theory-a", operations },
      });
      return response;
    },
  };
}
async function prepared(file = readCase()) {
  const w = await worker(file);
  let r = w.initial;
  for (const evidence of file.evidenceItems)
    r = await w.send({ type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
  return { w, r };
}
const place = (itemId: string, slotId = "slot-01"): ProofOperation => ({
  type: "place_reasoning_item",
  boardId: "board-01",
  slotId,
  itemId,
});

test("M3 board references share event membership while draft boards and temporal order remain independent", async () => {
  const { w, r } = await prepared();
  const e = r.projection.eventOptions.find((e) => e.timeLabel === "20:00")!;
  const placed = await w.edit([place(e.id)]);
  assert.equal(placed.accepted, true);
  assert.deepEqual(placed.projection.theoryDrafts[0].eventIds, [e.id]);
  assert.deepEqual(placed.projection.reasoningBoards[0].connections, []);
  const b = await w.send({ type: "select_theory", theoryId: "theory-b" });
  assert.ok(b.projection.reasoningBoards.every((board) => board.slots.every((s) => !s.itemId)));
  const restored = (await worker(readCase(), b.save)).initial;
  assert.deepEqual(restored.projection, b.projection);
  const a = await w.send({ type: "select_theory", theoryId: "theory-a" });
  assert.equal(a.projection.reasoningBoards[0].slots[0].itemId, e.id);
});

test("M3 failed composite writes neither partial structure nor a log entry", async () => {
  const { w, r } = await prepared();
  const e = r.projection.eventOptions.find((e) => e.timeLabel === "20:00")!;
  const result = await w.edit([place(e.id), place("event-does-not-exist", "slot-02")]);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.projection, r.projection);
  assert.deepEqual(result.save.commands, r.save.commands);
});

test("M3 swap is one saved edit and preserves connections; removing from chain removes board dependencies", async () => {
  const file = readCase();
  file.reasoningBoards![0].slots.forEach((s) => (s.acceptsEventIds = file.events.map((e) => e.id)));
  const { w, r } = await prepared(file);
  const [a, b] = r.projection.eventOptions;
  const initial = await w.edit([
    place(a.id),
    place(b.id, "slot-02"),
    {
      type: "connect_reasoning_items",
      boardId: "board-01",
      fromItemId: a.id,
      toItemId: b.id,
      relation: "calibrates",
    },
  ]);
  const swap = await w.edit([place(b.id), place(a.id, "slot-02")]);
  assert.equal(swap.save.commands.length, initial.save.commands.length + 1);
  assert.deepEqual(
    swap.projection.reasoningBoards[0].slots.slice(0, 2).map((s) => s.itemId),
    [b.id, a.id],
  );
  assert.deepEqual(
    swap.projection.reasoningBoards[0].connections,
    initial.projection.reasoningBoards[0].connections,
  );
  assert.deepEqual(swap.projection.theoryDrafts[0].eventIds, [a.id, b.id]);
  assert.deepEqual((await worker(file, swap.save)).initial.projection, swap.projection);
  const removed = await w.send({
    type: "remove_theory_event",
    theoryId: "theory-a",
    eventId: a.id,
  });
  assert.equal(removed.projection.reasoningBoards[0].slots[1].itemId, undefined);
  assert.deepEqual(removed.projection.reasoningBoards[0].connections, []);
});

test("M3 envelope rejects nested transactions, mixed drafts and unsupported revisions", () => {
  assert.equal(
    sanitizeGameCommand({
      type: "proof_action",
      revision: "m3",
      action: { type: "proof_action", revision: "m3", action: { type: "restart_case" } },
    }),
    undefined,
  );
  assert.equal(
    sanitizeGameCommand({
      type: "edit_proof",
      revision: "m3",
      theoryId: "theory-a",
      operations: [{ type: "clear_explanation", revision: "m2", theoryId: "theory-b" }],
    }),
    undefined,
  );
  assert.equal(
    sanitizeGameCommand({ type: "proof_action", revision: "m4", action: { type: "restart_case" } }),
    undefined,
  );
});

test("M3 undo restores the entire dependency edit, keeps later notes, and survives refresh", async () => {
  const file = readCase();
  file.reasoningBoards![0].slots.forEach((s) => (s.acceptsEventIds = file.events.map((e) => e.id)));
  const { w, r } = await prepared(file);
  const [a, b] = r.projection.eventOptions;
  const connected = await w.edit([
    place(a.id),
    place(b.id, "slot-02"),
    {
      type: "connect_reasoning_items",
      boardId: "board-01",
      fromItemId: a.id,
      toItemId: b.id,
      relation: "calibrates",
    },
  ]);
  await w.send({ type: "remove_theory_event", theoryId: "theory-a", eventId: a.id });
  await w.send({
    type: "set_theory_note",
    revision: "m2",
    theoryId: "theory-a",
    text: "删除以后想到的新线索，撤销结构时仍保留。",
  });
  const restored = await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  assert.deepEqual(restored.projection.reasoningBoards, connected.projection.reasoningBoards);
  assert.deepEqual(
    restored.projection.theoryDrafts[0].eventIds,
    connected.projection.theoryDrafts[0].eventIds,
  );
  assert.match(restored.projection.theoryDrafts[0].note!, /删除以后/);
  assert.deepEqual((await worker(file, restored.save)).initial.projection, restored.projection);
});

test("M3 question undo keeps later inspections and their event references", async () => {
  const file = readCase("c01-cold-room-knock"),
    w = await worker(file);
  await w.send({ type: "ask_text", rawText: "门会自动锁住吗？" });
  const inspected = await w.send({
    type: "set_evidence_state",
    evidenceId: "evidence-metal-tray-mark",
    state: "examined",
  });
  assert.equal(inspected.accepted, true);
  const undone = await w.send({ type: "undo_last_question" });
  assert.equal(undone.projection.transcript.length, 0);
  assert.equal(
    undone.projection.evidence.find((e) => e.id === "evidence-metal-tray-mark")?.state,
    "examined",
  );
  assert.deepEqual(undone.projection.eventOptions, inspected.projection.eventOptions);
  assert.deepEqual((await worker(file, undone.save)).initial.projection, undone.projection);
});

test("M3 evidence remains connected when still used by the other draft", async () => {
  const { w } = await prepared();
  const evidenceId = "evidence-c61-01";
  await w.send({ type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  await w.send({ type: "link_theory_evidence", theoryId: "theory-b", evidenceId, linked: true });
  const unlinked = await w.send({
    type: "link_theory_evidence",
    theoryId: "theory-a",
    evidenceId,
    linked: false,
  });
  assert.equal(unlinked.projection.evidence.find((e) => e.id === evidenceId)?.state, "connected");
  assert.deepEqual(unlinked.projection.theoryDrafts[1].evidenceIds, [evidenceId]);
});

async function solvedC61(id = "c61-missing-tape-turn") {
  const file = readCase(id),
    { w, r } = await prepared(file);
  const eventMap = new Map(
    file.events.map((e) => [
      e.id,
      r.projection.eventOptions.find((p) => p.timeLabel === (e.time as { value: string }).value)!
        .id,
    ]),
  );
  const option = r.projection.theoryOptions.find((o) =>
    o.label.includes(id.startsWith("c61") ? "不同测量基准" : "接收命令"),
  )!;
  await w.send({ type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: option.id });
  for (const event of file.events)
    await w.send({
      type: "upsert_theory_event",
      theoryId: "theory-a",
      eventId: eventMap.get(event.id)!,
    });
  for (const evidence of file.evidenceItems)
    await w.send({
      type: "link_theory_evidence",
      theoryId: "theory-a",
      evidenceId: evidence.id,
      linked: true,
    });
  await w.send({
    type: "set_theory_motive",
    theoryId: "theory-a",
    motiveKey: option.motiveOptions[0].id,
  });
  for (const [i, obligation] of file.solutionCertificate.proofObligations!.entries()) {
    const boardId = `board-0${i + 1}`;
    for (const [j, p] of obligation.requiredPlacements!.entries())
      await w.send({
        type: "place_reasoning_item",
        boardId,
        slotId: `slot-0${j + 1}`,
        itemId: eventMap.get(p.eventId)!,
      });
    for (const c of obligation.requiredConnections!)
      await w.send({
        type: "connect_reasoning_items",
        boardId,
        fromItemId: eventMap.get(c.fromEventId)!,
        toItemId: eventMap.get(c.toEventId)!,
        relation: c.relation,
      });
  }
  const solved = await w.send({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(solved.projection.solved, true, JSON.stringify(solved.events));
  return { file, w, solved };
}

test("M3 editing a solved proof requires resubmission and preserves its previous verified replay", async () => {
  const { file, w, solved } = await solvedC61();
  const reopened = await w.send({ type: "select_theory", theoryId: "theory-a" });
  assert.equal(reopened.projection.solved, false);
  assert.ok(reopened.projection.previousVerifiedProof?.replay.length);
  const removed = await w.send({
    type: "remove_theory_event",
    theoryId: "theory-a",
    eventId: solved.projection.theoryDrafts[0].eventIds[0],
  });
  assert.equal(removed.projection.solved, false);
  assert.equal(removed.save.completed, false);
  const invalidReplay = await w.send({ type: "request_proof_replay" });
  assert.equal(invalidReplay.accepted, false);
  const undone = await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  assert.equal(undone.projection.solved, false);
  assert.deepEqual((await worker(file, undone.save)).initial.projection, undone.projection);
  const resubmitted = await w.send({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(resubmitted.projection.solved, true);
});

test("M3 wrong public placement is retained for verification, with persistent actionable feedback and correction", async () => {
  const { file, w, solved } = await solvedC61();
  await w.send({ type: "select_theory", theoryId: "theory-a" });
  const wrong = solved.projection.eventOptions.find((e) => e.timeLabel === "20:04")!,
    right = solved.projection.eventOptions.find((e) => e.timeLabel === "20:00")!;
  const placed = await w.edit([place(wrong.id)]);
  assert.equal(placed.accepted, true);
  const failed = await w.send({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(failed.projection.solved, false);
  assert.equal(failed.projection.reasoningBoards[0].slots[0].itemId, wrong.id);
  assert.equal(failed.projection.proofFeedback?.boardId, "board-01");
  assert.equal(failed.projection.proofFeedback?.nextStep, "board");
  assert.equal(failed.projection.proofFeedback?.stale, false);
  assert.deepEqual((await worker(file, failed.save)).initial.projection, failed.projection);
  const corrected = await w.edit([place(right.id)]);
  assert.equal(corrected.projection.proofFeedback?.stale, true);
  // Replacing the node deliberately removes its old incident edges; undo restores both.
  await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  const resubmitted = await w.send({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(resubmitted.projection.solved, true);
});

test("M3 relation replacement commits once, invalid replacement keeps the original, undo restores it", async () => {
  const { w, solved } = await solvedC61();
  await w.send({ type: "select_theory", theoryId: "theory-a" });
  const connection = solved.projection.reasoningBoards[0].connections[0];
  const before = await w.send({
    type: "set_theory_note",
    revision: "m2",
    theoryId: "theory-a",
    text: "核对两种关系。",
  });
  const failed = await w.edit([
    { type: "disconnect_reasoning_items", boardId: "board-01", ...connection },
    {
      type: "connect_reasoning_items",
      boardId: "board-01",
      ...connection,
      relation: "not-an-authored-relation",
    },
  ]);
  assert.equal(failed.accepted, false);
  assert.deepEqual(failed.save.commands, before.save.commands);
  const changed = await w.edit([
    { type: "disconnect_reasoning_items", boardId: "board-01", ...connection },
    {
      type: "connect_reasoning_items",
      boardId: "board-01",
      ...connection,
      relation: "interpolates",
    },
  ]);
  assert.equal(changed.save.commands.length, before.save.commands.length + 1);
  assert.ok(
    changed.projection.reasoningBoards[0].connections.some(
      (c) => c.fromItemId === connection.fromItemId && c.relation === "interpolates",
    ),
  );
  const undone = await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  assert.deepEqual(undone.projection.reasoningBoards[0], before.projection.reasoningBoards[0]);
});

test("M3 C84 rejects a temporal cycle even when every frozen certificate obligation is present", async () => {
  const { w, solved } = await solvedC61("c84-handoff-after-stop");
  const board = solved.projection.reasoningBoards[1];
  await w.send({ type: "select_theory", theoryId: "theory-a" });
  await w.send({
    type: "connect_reasoning_items",
    boardId: board.id,
    fromItemId: board.slots[3].itemId!,
    toItemId: board.slots[0].itemId!,
    relation: "precedes",
  });
  const cycle = await w.send({ type: "submit_theory", theoryId: "theory-a" });
  assert.equal(cycle.projection.solved, false);
  assert.match(cycle.projection.proofFeedback!.message, /循环/);
  assert.equal(cycle.projection.proofFeedback?.boardId, board.id);
  assert.equal((await w.send({ type: "request_proof_replay" })).accepted, false);
  await w.send({ type: "undo_proof_edit", revision: "m3", theoryId: "theory-a" });
  assert.equal(
    (await w.send({ type: "submit_theory", theoryId: "theory-a" })).projection.solved,
    true,
  );
});
