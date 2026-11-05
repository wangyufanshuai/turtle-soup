import { resolve } from "node:path";
import { currentSource, evidenceIdentity, writeReport } from "./lib/v212-evidence.ts";

const root = resolve(process.argv[2] ?? ".");
const identity = evidenceIdentity(root);
writeReport(root, "docs/v2.12-run.json", { ...identity, initializedAt: new Date().toISOString(), sourceFiles: currentSource(root).files, qualification: "Identity only; initialization does not pass any quality gate. Build hash is null until an actual v2.12 static build exists." });
console.log(JSON.stringify(identity, null, 2));
