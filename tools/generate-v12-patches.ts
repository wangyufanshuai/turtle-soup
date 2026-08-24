import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReleaseContent } from "./lib/release-content.ts";

const root = resolve(process.argv[2] ?? ".");
const entries = loadReleaseContent(root, "v1.2-internal-rc").entries;
const patches = entries.map((entry) => ({
  caseId: entry.id,
  baseCanonicalHash: entry.canonicalHash,
  presentationRevision: 1,
  title: typeof entry.public?.title === "string" ? entry.public.title : undefined,
  surface: typeof entry.public?.surface === "string" ? entry.public.surface : undefined,
}));
const directory = resolve(root, "content/zh/presentation/v1.2");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "patches.json"), JSON.stringify(patches, null, 2), "utf8");
console.log(JSON.stringify({ path: resolve(directory, "patches.json"), patches: patches.length }, null, 2));
