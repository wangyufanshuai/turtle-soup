import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { applyPresentationPatch, applyQuestionAliasPack, projectPlayerState, reduceGameCommand, replayCommands, createRuntimeState, validateCompatibleSave, type CaseFile, type RuntimeState } from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { mergePresentationPatch, mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";
import { evidenceIdentity, git, hashBytes, loadRun, sameIdentity, slash, V212_BASE_REF, V212_PROFILE, writeReport, type EvidenceIdentity } from "./lib/v212-evidence.ts";

const root = resolve(".");
const preflight = process.argv.includes("--preflight");
const id = "historical-save-oracle";
const reportPath = `docs/v2.12-check-${id}.json`;
const scope = "Pinned v2.11 Node runtime generates schema-one raw bytes and independent semantic expectations; v2.12 consumes identical commands. NOT historical human saves, browser gameplay, or the real Worker.";
let identity: EvidenceIdentity | undefined;
if (!preflight) {
  try { identity = loadRun(root); assert(identity.buildHash, "Final v2.12 build required"); }
  catch (error) {
    writeReport(root, reportPath, { id, scope, coverage: "not-run", passed: null, humanParticipants: 0, evidence: [], reason: String(error), rerun: "After final build and audit:v212:init: node --experimental-strip-types --experimental-transform-types tools/v212-historical-oracle.ts" });
    console.error(String(error));
    process.exit(1);
  }
}
const directory = identity ? `output/v212/${identity.runId}/${id}` : `output/v212/${id}-preflight`;
const output = resolve(root, directory);
const oldRoot = resolve(root, "output/v212/legacy-runtime-2967346");
const startedAt = new Date().toISOString();
const safePath = (base: string, path: string) => {
  const destination = resolve(base, path), rel = relative(base, destination);
  assert(rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `Refusing path outside designated directory: ${destination}`);
  return destination;
};
safePath(root, oldRoot);
safePath(root, output);
mkdirSync(oldRoot, { recursive: true });
mkdirSync(output, { recursive: true });
const fileRef = (path: string) => ({ path: slash(relative(root, path)), sha256: hashBytes(readFileSync(path)) });
const writeOutput = (name: string, value: unknown) => {
  const path = safePath(output, name);
  writeReport(root, slash(relative(root, path)), value);
  return fileRef(path);
};

function exportPinnedTree() {
  assert.equal(git(root, ["rev-parse", `${V212_BASE_REF}^{commit}`]).toString().trim(), V212_BASE_REF);
  const inventory = new Map<string, { path: string; bytes: number; sha256: string; gitBlobId: string }>();
  const copy = (path: string) => {
    const normalized = posix.normalize(path.replaceAll("\\", "/"));
    assert(!normalized.startsWith("../") && !posix.isAbsolute(normalized));
    if (inventory.has(normalized)) return readFileSync(safePath(oldRoot, normalized));
    const raw = git(root, ["show", `${V212_BASE_REF}:${normalized}`]);
    const destination = safePath(oldRoot, normalized);
    mkdirSync(dirname(destination), { recursive: true });
    // A materialized git object is generated evidence, not a modified historical source file.
    // Never overwrite an unexpected prior tree: it may be user data or a tampered fixture.
    if (existsSync(destination)) assert.equal(hashBytes(readFileSync(destination)), hashBytes(raw), `Existing old-runtime file differs from pinned blob: ${normalized}`);
    else writeFileSync(destination, raw);
    inventory.set(normalized, { path: normalized, bytes: raw.length, sha256: hashBytes(raw), gitBlobId: git(root, ["rev-parse", `${V212_BASE_REF}:${normalized}`]).toString().trim() });
    return raw;
  };
  const code = (path: string) => {
    if (inventory.has(path)) return;
    const source = copy(path).toString("utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
      const imported = match[1];
      if (imported.startsWith("node:")) continue;
      assert(imported.startsWith("."), `Old runtime dependency is not isolated: ${path} -> ${imported}`);
      const dependency = posix.normalize(posix.join(posix.dirname(path), imported));
      assert(/\.ts$/.test(dependency), `Unresolved pinned import: ${dependency}`);
      code(dependency);
    }
  };
  copy("package.json");
  code("tools/lib/canonical-save.ts");
  code("tools/lib/release-content.ts");
  code("tools/lib/v17-overlays.ts");
  const profilePath = "content/zh/releases/v2.11-internal-rc.json";
  const profile = JSON.parse(copy(profilePath).toString("utf8"));
  assert.equal(profile.manifests.length, 5);
  const frozenFiles: string[] = [profilePath];
  let caseCount = 0;
  for (const manifestRelative of profile.manifests) {
    const manifestPath = posix.normalize(posix.join(posix.dirname(profilePath), manifestRelative));
    const manifest = JSON.parse(copy(manifestPath).toString("utf8"));
    frozenFiles.push(manifestPath);
    for (const entry of manifest.cases) {
      const casePath = posix.normalize(posix.join(posix.dirname(manifestPath), entry.file));
      copy(casePath); frozenFiles.push(casePath); caseCount += 1;
      if (entry.id.startsWith("c61-")) code(posix.join(posix.dirname(casePath), "c61-question-corpus.ts"));
    }
  }
  assert.equal(caseCount, 84);
  const overlayPaths = ["content/zh/presentation/v1.4/patches.json", "content/zh/presentation/v1.7/patches.json", "content/zh/question-aliases/v1.6/packs.json", "content/zh/question-aliases/v1.7/packs.json"];
  for (const path of overlayPaths) { copy(path); frozenFiles.push(path); }
  for (const path of frozenFiles) assert.equal(hashBytes(readFileSync(resolve(root, path))), inventory.get(path)?.sha256, `Frozen case/manifest/profile/overlay changed: ${path}`);
  const files = [...inventory.values()].sort((a, b) => a.path.localeCompare(b.path, "en"));
  return { pinnedRef: V212_BASE_REF, pinnedCommitTime: git(root, ["show", "-s", "--format=%cI", V212_BASE_REF]).toString().trim(), oldProfile: profile.id, caseCount, manifests: 5, files, runtimeTreeSha256: hashBytes(JSON.stringify(files)), frozenInputsChecked: frozenFiles.length };
}

/** Normalize v2.12 public handles through its projection boundary, never through legacy expected values. */
function semantic(file: CaseFile, state: RuntimeState) {
  const allEventIds = file.events.map((event) => event.id);
  const handleProjection = projectPlayerState(file, { ...state, theoryDrafts: [{ ...state.theoryDrafts[0], eventIds: allEventIds }] });
  const projectedIds = handleProjection.theoryDrafts[0].eventIds;
  assert.equal(projectedIds.length, allEventIds.length);
  assert.equal(new Set(projectedIds).size, allEventIds.length, "Public event handles must not collide");
  const publicToInternal = new Map(projectedIds.map((publicId, index) => [publicId, allEventIds[index]]));
  const decode = (publicId: string) => { const value = publicToInternal.get(publicId); assert(value, `Unmapped current event ${publicId}`); return value; };
  const game = (value: RuntimeState["game"]) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? [...item].sort() : item]));
  return {
    game: game(state.game),
    transcript: state.transcript.map((item) => ({ id: item.id, rawQuestion: item.rawQuestion, answerCode: item.answerCode, repeated: item.repeated })),
    evidenceStates: state.evidenceStates,
    theoryDrafts: state.theoryDrafts.map((draft) => ({ id: draft.id, hypothesisId: draft.hypothesisId, eventIds: draft.eventIds, evidenceIds: [...draft.evidenceIds].sort(), motiveKey: draft.motiveKey ?? null })),
    activeTheoryId: state.activeTheoryId,
    pendingInterpretation: state.pendingInterpretation ?? null,
    lastQuestionSnapshot: state.lastQuestionSnapshot ? { game: game(state.lastQuestionSnapshot.game), transcriptLength: state.lastQuestionSnapshot.transcriptLength } : null,
    solved: state.solved, replayBeatIds: state.replayBeatIds, acceptedCommandCount: state.acceptedCommandCount,
    unlockedChapterIds: [...state.unlockedChapterIds].sort(),
    reasoningBoards: Object.fromEntries(Object.entries(state.reasoningBoards).map(([publicId, draft]) => {
      const index = Number(publicId.match(/^board-(\d+)$/)?.[1]) - 1;
      const board = file.reasoningBoards?.[index];
      assert(board, `Unmapped current board ${publicId}`);
      return [board.id, {
        placements: Object.fromEntries(Object.entries(draft.placements).map(([slot, item]) => {
          const internalSlot = board.slots[Number(slot.match(/^slot-(\d+)$/)?.[1]) - 1];
          assert(internalSlot, `Unmapped current slot ${slot}`);
          return [internalSlot.id, decode(item)];
        })),
        connections: draft.connections.map((item) => ({ fromEventId: decode(item.fromItemId), toEventId: decode(item.toItemId), relation: item.relation })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
      }];
    })),
    replayMode: state.replayMode,
  };
}

