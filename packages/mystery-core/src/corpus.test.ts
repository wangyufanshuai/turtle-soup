import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { normalizeQuestion } from "./engine.ts";
import type { CaseFile } from "./types.ts";
import { c02QuestionCorpus } from "../../../content/zh/cases/c02-question-corpus.ts";
import { c03QuestionCorpus } from "../../../content/zh/cases/c03-question-corpus.ts";
import { c04QuestionCorpus } from "../../../content/zh/cases/c04-question-corpus.ts";
import { c05QuestionCorpus } from "../../../content/zh/cases/c05-question-corpus.ts";
import { c06QuestionCorpus } from "../../../content/zh/cases/c06-question-corpus.ts";
import { c07QuestionCorpus } from "../../../content/zh/cases/c07-question-corpus.ts";
import { c08QuestionCorpus } from "../../../content/zh/cases/c08-question-corpus.ts";
import { c09QuestionCorpus } from "../../../content/zh/cases/c09-question-corpus.ts";
import { c10QuestionCorpus } from "../../../content/zh/cases/c10-question-corpus.ts";
import { c11QuestionCorpus } from "../../../content/zh/cases/c11-question-corpus.ts";
import { c12QuestionCorpus } from "../../../content/zh/cases/c12-question-corpus.ts";
import { c01QuestionCorpus } from "../../../content/zh/cases/c01-question-corpus.ts";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(resolve(here, `../../../content/zh/cases/${name}.json`), "utf8")) as CaseFile;

test("C02 and C03 question corpora normalize without silent mismatches", () => {
  for (const [caseFile, corpus] of [[load("c01-cold-room-knock"), c01QuestionCorpus], [load("c02-snow-route"), c02QuestionCorpus], [load("c03-second-shadow"), c03QuestionCorpus], [load("c04-unpostable-reply"), c04QuestionCorpus], [load("c05-third-lamp"), c05QuestionCorpus], [load("c06-nonexistent-ticket"), c06QuestionCorpus], [load("c07-key-returns"), c07QuestionCorpus], [load("c08-unclaimed-recording"), c08QuestionCorpus], [load("c09-rain-room"), c09QuestionCorpus], [load("c10-single-ring"), c10QuestionCorpus], [load("c11-borrowed-signature"), c11QuestionCorpus], [load("c12-zero-floor-elevator"), c12QuestionCorpus]] as const) {
    assert.ok(corpus.length >= 150, `${caseFile.id} corpus should contain at least 150 entries`);
    const normalized = corpus.map((entry) => entry.rawQuestion.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "")).filter(Boolean);
    assert.ok(1 - new Set(normalized).size / normalized.length < 0.1, `${caseFile.id} normalized duplicate rate should stay below 10%`);
    for (const entry of corpus) {
      const result = normalizeQuestion(caseFile, entry.rawQuestion);
      assert.equal(result.status, "matched", `${caseFile.id}:${entry.id} should be matched or explicitly excluded`);
      assert.equal(result.queryId, entry.expectedQueryId, `${caseFile.id}:${entry.id} mapped to the wrong semantic query`);
    }
  }
});

test("a low-confidence C03 lighting typo never silently becomes the two-person predicate", () => {
  const result = normalizeQuestion(load("c03-second-shadow"), "第二个影子是光造成的吗？");
  assert.notEqual(result.status === "matched" ? result.queryId : undefined, "query-two-people");
  assert.equal(result.status, "ambiguous");
  assert.ok(result.candidateQueryIds.includes("query-lighting-source"));
  assert.ok(result.candidateQueryIds.includes("query-two-people"));
});
