import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { judgeTheory, validateCaseShape } from "./engine.ts";
import { createRuntimeState, projectPlayerState, reduceGameCommand } from "./runtime.ts";
import type { CaseFile, GameCommand, RuntimeState } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cases = {
  "c02-snow-route": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c02-snow-route.json"), "utf8")) as CaseFile,
  "c03-second-shadow": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c03-second-shadow.json"), "utf8")) as CaseFile,
  "c04-unpostable-reply": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c04-unpostable-reply.json"), "utf8")) as CaseFile,
  "c05-third-lamp": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c05-third-lamp.json"), "utf8")) as CaseFile,
  "c06-nonexistent-ticket": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c06-nonexistent-ticket.json"), "utf8")) as CaseFile,
  "c07-key-returns": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c07-key-returns.json"), "utf8")) as CaseFile,
  "c08-unclaimed-recording": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c08-unclaimed-recording.json"), "utf8")) as CaseFile,
  "c09-rain-room": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c09-rain-room.json"), "utf8")) as CaseFile,
  "c10-single-ring": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c10-single-ring.json"), "utf8")) as CaseFile,
  "c11-borrowed-signature": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c11-borrowed-signature.json"), "utf8")) as CaseFile,
  "c12-zero-floor-elevator": JSON.parse(readFileSync(resolve(here, "../../../content/zh/cases/c12-zero-floor-elevator.json"), "utf8")) as CaseFile,
};

function apply(caseFile: CaseFile, state: RuntimeState, command: GameCommand): RuntimeState {
  const result = reduceGameCommand(caseFile, state, command);
  assert.equal(result.accepted, true, `${caseFile.id}:${command.type}:${JSON.stringify(result.events)}`);
  return result.state;
}

function solve(caseFile: CaseFile, evidenceIds: string[], eventIds: string[], hypothesisId: string, motiveKey: string): RuntimeState {
  let state = createRuntimeState(caseFile);
  for (const evidenceId of evidenceIds) state = apply(caseFile, state, { type: "set_evidence_state", evidenceId, state: "examined" });
  state = apply(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId });
  for (const evidenceId of evidenceIds) state = apply(caseFile, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  for (const eventId of eventIds) state = apply(caseFile, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId });
  state = apply(caseFile, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey });
  state = apply(caseFile, state, { type: "submit_theory", theoryId: "theory-a" });
  state = apply(caseFile, state, { type: "request_proof_replay" });
  return state;
}

test("C02 and C03 shapes and opening projections are independently safe", () => {
  for (const caseFile of Object.values(cases)) {
    validateCaseShape(caseFile);
    const projection = projectPlayerState(caseFile, createRuntimeState(caseFile));
    assert.equal(projection.case.id, caseFile.id);
    assert.equal(projection.case.presentation.layoutId, caseFile.presentation?.layoutId);
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes("solutionCertificate"), false);
    assert.equal(serialized.includes(caseFile.solutionCertificate.canonicalHypothesisId), false);
    for (const fact of caseFile.facts) assert.equal(serialized.includes(fact.id), false, `${caseFile.id} leaked hidden fact id ${fact.id}`);
    for (const event of caseFile.events) assert.equal(serialized.includes(event.id), false, `${caseFile.id} leaked internal event id ${event.id}`);
    assert.equal(serialized.includes("canonicalHypothesisId"), false);
  }
});

test("C02 snow route completes through physical-carrier proof", () => {
  const state = solve(cases["c02-snow-route"], [
    "evidence-door-log", "evidence-weather-report", "evidence-cart-track", "evidence-clearance-report", "evidence-clearance-mat", "evidence-radio-home", "evidence-gate-camera",
  ], ["event-01", "event-02", "event-03", "event-04", "event-05", "event-06", "event-07"], "path-canonical", "motive-avoid-snow");
  const projection = projectPlayerState(cases["c02-snow-route"], state);
  assert.equal(projection.solved, true);
  assert.equal(projection.replay.length, 5);
});

test("C03 second shadow completes through role-person proof", () => {
  const state = solve(cases["c03-second-shadow"], [
    "evidence-lighting-cue", "evidence-costume-rack", "evidence-shadow-screen", "evidence-call-sheet", "evidence-access-log", "evidence-cast-list", "evidence-radio-backstage", "evidence-witness-statement",
  ], ["event-01", "event-02", "event-03", "event-04", "event-05", "event-06", "event-07", "event-08"], "path-canonical", "motive-cover-absence");
  const projection = projectPlayerState(cases["c03-second-shadow"], state);
  assert.equal(projection.solved, true);
  assert.equal(projection.replay.length, 5);
});