const artifacts: Array<{ path: string; sha256: string }> = [];
let summary: Record<string, unknown>;
try {
  const pinned = exportPinnedTree();
  artifacts.push(writeOutput("pinned-runtime-inventory.json", pinned));
  const runner = readFileSync(resolve(root, "output/v212/historical-oracle-child.ts"));
  const runnerPath = safePath(output, "child-runner.ts");
  writeFileSync(runnerPath, runner);
  artifacts.push(fileRef(runnerPath));
  const oldOutput = safePath(output, "old-generated");
  mkdirSync(oldOutput, { recursive: true });
  const nodeArgs = ["--experimental-strip-types", "--experimental-transform-types", runnerPath, oldRoot, oldOutput, V212_BASE_REF, pinned.pinnedCommitTime];
  const child = spawnSync(process.execPath, nodeArgs, { cwd: oldRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  const childLog = `${child.stdout ?? ""}${child.stderr ?? ""}${child.error ? String(child.error) : ""}`;
  const logPath = safePath(output, "old-runtime.log");
  writeFileSync(logPath, childLog, "utf8"); artifacts.push(fileRef(logPath));
  assert.equal(child.status, 0, `Pinned runtime child failed: ${childLog.slice(-3500)}`);
  // Validate every materialized old dependency after executing it.
  for (const item of pinned.files) assert.equal(hashBytes(readFileSync(safePath(oldRoot, item.path))), item.sha256, `Pinned source changed during execution: ${item.path}`);
  const indexPath = safePath(oldOutput, "oracle-index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  artifacts.push(fileRef(indexPath));
  assert.equal(index.pinnedRef, V212_BASE_REF);
  assert.equal(index.caseCount, 84);
  assert.equal(index.humanParticipants, 0);
  const readFixture = (ref: { path: string; sha256: string }) => {
    const path = safePath(oldOutput, ref.path);
    const raw = readFileSync(path);
    assert.equal(hashBytes(raw), ref.sha256, `Old fixture bytes changed: ${ref.path}`);
    artifacts.push(fileRef(path));
    return { raw, value: JSON.parse(raw.toString("utf8")), path };
  };
  const { entries } = loadReleaseContent(root, V212_PROFILE);
  assert.equal(entries.length, 84);
  const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const base = readJson("content/zh/presentation/v1.4/patches.json"), overlay = readJson("content/zh/presentation/v1.7/patches.json");
  const aliases = mergeQuestionAliasPacks(readJson("content/zh/question-aliases/v1.6/packs.json"), readJson("content/zh/question-aliases/v1.7/packs.json"));
  const files = new Map(entries.map((entry) => {
    const file = loadCaseFile(entry);
    return [entry.id, applyQuestionAliasPack(applyPresentationPatch(file, mergePresentationPatch(base.find((item: any) => item.caseId === entry.id), overlay.find((item: any) => item.caseId === entry.id))), aliases.find((item) => item.caseId === entry.id))];
  }));
  const results: any[] = [];
  let guardExpected: any;
  for (const fixture of index.fixtures) {
    const raw = readFixture(fixture.raw), oracle = readFixture(fixture.oracle);
    const file = files.get(fixture.caseId); assert(file);
    const compatible = validateCompatibleSave(raw.value, file.id, { caseVersion: file.metadata?.contentVersion ?? 1, contentHash: file.metadata?.canonicalHash ?? "" });
    try {
      assert(compatible.ok, "Old schema-one envelope rejected");
      const restored = replayCommands(file, compatible.value.commands);
      const actual = semantic(file, restored.state);
      assert.deepEqual(actual, oracle.value.expected, "Current semantic result differs from pinned-old-runtime expected result");
      // Also compare accepted command/event semantics to old live execution; copy changes are intentionally excluded.
      let liveState = createRuntimeState(file);
      const currentSteps = compatible.value.commands.map((command, position) => {
        const result = reduceGameCommand(file, liveState, command);
        assert(result.accepted, `Legacy valid command rejected at ${position}`);
        liveState = result.state;
        return { index: position, type: command.type, accepted: result.accepted, events: result.events.map((event) => ({ type: event.type, ...(event.type === "theory_judged" ? { judgement: event.judgement, proofFailureCategory: event.proofFailureCategory ?? null } : {}) })) };
      });
      assert.deepEqual(currentSteps, oracle.value.steps, "Command acceptance/judgement differs from old runtime");
      assert.deepEqual(semantic(file, liveState), oracle.value.expected, "Current live semantic state differs from old oracle");
      assert.equal(hashBytes(readFileSync(raw.path)), fixture.raw.sha256, "Importer altered original bytes");
      results.push({ caseId: fixture.caseId, fixture: fixture.name, commandCount: fixture.commands, coverage: "measured", passed: true, rawSaveSha256: fixture.raw.sha256, expectedSha256: fixture.oracle.sha256 });
      if (fixture.caseId.startsWith("c61-") && fixture.name === "canonical-solved-replay") guardExpected = oracle.value.expected;
    } catch (error) {
      results.push({ caseId: fixture.caseId, fixture: fixture.name, coverage: "failed", passed: false, error: error instanceof Error ? error.message : String(error), rawSaveSha256: fixture.raw.sha256, expectedSha256: fixture.oracle.sha256 });
    }
  }
  const negativeResults = index.negatives.map((fixture: any) => {
    const raw = readFixture(fixture.raw), oracle = readFixture(fixture.oracle);
    const file = files.get(fixture.caseId); assert(file);
    assert.equal(oracle.value.liveTranscriptCount, 1);
    assert.equal(oracle.value.replayTranscriptCount, 0);
    assert.equal(oracle.value.compatiblePassEligible, false);
    const envelope = validateCompatibleSave(raw.value, file.id, { caseVersion: file.metadata?.contentVersion ?? 1, contentHash: file.metadata?.canonicalHash ?? "" });
    let rejected = false, error: string | null = null;
    try { replayCommands(file, raw.value.commands); } catch (failure) { rejected = true; error = String(failure); }
    const originalBytesUnchanged = hashBytes(readFileSync(raw.path)) === fixture.raw.sha256;
    return { caseId: fixture.caseId, fixture: fixture.name, envelopeValid: envelope.ok, newReplayRejected: rejected, originalBytesUnchanged, oldLiveTranscript: 1, oldReplayTranscript: 0, compatiblePassEligible: false, passed: envelope.ok && rejected && originalBytesUnchanged, error };
  });
  // Comparator regression guards: changes to each required semantic invariant must be detected.
  assert(guardExpected, "C61 solved oracle missing");
  const mutations: Record<string, (value: any) => void> = {
    "visible-facts": (value) => value.game.visibleFactIds.push("oracle-mutation"),
    "evidence-state": (value) => value.evidenceStates[Object.keys(value.evidenceStates)[0]] = "oracle-mutation",
    "theory-internal-order": (value) => value.theoryDrafts[0].eventIds.reverse(),
    "board-connection-semantic-id": (value) => { const board: any = Object.values(value.reasoningBoards).find((item: any) => item.connections.length); assert(board); board.connections[0].fromEventId = "oracle-mutation"; },
    "solved-state": (value) => value.solved = !value.solved,
    "proof-replay": (value) => value.replayBeatIds.push("oracle-mutation"),
  };
  const comparatorGuards = Object.entries(mutations).map(([name, mutate]) => {
    const mutated = structuredClone(guardExpected); mutate(mutated);
    assert.throws(() => assert.deepEqual(mutated, guardExpected), { code: "ERR_ASSERTION" }, `Comparator ignores ${name}`);
    return { name, detected: true };
  });
  const canonical = results.filter((item) => item.fixture === "canonical-solved-replay");
  assert.equal(canonical.length, 84);
  assert.equal(new Set(canonical.map((item) => item.caseId)).size, 84);
  const passed = results.every((item) => item.passed) && negativeResults.length === 1 && negativeResults.every((item: any) => item.passed);
  summary = {
    pinnedRef: V212_BASE_REF, oldRuntimeTreeSha256: pinned.runtimeTreeSha256, generator: index.generator,
    humanParticipants: 0, noHistoricalHumanSaveClaim: true, caseCount: 84,
    compatibleFixtureCount: results.length, compatibleFixturesPassed: results.filter((item) => item.passed).length,
    allCaseCanonicalPassed: canonical.filter((item) => item.passed).length, corruptionRegressions: negativeResults,
    results, comparatorGuards, extraCoverage: index.milestoneCoverage, passed,
    mapping: "Theory hypotheses/events use internal state IDs directly. Old event handles map via pinned authored order; new event handles map via current draft projection. Boards/slots map by manifest index to internal IDs. Ordered theory and replay arrays remain ordered; set-like game/evidence arrays are normalized only for set order.",
    processBoundary: { executable: process.execPath, args: nodeArgs.map((item) => item.startsWith(root) ? slash(relative(root, item)) : item), cwd: slash(relative(root, oldRoot)), nodeVersion: process.version, exitCode: child.status, imports: "Pinned git dependency closure plus Node built-ins only; runner imports no current runtime" },
    limits: ["Generated known-answer fixtures are not historical real-player logs or human evaluation.", "Compatibility covers the fixed v2.11 ref, not every released binary or every possible command sequence.", "New wording and opaque handle strings intentionally differ and are not compared; underlying evidence, theory order, board relations, judgement, solved state and replay are compared.", "File retention here is a non-mutating core import check; browser storage-recovery retention requires separate Worker/UI evidence.", "Limited-question challenge re-completion is not covered; reset/partial states plus no-scaffolds and minimal-proof re-completion are separately recorded."],
  };
} catch (error) {
  summary = { passed: false, pinnedRef: V212_BASE_REF, humanParticipants: 0, error: error instanceof Error ? `${error.stack ?? error.message}` : String(error) };
}
const identityStable = identity ? sameIdentity(identity, evidenceIdentity(root, identity.runId)) : false;
const measured = { ...(identity ?? {}), id, scope, startedAt, endedAt: new Date().toISOString(), coverage: summary.passed ? "measured" : "failed", boundToCurrentRun: Boolean(identity), identityStable, ...summary };
artifacts.push(writeOutput("comparison.json", measured));
if (preflight) {
  writeReport(root, reportPath, { id, scope, coverage: "not-run", passed: null, humanParticipants: 0, evidence: [], reason: "Unbound developer preflight only. Final-source/build loadRun gate has not been executed.", preflight: { path: `${directory}/comparison.json`, measuredPassed: summary.passed } });
} else {
  const passed = summary.passed === true && identityStable;
  writeReport(root, reportPath, { ...identity, id, scope, startedAt, endedAt: new Date().toISOString(), coverage: passed ? "measured" : "failed", passed, humanParticipants: 0, evidence: artifacts, identityStable, caseCount: summary.caseCount ?? 0, compatibleFixtureCount: summary.compatibleFixtureCount ?? 0, compatibleFixturesPassed: summary.compatibleFixturesPassed ?? 0, corruptionRegressionCount: Array.isArray(summary.corruptionRegressions) ? summary.corruptionRegressions.length : 0, qualification: "Pinned-old-runtime generated oracle; historical human save count is zero; negative corruption fixtures never count as compatibility passes." });
}
console.log(JSON.stringify({ preflight, passed: summary.passed, boundToCurrentRun: Boolean(identity), identityStable, caseCount: summary.caseCount, compatibleFixtures: summary.compatibleFixtureCount, compatibleFixturesPassed: summary.compatibleFixturesPassed, error: summary.error, reportPath }, null, 2));
if (!summary.passed || (!preflight && !identityStable)) process.exitCode = 1;
