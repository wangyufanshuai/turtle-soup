import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyPresentationPatch,
  applyQuestionAliasPack,
  createQuestionRoutingReplayContext,
  validatePresentationPatch,
  validateQuestionAliasPack,
  type CaseCatalogEntry,
  type CaseFile,
  type CasePresentationPatch,
  type HistoricalQuestionRoutingContext,
  type QuestionAliasPack,
} from "../packages/mystery-core/src/index.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";
import { mergePresentationPatch, mergeQuestionAliasPacks } from "./lib/v17-overlays.ts";

/** Read-only profile selection, shared by registry generation and author-side checks. */
export function selectPresentationPatches(root: string, profileId: string, caseIds: readonly string[]): Map<string, CasePresentationPatch> {
  const versionMatch = profileId.match(/^v(\d+)\.(\d+)/u);
  const versionNumber = versionMatch ? Number(versionMatch[1]) * 100 + Number(versionMatch[2]) : 0;
  const atLeast = (major: number, minor: number) => versionNumber >= major * 100 + minor;
  if (!atLeast(1, 2)) return new Map();
  const patchPath = resolve(root, "content/zh/presentation", atLeast(1, 4) ? "v1.4/patches.json" : "v1.2/patches.json");
  const presentationPatches: CasePresentationPatch[] = existsSync(patchPath)
    ? JSON.parse(readFileSync(patchPath, "utf8")) as CasePresentationPatch[]
    : [];
  const overlayPatchPath = resolve(root, "content/zh/presentation/v1.7/patches.json");
  const overlayPatches: CasePresentationPatch[] = atLeast(1, 7) && existsSync(overlayPatchPath)
    ? JSON.parse(readFileSync(overlayPatchPath, "utf8")) as CasePresentationPatch[]
    : [];
  // Deliberately opt-in by exact profile; later and historical profiles do not inherit these corrections.
  const currentPatches = ["v2.12-internal-rc", "v2.12-m01-dev", "v2.12-m2-dev", "v2.12-m3-dev"].includes(profileId)
    ? JSON.parse(readFileSync(resolve(root, "content/zh/presentation/v2.12/patches.json"), "utf8")) as CasePresentationPatch[]
    : [];
  const basePatchByCase = new Map(presentationPatches.map((patch) => [patch.caseId, patch]));
  const overlayPatchByCase = new Map(overlayPatches.map((patch) => [patch.caseId, patch]));
  const currentPatchByCase = new Map(currentPatches.map((patch) => [patch.caseId, patch]));
  const selected = new Map<string, CasePresentationPatch>();
  for (const caseId of caseIds) {
    const historical = mergePresentationPatch(basePatchByCase.get(caseId), overlayPatchByCase.get(caseId));
    const patch = mergePresentationPatch(historical, currentPatchByCase.get(caseId));
    if (patch) selected.set(caseId, patch);
  }
  return selected;
}

