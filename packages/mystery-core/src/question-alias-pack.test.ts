import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import {
  applyQuestionAliasPack,
  normalizeQuestion,
  validateQuestionAliasPack,
  type CaseFile,
  type QuestionAliasPack,
} from "./index.ts";

const caseFile = JSON.parse(readFileSync(resolve("content/zh/cases/c01-cold-room-knock.json"), "utf8")) as CaseFile;
const pack: QuestionAliasPack = {
  schemaVersion: 1,
  releaseProfile: "v1.5-internal-rc",
  caseId: caseFile.id,
  baseCanonicalHash: caseFile.metadata?.canonicalHash ?? "",
  revision: 1,
  aliases: [
    { text: "屋里当时有人没", queryId: "query-person-inside", category: "colloquial" },
    { text: "那手机他的？", queryId: "query-lin-ownership", category: "pronoun" },
  ],
  ambiguousPhrases: [
    { text: "里面是人还是手机弄响的？", candidateQueryIds: ["query-person-inside", "query-phone-inside"] },
  ],
};

test("question alias packs route only to existing deterministic queries", () => {
  const validation = validateQuestionAliasPack(caseFile, pack);
  assert.equal(validation.valid, true);
  const enhanced = applyQuestionAliasPack(caseFile, pack);
  assert.equal(normalizeQuestion(enhanced, "屋里当时有人没").queryId, "query-person-inside");
  assert.equal(normalizeQuestion(enhanced, "那手机他的？").queryId, "query-lin-ownership");
  assert.equal(caseFile.questionAliasPack, undefined);
});

test("question alias packs preserve deliberate compound ambiguity", () => {
  const enhanced = applyQuestionAliasPack(caseFile, pack);
  const result = normalizeQuestion(enhanced, "里面是人还是手机弄响的？");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidateQueryIds, ["query-person-inside", "query-phone-inside"]);
});

test("hash, query and collision errors fail closed to the baseline case", () => {
  const wrongHash = { ...pack, baseCanonicalHash: "wrong" };
  assert.equal(applyQuestionAliasPack(caseFile, wrongHash), caseFile);
  const invalidQuery = { ...pack, aliases: [{ ...pack.aliases[0], queryId: "query-hidden-answer" }] };
  assert.equal(validateQuestionAliasPack(caseFile, invalidQuery).valid, false);
  const collision = { ...pack, aliases: [...pack.aliases, { text: pack.aliases[0].text, queryId: "query-phone-inside", category: "colloquial" as const }] };
  assert.equal(validateQuestionAliasPack(caseFile, collision).valid, false);
});
