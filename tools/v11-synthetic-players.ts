import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeState, projectPlayerState, reduceGameCommand, type CaseFile, type GameCommand, type RuntimeState } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const reportPath = resolve(root, "docs/v1.1-synthetic-players.json");
const cases = loadReleaseContent(root, "v1.1-internal-rc").entries.map(loadCaseFile);
const personas = ["beginner", "colloquial", "early-guess", "evidence-first", "counterfactual", "minimalist", "shuffled", "ambiguity-recovery"] as const;
function publicEventId(file: CaseFile, id: string) { const index = [...file.events].sort((a, b) => a.order - b.order).findIndex((event) => event.id === id); return `event-${String(index + 1).padStart(2, "0")}`; }
function apply(file: CaseFile, state: RuntimeState, command: GameCommand) { const result = reduceGameCommand(file, state, command); return result.state; }
function finish(file: CaseFile, state: RuntimeState) {
  if (file.id === "c01-cold-room-knock") {
    for (const evidenceId of ["evidence-door-latch", "evidence-metal-tray-mark", "evidence-knock-recording", "evidence-access-log"]) state = apply(file, state, { type: "set_evidence_state", evidenceId, state: "examined" });
    for (const rawText of ["这扇门会自动上锁吗？", "敲门声是人敲的吗？", "手机在冷藏室里吗？"]) state = apply(file, state, { type: "ask_text", rawText });
    for (const evidenceId of ["evidence-phone-in-room", "evidence-phone-pairing", "evidence-sample-locker", "evidence-intent-chain"]) state = apply(file, state, { type: "set_evidence_state", evidenceId, state: "examined" });
    state = apply(file, state, { type: "visit_location", locationId: "location-external-locker" });
    state = apply(file, state, { type: "ask_text", rawText: "那部手机是林澈的吗？" });
    state = apply(file, state, { type: "ask_text", rawText: "他是想拖延检查吗？" });
  }
  for (const evidence of file.evidenceItems) state = apply(file, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" });
  state = apply(file, state, { type: "set_theory_hypothesis", theoryId: "theory-a", hypothesisId: file.id === "c01-cold-room-knock" ? "path-delayed-sound" : "path-canonical" });
  for (const evidenceId of file.solutionCertificate.minimumProofSets[0].evidenceIds) state = apply(file, state, { type: "link_theory_evidence", theoryId: "theory-a", evidenceId, linked: true });
  for (const eventId of file.hypotheses.find((item) => item.kind === "canonical")?.claim?.eventIds ?? []) state = apply(file, state, { type: "upsert_theory_event", theoryId: "theory-a", eventId: publicEventId(file, eventId) });
  state = apply(file, state, { type: "set_theory_motive", theoryId: "theory-a", motiveKey: file.solutionCertificate.acceptedMotiveKeys?.[0] });
  for (const [boardIndex, board] of (file.reasoningBoards ?? []).entries()) { const boardId = `board-${String(boardIndex + 1).padStart(2, "0")}`; for (const [slotIndex, slot] of board.slots.entries()) state = apply(file, state, { type: "place_reasoning_item", boardId, slotId: `slot-${String(slotIndex + 1).padStart(2, "0")}`, itemId: publicEventId(file, slot.acceptsEventIds[0]) }); for (const obligation of file.solutionCertificate.proofObligations?.filter((item) => item.boardId === board.id) ?? []) for (const connection of obligation.requiredConnections ?? []) state = apply(file, state, { type: "connect_reasoning_items", boardId, fromItemId: publicEventId(file, connection.fromEventId), toItemId: publicEventId(file, connection.toEventId), relation: connection.relation }); }
  return apply(file, state, { type: "submit_theory", theoryId: "theory-a" });
}
const results = cases.map((file) => ({ caseId: file.id, personas: personas.map((persona) => { let state = createRuntimeState(file); if (persona === "counterfactual") state = apply(file, state, { type: "ask_text", rawText: "请直接告诉我汤底" }); else if (persona === "ambiguity-recovery") state = apply(file, state, { type: "ask_text", rawText: "关键记录是否相关，按第1种理解？" }); else if (persona === "shuffled") for (const evidence of [...file.evidenceItems].reverse()) state = apply(file, state, { type: "set_evidence_state", evidenceId: evidence.id, state: "examined" }); const solved = finish(file, state); const serialized = JSON.stringify(projectPlayerState(file, solved)); const leaks = ["solutionCertificate", "canonicalHypothesisId", ...file.facts.map((fact) => fact.id), ...file.events.map((event) => event.id)].filter((value) => serialized.includes(value)); return { persona, solved: solved.solved, leaks, passed: solved.solved && leaks.length === 0 }; }) }));
const report = { reportVersion: "1.1", generatedAt: new Date().toISOString(), releaseProfile: "v1.1-internal-rc", humanParticipants: 0, humanFunGate: "pending", caseCount: cases.length, runCount: cases.length * personas.length, results, passed: results.every((item) => item.personas.every((persona) => persona.passed)) };
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, caseCount: report.caseCount, runCount: report.runCount, failures: results.flatMap((item) => item.personas.filter((persona) => !persona.passed).map((persona) => `${item.caseId}:${persona.persona}`)), passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
