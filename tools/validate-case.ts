import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeCaseQuality, validateCaseShape, type CaseFile, type QueryCorpusEntry } from "../packages/mystery-core/src/index.ts";

const casePath = resolve(process.argv[2] ?? "content/zh/cases/c01-cold-room-knock.json");
const corpusPath = process.argv[3] ? resolve(process.argv[3]) : undefined;
const caseFile = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;
let corpus: QueryCorpusEntry[];
if (corpusPath && corpusPath.endsWith(".ts")) {
  const imported = await import(pathToFileURL(corpusPath).href) as Record<string, unknown>;
  corpus = (Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? []);
} else {
  if (corpusPath) corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as QueryCorpusEntry[];
  else {
    const code = caseFile.id.match(/^(c\d+)/)?.[1];
    const inferred = code ? resolve(casePath, `../${code}-question-corpus.ts`) : undefined;
    if (inferred) {
      const imported = await import(pathToFileURL(inferred).href) as Record<string, unknown>;
      corpus = Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? [];
    } else corpus = [];
  }
}

validateCaseShape(caseFile);
const report = analyzeCaseQuality(caseFile, corpus);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
