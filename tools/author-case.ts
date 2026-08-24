import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeCaseQuality, validateCaseShape, type CaseFile, type QueryCorpusEntry } from "../packages/mystery-core/src/index.ts";

const casePath = resolve(process.argv[2] ?? "content/zh/cases/c01-cold-room-knock.json");
const reportPath = resolve(process.argv[3] ?? `docs/content-reports/${casePath.split(/[\\/]/).pop()?.replace(/\.json$/, "")}.md`);
const caseFile = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;
validateCaseShape(caseFile);
const caseDirectory = dirname(casePath);
const caseStem = casePath.split(/[\\/]/).pop()?.replace(/\.json$/, "") ?? "";
const corpusFilename = readdirSync(caseDirectory).find((name) => name.endsWith("-question-corpus.ts") && (name.startsWith(caseStem) || caseStem.startsWith(name.replace(/-question-corpus\.ts$/, ""))));
const corpusPath = corpusFilename ? resolve(caseDirectory, corpusFilename) : casePath.replace(/\.json$/, "-question-corpus.ts");
let corpus: QueryCorpusEntry[] = [];
try {
  const imported = await import(pathToFileURL(corpusPath).href) as Record<string, unknown>;
  corpus = (Object.values(imported).find((value): value is QueryCorpusEntry[] => Array.isArray(value)) ?? []);
  if (corpus.length === 0) {
    const source = readFileSync(corpusPath, "utf8");
    const matches = [...source.matchAll(/\{\s*id:\s*["']([^"']+)["'][\s\S]*?rawQuestion:\s*["']([^"']+)["'][\s\S]*?expectedQueryId:\s*["']([^"']+)["']/g)];
    corpus = matches.map(([, id, rawQuestion, expectedQueryId]) => ({ id, rawQuestion, expectedQueryId, category: "positive" }));
  }
} catch { /* A draft may be reported before its corpus is created. */ }
const report = analyzeCaseQuality(caseFile, corpus);
const checklist = [
  ["事实图先于公开叙事", caseFile.events.length >= 7 && caseFile.facts.length >= 10],
  ["至少两个作者错误理论", caseFile.hypotheses.filter((item) => item.kind === "alternative").length >= 2],
  ["最小证明集已定义", caseFile.solutionCertificate.minimumProofSets.length > 0],
  ["证明回放不少于五拍", caseFile.proofReplay.length >= 5],
  ["中文语料达到 150 条", report.metrics.corpusMinimumMet],
  ["红鲱鱼存在", report.metrics.redHerringPresence],
];
const body = `# ${caseFile.id} 作者审查报告\n\n生成时间：${new Date().toISOString()}\n\n## 案件摘要\n\n- schema：${caseFile.schemaVersion}\n- 内容版本：${caseFile.metadata?.contentVersion ?? "未设置"}\n- 内容哈希：${caseFile.metadata?.canonicalHash ?? "未设置"}\n- 预计时长：${report.metrics.estimatedSolveTimeMinutes.min}–${report.metrics.estimatedSolveTimeMinutes.max} 分钟\n\n## 结构指标\n\n| 指标 | 数值 |\n| --- | ---: |\n| 事件/事实 | ${caseFile.events.length} / ${report.metrics.factCount} |\n| 证据 | ${report.metrics.evidenceCount} |\n| 查询语义 | ${report.metrics.queryCount} |\n| 语料 | ${report.metrics.corpusCount} |\n| 查询覆盖率 | ${report.metrics.questionCoverage}% |\n| 必要证据覆盖率 | ${report.metrics.requiredEvidenceCoverage}% |\n| 替代理论覆盖率 | ${report.metrics.alternativeCoverage}% |\n| 回放覆盖率 | ${report.metrics.proofReplayCoverage}% |\n| 歧义率 | ${report.metrics.ambiguityRate}% |\n| 重复问题率 | ${report.metrics.duplicateQuestionRate}% |\n\n## 作者门槛\n\n${checklist.map(([label, ok]) => `- [${ok ? "x" : " "}] ${label}`).join("\n")}\n\n## 错误与警告\n\n${[...report.errors, ...report.warnings].length ? [...report.errors, ...report.warnings].map((item) => `- **${item.severity}** ${item.code}：${item.message}`).join("\n") : "无。"}\n\n## 作者下一步\n\n- 为每个关键事实补充至少三种自然问法和一个构建器路径。\n- 为每个错误理论写出一条公平可得的排除证据。\n- 完成至少 5 名不知道答案玩家的内部盲测，再进入发布候选。\n`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, body, "utf8");
console.log(JSON.stringify({ caseId: caseFile.id, reportPath, passed: report.passed, errors: report.errors.length, warnings: report.warnings.length }, null, 2));
if (!report.passed) process.exitCode = 1;
