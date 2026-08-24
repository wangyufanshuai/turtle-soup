import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CaseFile, QueryCorpusEntry } from "../../packages/mystery-core/src/index.ts";

export interface ReleaseProfile {
  profileVersion: number;
  id: string;
  title: string;
  status: string;
  publishable?: boolean;
  humanEvaluation?: string;
  manifests: string[];
}

export interface ReleaseCaseEntry {
  id: string;
  file: string;
  casePath: string;
  manifestPath: string;
  seasonId: string;
  seasonTitle: string;
  contentVersion: number;
  canonicalHash: string;
  status: string;
  fileSha256?: string;
  public?: Record<string, unknown>;
}

export function releaseProfilePath(root: string, profileId = process.env.TURTLE_SOUP_RELEASE_PROFILE ?? "v1.4-internal-rc") {
  return resolve(root, "content/zh/releases", `${profileId}.json`);
}

export function loadReleaseContent(root: string, profileId?: string): { profile: ReleaseProfile; entries: ReleaseCaseEntry[] } {
  const profilePath = releaseProfilePath(root, profileId);
  const profile = JSON.parse(readFileSync(profilePath, "utf8")) as ReleaseProfile;
  const entries: ReleaseCaseEntry[] = [];
  for (const manifestRelative of profile.manifests) {
    const manifestPath = resolve(dirname(profilePath), manifestRelative);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      seasonId?: string;
      title?: string;
      cases: Array<{ id: string; file: string; contentVersion: number; canonicalHash: string; status: string; fileSha256?: string; public?: Record<string, unknown> }>;
    };
    const seasonId = manifest.seasonId ?? "season-1";
    const seasonTitle = manifest.title ?? "第一季：黑汤档案";
    for (const entry of manifest.cases) entries.push({ ...entry, casePath: resolve(dirname(manifestPath), entry.file), manifestPath, seasonId, seasonTitle });
  }
  const duplicates = entries.filter((entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) !== index);
  if (duplicates.length) throw new Error(`Release profile contains duplicate case ids: ${duplicates.map((item) => item.id).join(", ")}`);
  return { profile, entries };
}

export function loadCaseFile(entry: ReleaseCaseEntry): CaseFile {
  const caseFile = JSON.parse(readFileSync(entry.casePath, "utf8")) as CaseFile;
  if (caseFile.id !== entry.id || caseFile.metadata?.contentVersion !== entry.contentVersion || caseFile.metadata?.canonicalHash !== entry.canonicalHash) {
    throw new Error(`${entry.id}: manifest identity does not match case file`);
  }
  return caseFile;
}

export async function loadQuestionCorpus(entry: ReleaseCaseEntry): Promise<QueryCorpusEntry[]> {
  const code = entry.id.match(/^(c\d+)/)?.[1];
  if (!code) return [];
  const path = resolve(dirname(entry.casePath), `${code}-question-corpus.ts`);
  const imported = await import(`${pathToFileURL(path).href}?v=${Date.now()}`) as Record<string, unknown>;
  return Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? [];
}