/** Worker-only replay metadata: the one changed case, from byte-pinned historical public inputs. */
export function selectHistoricalQuestionRoutingContexts(root: string, profileId: string, caseIds: readonly string[]): Record<string, HistoricalQuestionRoutingContext[]> {
  if (["v2.12-m01-dev", "v2.12-m2-dev", "v2.12-m3-dev"].includes(profileId)) {
    const bytes = readFileSync(resolve(root, "content/zh/question-language/m01/historical-routing.json"));
    if (createHash("sha256").update(bytes).digest("hex") !== "db88120199399f60eb93936f1e68bbfae6a353542bca68cda12b3b9a363e92cb") throw new Error("Pinned pre-M01 routing metadata has changed");
    const contexts = JSON.parse(bytes.toString("utf8")) as Record<string, HistoricalQuestionRoutingContext[]>;
    return Object.fromEntries(Object.entries(contexts).filter(([id]) => caseIds.includes(id)));
  }
  const caseId = "c01-cold-room-knock";
  if (profileId !== "v2.12-internal-rc" || !caseIds.includes(caseId)) return {};
  const readPinned = <T>(path: string, sha256: string): T => {
    const bytes = readFileSync(resolve(root, path));
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Historical routing input differs from the pinned v2.11 bytes: ${path}`);
    return JSON.parse(bytes.toString("utf8")) as T;
  };
  const historicalCase = readPinned<CaseFile>("content/zh/cases/c01-cold-room-knock.json", "0bfca99efbf3fbef3667241f6fbd3cd46a81c1ef58879a235fbdc4ad39df65de");
  const base = readPinned<CasePresentationPatch[]>("content/zh/presentation/v1.4/patches.json", "9f8994dc483f1c76abfb6964d786aa07b5ed6ccf0e4db80288bb9f8514e1808f");
  const overlay = readPinned<CasePresentationPatch[]>("content/zh/presentation/v1.7/patches.json", "64caa69f316324ca3a8c771b0229c42bc579c3b96847ef5e2591617b934eff3d");
  const baseAliases = readPinned<QuestionAliasPack[]>("content/zh/question-aliases/v1.6/packs.json", "a217b7b14d331380bced2a2af204ac83720da52f9d21215be0fb375bf94185b9");
  const overlayAliases = readPinned<QuestionAliasPack[]>("content/zh/question-aliases/v1.7/packs.json", "f1fc7de27a9eeb7a876d4b5294ab228bcf78c79f2c25e3f61848372d77735be3");
  const patch = mergePresentationPatch(base.find((item) => item.caseId === caseId), overlay.find((item) => item.caseId === caseId));
  const aliasPack = mergeQuestionAliasPacks(baseAliases, overlayAliases).find((item) => item.caseId === caseId);
  if (!patch || !aliasPack || !validatePresentationPatch(patch, historicalCase).ok || !validateQuestionAliasPack(historicalCase, aliasPack).valid) {
    throw new Error("Pinned C01 historical presentation or alias metadata is invalid");
  }
  const historical = applyQuestionAliasPack(applyPresentationPatch(historicalCase, patch), aliasPack);
  return { [caseId]: [createQuestionRoutingReplayContext(historical, "v2.11-internal-rc")] };
}

function generateContentRegistry(root: string, profileId: string) {
  const generatedDir = resolve(root, "apps/web/.generated");
  const { profile, entries } = loadReleaseContent(root, profileId);
  const versionMatch = profile.id.match(/^v(\d+)\.(\d+)/u);
  const versionNumber = versionMatch ? Number(versionMatch[1]) * 100 + Number(versionMatch[2]) : 0;
  const atLeast = (major: number, minor: number) => versionNumber >= major * 100 + minor;
  const patchByCase = selectPresentationPatches(root, profile.id, entries.map((entry) => entry.id));
  const historicalRoutingContexts = selectHistoricalQuestionRoutingContexts(root, profile.id, entries.map((entry) => entry.id));
  const aliasVersion = atLeast(1, 6) ? "v1.6" : "v1.5";
  const aliasPath = resolve(root, `content/zh/question-aliases/${aliasVersion}/packs.json`);
  const baseAliasPacks: QuestionAliasPack[] = atLeast(1, 5) && existsSync(aliasPath)
    ? JSON.parse(readFileSync(aliasPath, "utf8")) as QuestionAliasPack[]
    : [];
  const overlayAliasPath = resolve(root, "content/zh/question-aliases/v1.7/packs.json");
  const overlayAliasPacks: QuestionAliasPack[] = atLeast(1, 7) && existsSync(overlayAliasPath)
    ? JSON.parse(readFileSync(overlayAliasPath, "utf8")) as QuestionAliasPack[]
    : [];
  const aliasPacks = mergeQuestionAliasPacks(baseAliasPacks, overlayAliasPacks);
  const aliasByCase = new Map(aliasPacks.map((pack) => [pack.caseId, pack]));
  for (const entry of entries) {
    const pack = aliasByCase.get(entry.id);
    if (!pack) continue;
    const validation = validateQuestionAliasPack(loadCaseFile(entry), pack);
    if (!validation.valid) throw new Error(`${entry.id}: invalid QuestionAliasPack: ${validation.failures.join("; ")}`);
  }
  for (const pack of aliasPacks) if (!entries.some((entry) => entry.id === pack.caseId)) throw new Error(`Alias pack references unpublished case ${pack.caseId}`);
  const publicCatalog: CaseCatalogEntry[] = entries.map((entry) => {
    const caseFile = loadCaseFile(entry);
    const patch = patchByCase.get(entry.id);
    const zh = caseFile.localization?.["zh-CN"] ?? {};
    const authored = entry.public ?? {};
    const code = entry.id.match(/^(c\d+)/)?.[1];
    const rasterScene = profile.id === "v1.1-internal-rc" && code ? `/assets/cases/${code}/scene-desktop.webp` : undefined;
    const rasterSceneMobile = profile.id === "v1.1-internal-rc" && code ? `/assets/cases/${code}/scene-mobile.webp` : undefined;
    return {
      id: entry.id,
      title: String(patch?.title ?? authored.title ?? zh[caseFile.surface?.titleKey ?? caseFile.metadata?.titleKey ?? ""] ?? entry.id),
      surface: String(patch?.surface ?? authored.surface ?? zh[caseFile.surface?.textKey ?? ""] ?? "一件等待证明的异常事件。"),
      difficulty: String(authored.difficulty ?? caseFile.metadata?.difficulty ?? "unknown"),
      targetMinutes: caseFile.metadata?.targetMinutes ?? { min: 5, max: 20 },
      contentTags: (authored.contentTags ?? caseFile.metadata?.contentTags ?? []) as string[],
      layoutId: String(authored.layoutId ?? caseFile.presentation?.layoutId ?? "cold-room"),
      sceneAsset: String(patch?.sceneAsset ?? rasterScene ?? authored.sceneAsset ?? caseFile.presentation?.sceneAsset ?? "/scene-cold-room.svg"),
      sceneAssetMobile: String(patch?.sceneAssetMobile ?? patch?.sceneAsset ?? rasterSceneMobile ?? authored.sceneAssetMobile ?? caseFile.presentation?.sceneAssetMobile ?? authored.sceneAsset ?? caseFile.presentation?.sceneAsset ?? "/scene-cold-room.svg"),
      accent: String(authored.accent ?? caseFile.presentation?.accent ?? "#b8cf79"),
      seasonId: entry.seasonId,
      seasonTitle: entry.seasonTitle,
      status: entry.status as CaseCatalogEntry["status"],
      mechanicTags: (authored.contentTags ?? caseFile.metadata?.contentTags ?? []) as string[],
      replayChallenges: patch?.replayChallenges ?? caseFile.replayChallenges ?? [],
    };
  });
  const identities = Object.fromEntries(entries.map((entry) => [entry.id, { caseVersion: entry.contentVersion, contentHash: entry.canonicalHash }]));
  const publicSource = `// Generated by tools/generate-content-registry.ts for ${profile.id}. Do not edit.\nimport type { CaseCatalogEntry, SaveIdentity } from "@turtle-soup/mystery-core";\nexport const RELEASE_PROFILE = ${JSON.stringify({ id: profile.id, title: profile.title, status: profile.status, publishable: profile.publishable ?? false, humanEvaluation: profile.humanEvaluation ?? "pending" }, null, 2)} as const;\nexport const CASE_CATALOG = ${JSON.stringify(publicCatalog, null, 2)} satisfies CaseCatalogEntry[];\nexport const CASE_SAVE_IDENTITIES: Readonly<Record<string, SaveIdentity>> = ${JSON.stringify(identities, null, 2)};\n`;
  const loaderLines = entries.map((entry) => {
    const fromGenerated = relative(generatedDir, entry.casePath).split(sep).join("/");
    const specifier = fromGenerated.startsWith(".") ? fromGenerated : `./${fromGenerated}`;
    return `  ${JSON.stringify(entry.id)}: async () => (await import(${JSON.stringify(specifier)})).default as CaseFile,`;
  });
  const workerSource = `// Generated by tools/generate-content-registry.ts for ${profile.id}. Worker-only truth registry.\nimport type { CaseFile } from "@turtle-soup/mystery-core";\nconst loaders: Record<string, () => Promise<CaseFile>> = {\n${loaderLines.join("\n")}\n};\nexport async function loadCaseFile(caseId: string): Promise<CaseFile> {\n  const loader = loaders[caseId];\n  if (!loader) throw new Error(\`Unknown case id: \${caseId}\`);\n  const caseFile = await loader();\n  if (caseFile.id !== caseId) throw new Error(\`Case identity mismatch for \${caseId}\`);\n  return caseFile;\n}\n`;
  const patchSource = `// Generated by tools/generate-content-registry.ts. Worker-only public-copy patches.\nimport type { CasePresentationPatch } from "@turtle-soup/mystery-core";\nexport const PRESENTATION_PATCHES: Readonly<Record<string, CasePresentationPatch>> = ${JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.id, patchByCase.get(entry.id)]).filter(([, patch]) => Boolean(patch))), null, 2)};\n`;
  const aliasSource = `// Generated by tools/generate-content-registry.ts. Worker-only deterministic language aliases.\nimport type { QuestionAliasPack } from "@turtle-soup/mystery-core";\nexport const QUESTION_ALIAS_PACKS: Readonly<Record<string, QuestionAliasPack>> = ${JSON.stringify(Object.fromEntries(aliasPacks.map((pack) => [pack.caseId, pack])), null, 2)};\n`;
  const historicalRoutingSource = `// Generated by tools/generate-content-registry.ts. Worker-only pinned public routing metadata for saved-log replay, never live requests.\nimport type { HistoricalQuestionRoutingContext } from "@turtle-soup/mystery-core";\nexport const HISTORICAL_QUESTION_ROUTING_CONTEXTS: Readonly<Record<string, readonly HistoricalQuestionRoutingContext[]>> = ${JSON.stringify(historicalRoutingContexts, null, 2)};\n`;
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(resolve(generatedDir, "public-catalog.ts"), publicSource, "utf8");
  writeFileSync(resolve(generatedDir, "worker-case-registry.ts"), workerSource, "utf8");
  writeFileSync(resolve(generatedDir, "presentation-patch-registry.ts"), patchSource, "utf8");
  writeFileSync(resolve(generatedDir, "question-alias-registry.ts"), aliasSource, "utf8");
  writeFileSync(resolve(generatedDir, "historical-question-routing-registry.ts"), historicalRoutingSource, "utf8");
  const isCurrentV212 = profile.id === "v2.12-internal-rc";
  const hasM01 = isCurrentV212 || ["v2.12-m01-dev", "v2.12-m2-dev", "v2.12-m3-dev"].includes(profile.id);
  const hasM2 = isCurrentV212 || ["v2.12-m2-dev", "v2.12-m3-dev"].includes(profile.id);
  const hasM3 = isCurrentV212 || profile.id === "v2.12-m3-dev";
  writeFileSync(resolve(generatedDir, "question-language-registry.ts"), `// Build policy; never read from a save or live request.\nexport const QUESTION_LANGUAGE_REVISION = ${hasM01 ? '"m01" as const' : 'undefined'};\nexport const INVESTIGATION_REVISION = ${hasM2 ? '"m2" as const' : 'undefined'};\nexport const PROOF_REVISION = ${hasM3 ? '\"m3\" as const' : 'undefined'};\n`, "utf8");
  console.log(JSON.stringify({ profile: profile.id, cases: entries.length, generatedDir }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  generateContentRegistry(resolve(process.argv[2] ?? "."), process.argv[3] ?? process.env.TURTLE_SOUP_RELEASE_PROFILE ?? "v2.12-internal-rc");
}
