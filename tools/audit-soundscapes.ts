import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SOUNDSCAPE_IDS, SOUNDSCAPE_PROFILES } from "../apps/web/lib/audio-profiles.ts";

const root = resolve(process.argv[2] ?? ".");
const caseDir = resolve(root, "content/zh/cases");
const manifest = JSON.parse(readFileSync(resolve(caseDir, "manifest.v0.6.json"), "utf8")) as {
  cases: Array<{ id: string; file: string }>;
};

const authoredLayouts = manifest.cases.map((entry) => {
  const caseFile = JSON.parse(readFileSync(resolve(caseDir, entry.file), "utf8")) as {
    presentation?: { layoutId?: string; sceneAsset?: string };
  };
  return { caseId: entry.id, layoutId: caseFile.presentation?.layoutId ?? "", sceneAsset: caseFile.presentation?.sceneAsset ?? "" };
});

const profiles = SOUNDSCAPE_IDS.map((id) => SOUNDSCAPE_PROFILES[id]);
const shellSources = ["apps/web/components/game-shell.tsx", "apps/web/components/variant-shell.tsx"].map((path) => ({ path, source: readFileSync(resolve(root, path), "utf8") }));
const lifecycleCoverage = shellSources.map(({ path, source }) => ({
  path,
  visibilitychange: source.includes('addEventListener("visibilitychange"'),
  pagehide: source.includes('addEventListener("pagehide"'),
  pageshow: source.includes('addEventListener("pageshow"'),
  disposesAudio: source.includes(".dispose()"),
}));
const duplicateValues = (values: string[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const failures = [
  ...(manifest.cases.length === 12 ? [] : [`frozen case count is ${manifest.cases.length}, expected 12`]),
  ...authoredLayouts.filter((item) => !SOUNDSCAPE_IDS.includes(item.layoutId as (typeof SOUNDSCAPE_IDS)[number])).map((item) => `${item.caseId} has no soundscape for ${item.layoutId}`),
  ...SOUNDSCAPE_IDS.filter((id) => !authoredLayouts.some((item) => item.layoutId === id)).map((id) => `${id} is not attached to a frozen case`),
  ...duplicateValues(profiles.map((profile) => profile.signature)).map((value) => `duplicate signature ${value}`),
  ...duplicateValues(profiles.map((profile) => `${profile.baseFrequency}/${profile.harmonicFrequency}/${profile.pulseSeconds}/${profile.effectRatio}`)).map((value) => `duplicate numeric identity ${value}`),
  ...profiles.filter((profile) => !profile.decorativeOnly).map((profile) => `${profile.id} is not marked decorative-only`),
  ...profiles.filter((profile) => profile.noiseGain < 0 || profile.noiseGain > 0.05).map((profile) => `${profile.id} noise gain out of safe range`),
  ...profiles.filter((profile) => profile.pulseSeconds < 3 || profile.pulseSeconds > 15).map((profile) => `${profile.id} pulse interval out of safe range`),
  ...profiles.filter((profile) => profile.pulseFrequencies.length === 0).map((profile) => `${profile.id} has no ambient pulse identity`),
  ...lifecycleCoverage.filter((item) => !item.visibilitychange || !item.pagehide || !item.pageshow || !item.disposesAudio).map((item) => `${item.path} lacks complete background audio lifecycle handling`),
];

const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "procedural-soundscape-registry-audit",
  frozenCaseCount: manifest.cases.length,
  soundscapeCount: profiles.length,
  authoredLayouts,
  profiles: profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    signature: profile.signature,
    decorativeOnly: profile.decorativeOnly,
    oscillatorIdentity: `${profile.baseFrequency}/${profile.harmonicFrequency} Hz`,
    pulseIdentity: `${profile.pulseSeconds}s · ${profile.pulseFrequencies.join("/")} Hz · ${profile.pulseWave}`,
    noiseIdentity: `${profile.noiseFilter} ${profile.noiseFrequency} Hz @ ${profile.noiseGain}`,
    effectRatio: profile.effectRatio,
  })),
  noRequiredAudioInformation: profiles.every((profile) => profile.decorativeOnly),
  lifecycleCoverage,
  failures,
  passed: failures.length === 0,
};

const reportPath = resolve(root, "docs/v0.9-soundscapes.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, frozenCases: report.frozenCaseCount, soundscapes: report.soundscapeCount, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
