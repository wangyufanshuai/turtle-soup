import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeCaseQuality, validateCaseShape, type CaseFile, type QueryCorpusEntry } from "../packages/mystery-core/src/index.ts";
import { c01QuestionCorpus } from "../content/zh/cases/c01-question-corpus.ts";

const casePath = resolve(process.argv[2] ?? "content/zh/cases/c01-cold-room-knock.json");
const corpusPath = process.argv[3] ? resolve(process.argv[3]) : undefined;
const caseFile = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;
const corpus = corpusPath
  ? JSON.parse(readFileSync(corpusPath, "utf8")) as QueryCorpusEntry[]
  : caseFile.id === "c01-cold-room-knock" ? c01QuestionCorpus : [];

validateCaseShape(caseFile);
const report = analyzeCaseQuality(caseFile, corpus);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
