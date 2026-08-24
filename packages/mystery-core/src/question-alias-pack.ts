import type { CaseFile, QuestionAliasPack } from "./types.ts";

export interface QuestionAliasPackValidation {
  valid: boolean;
  failures: string[];
  aliasCount: number;
  ambiguityCount: number;
}

function normalizedAlias(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .replace(/^(请问|我想确认|现在能否确认|请核对|现场问题|请验证|我的问题是|能不能判断|请回答一个事实|记录是否支持|在这个案件里|请给出记录结论|调查一下|请从证据判断|能否核实|请从档案确认|请依据来源判断|调查记录里|后台记录里|从雪地现场看|从舞台现场看|关于这条路线|关于这个角色|证词是否支持)/, "")
    .replace(/(只回答事实|请只回答事实)$/, "");
}

export function validateQuestionAliasPack(caseFile: CaseFile, pack: QuestionAliasPack | undefined): QuestionAliasPackValidation {
  if (!pack) return { valid: true, failures: [], aliasCount: 0, ambiguityCount: 0 };
  const failures: string[] = [];
  const queryIds = new Set(caseFile.questionSemantics.map((query) => query.id));
  const canonicalHash = caseFile.metadata?.canonicalHash ?? "unversioned";
  if (pack.schemaVersion !== 1) failures.push(`unsupported alias schema ${String(pack.schemaVersion)}`);
  if (pack.caseId !== caseFile.id) failures.push(`alias case mismatch: ${pack.caseId}`);
  if (pack.baseCanonicalHash !== canonicalHash) failures.push(`alias hash mismatch: ${pack.baseCanonicalHash}`);
  if (!Number.isInteger(pack.revision) || pack.revision < 1) failures.push("alias revision must be a positive integer");

  const routed = new Map<string, Set<string>>();
  for (const query of caseFile.questionSemantics) {
    for (const phrase of query.examplePhrases ?? []) {
      const normalized = normalizedAlias(phrase);
      if (!normalized) continue;
      const targets = routed.get(normalized) ?? new Set<string>();
      targets.add(query.id);
      routed.set(normalized, targets);
    }
  }
  for (const alias of pack.aliases) {
    if (!queryIds.has(alias.queryId)) failures.push(`alias references unknown query ${alias.queryId}`);
    const normalized = normalizedAlias(alias.text);
    if (!normalized) failures.push(`empty alias for ${alias.queryId}`);
    const existing = routed.get(normalized) ?? new Set<string>();
    if ([...existing].some((queryId) => queryId !== alias.queryId)) failures.push(`alias collision routes to ${[...existing].join(", ")} and ${alias.queryId}: ${alias.text}`);
    existing.add(alias.queryId);
    routed.set(normalized, existing);
  }

  for (const ambiguity of pack.ambiguousPhrases ?? []) {
    const normalized = normalizedAlias(ambiguity.text);
    const candidates = [...new Set(ambiguity.candidateQueryIds)];
    if (!normalized) failures.push("empty ambiguity phrase");
    if (candidates.length < 2) failures.push(`ambiguity must name at least two queries: ${ambiguity.text}`);
    for (const queryId of candidates) if (!queryIds.has(queryId)) failures.push(`ambiguity references unknown query ${queryId}`);
    const routedTargets = routed.get(normalized);
    if (routedTargets && [...routedTargets].some((queryId) => !candidates.includes(queryId))) failures.push(`ambiguity collides with routed alias: ${ambiguity.text}`);
  }

  return {
    valid: failures.length === 0,
    failures,
    aliasCount: pack.aliases.length,
    ambiguityCount: pack.ambiguousPhrases?.length ?? 0,
  };
}

export function applyQuestionAliasPack(caseFile: CaseFile, pack: QuestionAliasPack | undefined): CaseFile {
  const validation = validateQuestionAliasPack(caseFile, pack);
  if (!pack || !validation.valid) return caseFile;
  return { ...caseFile, questionAliasPack: structuredClone(pack) };
}
