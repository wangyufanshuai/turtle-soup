import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  buildFunGateReport,
  parseObservationCsv,
  validateSessionExport,
  type ParsedInput,
} from "./lib/fun-gate-evaluation.ts";
import type { TestSessionExport } from "../packages/mystery-core/src/test-session.ts";

const directory = resolve(process.argv[2] ?? "test-data/fun-gate-v1.8");
const outputPath = process.argv[3] ? resolve(process.argv[3]) : undefined;
const observationPath = resolve(process.argv[4] ?? resolve(directory, "observations.csv"));

const jsonFiles = (() => {
  try { return readdirSync(directory).filter((name) => name.endsWith(".json") && name !== "batch-manifest.json"); }
  catch { return []; }
})();

const sessionInput: ParsedInput<TestSessionExport> = { accepted: [], rejected: [] };
for (const filename of jsonFiles) {
  try {
    const parsed = JSON.parse(readFileSync(resolve(directory, filename), "utf8")) as unknown;
    const validation = validateSessionExport(parsed, filename);
    if (validation.value) sessionInput.accepted.push(validation.value);
    else sessionInput.rejected.push({ source: filename, reasons: validation.reasons });
  } catch (error) {
    sessionInput.rejected.push({ source: filename, reasons: [error instanceof Error ? error.message : "invalid JSON"] });
  }
}

const observationFilePresent = (() => {
  try { readFileSync(observationPath); return true; }
  catch { return false; }
})();
const observationInput = observationFilePresent
  ? parseObservationCsv(readFileSync(observationPath, "utf8"))
  : { accepted: [], rejected: [], rowCount: 0 };

const report = buildFunGateReport({
  sessions: sessionInput.accepted,
  observations: observationInput.accepted,
  sessionFilesFound: jsonFiles.length,
  rejectedSessionFiles: sessionInput.rejected.length,
  observationRowsFound: observationInput.rowCount,
  rejectedObservationRows: observationInput.rejected.length,
});

const result = {
  ...report,
  inputAudit: {
    ...report.inputAudit,
    directory,
    observationFile: basename(observationPath),
    observationFilePresent,
    rejectedInputCount: sessionInput.rejected.length + observationInput.rejected.length,
  },
};

if (outputPath) {
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(result, null, 2));
