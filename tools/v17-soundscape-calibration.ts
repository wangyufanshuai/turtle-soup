import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSoundscapeProfile, SOUNDSCAPE_IDS, SOUNDSCAPE_PROFILES } from "../apps/web/lib/audio-profiles.ts";
import { loadCaseFile, loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const release = loadReleaseContent(root, "v1.7-internal-rc");
const profiles = SOUNDSCAPE_IDS.map((id) => SOUNDSCAPE_PROFILES[id]);
const shellSources = ["apps/web/components/game-shell.tsx", "apps/web/components/variant-shell.tsx"].map((path) => ({
  path,
  source: readFileSync(resolve(root, path), "utf8"),
}));

const lifecycleCoverage = shellSources.map(({ path, source }) => ({
  path,
  visibilitychange: source.includes('addEventListener("visibilitychange"'),
  pagehide: source.includes('addEventListener("pagehide"'),
  pageshow: source.includes('addEventListener("pageshow"'),
  disposesAudio: source.includes(".dispose()"),
}));

const cases = release.entries.map((entry) => {
  const caseFile = loadCaseFile(entry);
  const layoutId = caseFile.presentation?.layoutId ?? "cold-room";
  const profile = getSoundscapeProfile(entry.id, layoutId);
  const expectedProfileId = SOUNDSCAPE_PROFILES[entry.id] ? entry.id : layoutId;
  return {
    caseId: entry.id,
    layoutId,
    profileId: profile.id,
    label: profile.label,
    signature: profile.signature,
    decorativeOnly: profile.decorativeOnly,
    expectedProfileId,
    directMatch: profile.id === expectedProfileId,
    fellBackToColdRoom: expectedProfileId !== "cold-room" && profile.id === "cold-room",
  };
});

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

const numericIdentities = profiles.map((profile) => [
  profile.baseFrequency,
  profile.harmonicFrequency,
  profile.noiseGain,
  profile.noiseFilter,
  profile.noiseFrequency,
  profile.modulationFrequency,
  profile.pulseSeconds,
  profile.pulseFrequencies.join("/"),
  profile.pulseWave,
  profile.effectRatio,
].join("|"));

const expectedLabels: Record<string, string> = {
  "c37-zeroed-pressure-gauge": "压力表温漂与泄压尾音",
  "c48-two-point-calibration": "校准端点与中段曲线",
  "c60-last-sample-before-stop": "终止链与最后缓存窗",
};

const variantSource = shellSources.find((item) => item.path.endsWith("variant-shell.tsx"))?.source ?? "";
const failures = [
  ...(release.entries.length === 60 ? [] : [`release has ${release.entries.length} cases, expected 60`]),
  ...(SOUNDSCAPE_IDS.length === 60 ? [] : [`registry has ${SOUNDSCAPE_IDS.length} ids, expected 60`]),
  ...cases.filter((item) => !item.directMatch).map((item) => `${item.caseId} layout ${item.layoutId} resolved to ${item.profileId}`),
  ...cases.filter((item) => item.fellBackToColdRoom).map((item) => `${item.caseId} fell back to cold-room`),
  ...duplicates(profiles.map((profile) => profile.signature)).map((value) => `duplicate signature ${value}`),
  ...duplicates(numericIdentities).map((value) => `duplicate numeric identity ${value}`),
  ...profiles.filter((profile) => profile.decorativeOnly !== true).map((profile) => `${profile.id} is not decorative-only`),
  ...Object.entries(expectedLabels).filter(([caseId, label]) => cases.find((item) => item.caseId === caseId)?.label !== label).map(([caseId]) => `${caseId} label mismatch`),
  ...lifecycleCoverage.filter((item) => !item.visibilitychange || !item.pagehide || !item.pageshow || !item.disposesAudio).map((item) => `${item.path} lacks complete audio lifecycle handling`),
  ...(variantSource.includes("getSoundscapeProfile(projection.case.id, layout)") ? [] : ["variant shell does not resolve soundscape from case id with public layout fallback"]),
];

const report = {
  reportVersion: "1.7",
  generatedAt: new Date().toISOString(),
  releaseProfile: "v1.7-internal-rc",
  status: "internal-rc / human-evaluation-pending",
  humanParticipants: 0,
  mode: "sixty-case-procedural-soundscape-calibration",
  caseCount: cases.length,
  soundscapeCount: profiles.length,
  uniqueSignatures: new Set(profiles.map((profile) => profile.signature)).size,
  uniqueNumericIdentities: new Set(numericIdentities).size,
  noFallbacks: cases.every((item) => !item.fellBackToColdRoom && item.directMatch),
  noRequiredAudioInformation: profiles.every((profile) => profile.decorativeOnly),
  cases,
  lifecycleCoverage,
  expectedLabels,
  failures,
  passed: failures.length === 0,
  qualification: "音景审计只证明案件映射、参数唯一性、页面生命周期和非必要信息边界；它不能证明真人听感、审美或情绪效果。",
};

const reportPath = resolve(root, "docs/v1.7-soundscape-calibration.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, cases: report.caseCount, soundscapes: report.soundscapeCount, noFallbacks: report.noFallbacks, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