test("C04-C09 each complete through their distinct causal proof", () => {
  const sessions: Array<[CaseFile, string[], string, string]> = [
    [cases["c04-unpostable-reply"], ["evidence-letter", "evidence-writing-log", "evidence-clock-audit", "evidence-test-envelope", "evidence-bag-seal", "evidence-cctv", "evidence-audit", "evidence-dispatch-note"], "motive-calibrate-machine", "replay-c04-audit"],
    [cases["c05-third-lamp"], ["evidence-breaker", "evidence-witness", "evidence-lamp", "evidence-reflector", "evidence-beacon", "evidence-circuit-map", "evidence-access", "evidence-window"], "motive-safety-check", "replay-c05-audit"],
    [cases["c06-nonexistent-ticket"], ["evidence-gate-log", "evidence-camera", "evidence-terminal", "evidence-departure", "evidence-manifest", "evidence-audit", "evidence-radio", "evidence-signage"], "motive-cargo-transfer", "replay-c06-audit"],
    [cases["c07-key-returns"], ["evidence-key-photo", "evidence-lock-log", "evidence-maintenance-sheet", "evidence-magnet-mark", "evidence-cable-test", "evidence-lock-camera", "evidence-slot"], "motive-maintenance", "replay-c07-camera"],
    [cases["c08-unclaimed-recording"], ["evidence-waveform", "evidence-session-log", "evidence-door-log", "evidence-memory-card", "evidence-device", "evidence-console", "evidence-room-seal"], "motive-buffer-recovery", "replay-c08-heard"],
    [cases["c09-rain-room"], ["evidence-weather", "evidence-door-log", "evidence-gutter", "evidence-pipe-camera", "evidence-drip-log", "evidence-floor", "evidence-roof-check", "evidence-maintenance"], "motive-maintenance-lag", "replay-c09-drip"],
    [cases["c10-single-ring"], ["evidence-line-status", "evidence-maintenance", "evidence-voicemail", "evidence-ring-sensor", "evidence-pbx-trace", "evidence-call-log", "evidence-port-map"], "motive-maintenance-test", "replay-c10-trace"],
    [cases["c11-borrowed-signature"], ["evidence-blank-form", "evidence-stamp", "evidence-impression", "evidence-carbon", "evidence-entry-log", "evidence-seal-log", "evidence-audit"], "motive-expedite-archive", "replay-c11-audit"],
    [cases["c12-zero-floor-elevator"], ["evidence-building-plan", "evidence-maintenance", "evidence-controller", "evidence-floor-log", "evidence-motion-sensor", "evidence-door-sensor", "evidence-camera"], "motive-calibration", "replay-c12-normal"],
  ];
  for (const [caseFile, evidenceIds, motiveKey, replayId] of sessions) {
    const canonicalEventIds = (caseFile.hypotheses.find((hypothesis) => hypothesis.kind === "canonical")?.claim?.eventIds ?? []).map((internalId) => `event-${String(caseFile.events.findIndex((event) => event.id === internalId) + 1).padStart(2, "0")}`);
    const state = solve(caseFile, evidenceIds, canonicalEventIds, "path-canonical", motiveKey);
    const projection = projectPlayerState(caseFile, state);
    assert.equal(projection.solved, true, `${caseFile.id} did not solve`);
    assert.equal(projection.replay.at(-1)?.id, replayId, `${caseFile.id} replay did not close`);
  }
});

test("alternative theories are invalidated after their contradiction evidence appears", () => {
  for (const caseFile of Object.values(cases)) {
    let state = createRuntimeState(caseFile);
    for (const evidence of caseFile.evidenceItems.filter((item) => item.defaultState === "available")) {
      const result = reduceGameCommand(caseFile, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
      if (result.accepted) state = result.state;
    }
    const alternative = caseFile.hypotheses.find((hypothesis) => hypothesis.kind === "alternative");
    assert.ok(alternative);
    const publicHypothesisId = `path-${alternative.id.replace(/^hypothesis-/, "")}`;
    const result = reduceGameCommand(caseFile, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: publicHypothesisId });
    assert.equal(result.accepted, true);
    const judgement = judgeTheory(caseFile, state.game, {
      hypothesisId: alternative.id,
      eventIds: [caseFile.events[0].id],
      evidenceIds: caseFile.evidenceItems.filter((item) => state.game.discoveredEvidenceIds.includes(item.id)).map((item) => item.id),
      motiveKey: alternative.claim?.motiveKey,
    });
    assert.equal(judgement.judgement, "invalidated", `${caseFile.id} accepted an authored error theory`);
  }
});

test("all authored cases converge regardless of evidence inspection order", () => {
  for (const caseFile of Object.values(cases)) {
    const available = caseFile.evidenceItems.filter((item) => item.defaultState === "available").map((item) => item.id);
    const orders = [available, [...available].reverse(), [...available].sort((left, right) => right.localeCompare(left))];
    const projections = orders.map((order) => {
      let state = createRuntimeState(caseFile);
      for (const evidenceId of order) {
        const result = reduceGameCommand(caseFile, state, { type: "set_evidence_state", evidenceId, state: "examined" });
        if (result.accepted) state = result.state;
      }
      return projectPlayerState(caseFile, state);
    });
    assert.deepEqual(projections[1].evidence.map((item) => item.state), projections[0].evidence.map((item) => item.state), caseFile.id);
    assert.deepEqual(projections[2].theoryOptions, projections[0].theoryOptions, caseFile.id);
  }
});
