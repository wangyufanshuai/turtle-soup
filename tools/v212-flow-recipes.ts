import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPresentationPatch, applyQuestionAliasPack, projectPlayerState, replayCommands, type QuestionAliasPack } from "../packages/mystery-core/src/index.ts";
import { reasoningBoardUi, REASONING_RELATION_LABELS } from "../apps/web/lib/reasoning-board-ui.ts";
import { createCanonicalSave } from "./lib/canonical-save.ts";
import { loadCaseFile, loadReleaseContent, loadQuestionCorpus } from "./lib/release-content.ts";
import { mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";
import { selectPresentationPatches } from "./generate-content-registry.ts";
import { V212_FLOW_CASES, V212_FLOW_STAGES } from "./lib/v212-browser-contract.ts";
import { currentSource, hashBytes, V212_PROFILE, writeReport } from "./lib/v212-evidence.ts";

// Author-side compilation only. This module is NOT imported by a browser test or the app.
// It emits labels and UI actions, never save envelopes, commands or hidden identifiers.
const root = resolve(".");
const source = currentSource(root);
const { entries } = loadReleaseContent(root, V212_PROFILE);
const patches = selectPresentationPatches(root, V212_PROFILE, entries.map((entry) => entry.id));
const aliases = (version: string) => JSON.parse(readFileSync(resolve(root, `content/zh/question-aliases/${version}/packs.json`), "utf8")) as QuestionAliasPack[];
const aliasPacks = mergeQuestionAliasPacks(aliases("v1.6"), aliases("v1.7"));
const recipes = [];
for (const caseId of V212_FLOW_CASES) {
  const entry = entries.find((item) => item.id === caseId);
  if (!entry) throw new Error(`Required representative case is not in the selected manifest: ${caseId}`);
  const raw = loadCaseFile(entry);
  const merged = patches.get(caseId);
  const aliasPack = aliasPacks.find((item) => item.caseId === caseId);
  const file = applyQuestionAliasPack(applyPresentationPatch(raw, merged), aliasPack);
  const authorFixture = createCanonicalSave(file);
  const authorSolved = replayCommands(file, authorFixture.commands);
  const publicSolved = projectPlayerState(file, authorSolved.state);
  if (!publicSolved.solved) throw new Error(`Recipe compilation did not produce a solved author-side fixture: ${caseId}`);
  const draft = publicSolved.theoryDrafts.find((item) => item.id === publicSolved.activeTheoryId)!;
  const selected = publicSolved.theoryOptions.find((item) => item.id === draft.hypothesisId);
  const corpus = await loadQuestionCorpus(entry);
  const ambiguous = corpus.find((item) => item.expectedStatus === "ambiguous");
  const ambiguityText = ambiguous?.rawQuestion ?? aliasPack?.ambiguousPhrases?.[0]?.text;
  const recipe = {
    caseId, route: `/case/${caseId}/`, title: publicSolved.case.title,
    purpose: "Known-answer UI execution guide, not a blind discovery test. Contains solution spoilers after investigation.",
    startup: "Use a fresh test origin or UI restart. Never clear unrelated user storage. AI remains off.",
    naturalQuestions: [...new Set(publicSolved.questionScaffolds.map((query) => query.label))],
    ambiguity: ambiguityText ? { rawText: ambiguityText, action: "Read the actually visible candidate labels; confirm a candidate, observe the answer count/text, reload and compare." } : { rawText: null, action: "No ambiguous corpus or selected alias vector found: use an independently selected real ambiguity and record it; do not claim coverage by skipping." },
    discover: "Visit each visible location and inspect newly reachable evidence through the UI; re-check after questions or evidence reveal a new location. Do not use global state, DOM hidden fields, IndexedDB injection or postMessage.",
    locationLabels: publicSolved.locations.map((item) => item.label),
    evidenceTitles: publicSolved.evidence.map((item) => item.title),
    proofEvidenceTitles: publicSolved.evidence.filter((item) => draft.evidenceIds.includes(item.id)).map((item) => item.title),
    incorrectTheoryLabels: publicSolved.theoryOptions.filter((item) => item.id !== draft.hypothesisId).map((item) => item.label),
    theoryLabelAfterDiscovery: selected?.label ?? null,
    motiveLabel: selected?.motiveOptions.find((item) => item.id === draft.motiveKey)?.label ?? null,
    eventChain: draft.eventIds.map((id) => {
      const event = publicSolved.eventOptions.find((item) => item.id === id);
      if (!event) throw new Error(`Missing visible event label in recipe: ${caseId}`);
      return { timeLabel: event.timeLabel, label: event.label };
    }),
    boards: publicSolved.reasoningBoards.map((board) => ({
      label: `${reasoningBoardUi(board.mode).label}推理板`, title: board.title, mode: board.mode,
      placements: board.slots.map((slot, index) => ({ slotLabel: board.behavior?.slotRoles[index] ?? slot.label, eventLabel: board.items.find((item) => item.id === slot.itemId)?.label ?? null })),
      connections: board.connections.map((connection) => ({ fromLabel: board.items.find((item) => item.id === connection.fromItemId)?.label ?? null, toLabel: board.items.find((item) => item.id === connection.toItemId)?.label ?? null, relationLabel: REASONING_RELATION_LABELS[connection.relation] ?? connection.relation })),
    })),
    requiredObservationStages: V212_FLOW_STAGES,
    procedure: [
      "Capture the zero-question scene and theory workspace. Do not inspect the solution fields in this guide until opening exposure is checked.",
      "Fill and submit at least three natural questions through the labeled input. Read both system-understanding and fact-answer text.",
      "Exercise ambiguity confirmation and compare the visible transcript before and after page reload.",
      "Inspect reachable evidence, add supporting material through its action button, and record actual modal close/focus behavior.",
      "Submit an author-provided incorrect theory through UI and observe rejection, then select your causal explanation.",
      "Submit an incomplete proof and capture the visible gap. Only then organize the correct event chain and every board using event/slot labels.",
      "Select the visible motive and attach proof evidence. Submit, observe solved text, open the replay and step through it.",
      "Reload and compare the solved archive. Offline recovery, challenge re-completion, touch, keyboard and visual/a11y audits are separate evidence gates, not implied by this recipe.",
    ],
  };
  const serialized = JSON.stringify(recipe);
  for (const denied of [...file.facts.map((item) => item.id), ...file.events.map((item) => item.id), ...file.hypotheses.map((item) => item.id), ...file.questionSemantics.map((item) => item.id), ...file.evidenceItems.map((item) => item.id), "solutionCertificate", "canonicalHypothesisId", '"commands"']) {
    if (serialized.includes(denied)) throw new Error(`Recipe contains a non-public author identifier: ${caseId}`);
  }
  recipes.push(recipe);
}
const outputPath = "output/v212/flow-recipes.contains-spoilers.json";
writeReport(root, outputPath, { generatedAt: new Date().toISOString(), releaseProfile: V212_PROFILE, sourceTreeDigest: source.digest, coverage: "static", passed: null, browserExecuted: false, scriptSha256: hashBytes(readFileSync(resolve(root, "tools/v212-flow-recipes.ts"))), recipes });
console.log(JSON.stringify({ outputPath, recipes: recipes.length, coverage: "static", browserExecuted: false }, null, 2));
