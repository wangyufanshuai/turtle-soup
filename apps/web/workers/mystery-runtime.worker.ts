/// <reference lib="webworker" />

import { applyPresentationPatch, applyQuestionAliasPack } from "@turtle-soup/mystery-core";
import { loadCaseFile } from "../.generated/worker-case-registry";
import { PRESENTATION_PATCHES } from "../.generated/presentation-patch-registry";
import { QUESTION_ALIAS_PACKS } from "../.generated/question-alias-registry";
import { HISTORICAL_QUESTION_ROUTING_CONTEXTS } from "../.generated/historical-question-routing-registry";
import { QUESTION_LANGUAGE_REVISION, INVESTIGATION_REVISION, PROOF_REVISION } from "../.generated/question-language-registry";
import type { RuntimeWorkerRequest } from "../lib/worker-protocol";
import { createRuntimeWorkerHandler } from "./runtime-handler";

const handle = createRuntimeWorkerHandler({
  questionLanguageRevision: QUESTION_LANGUAGE_REVISION,
  investigationRevision: INVESTIGATION_REVISION,
  proofRevision: PROOF_REVISION,
  async loadCase(caseId) {
    const baseCaseFile = await loadCaseFile(caseId);
    return applyQuestionAliasPack(applyPresentationPatch(baseCaseFile, PRESENTATION_PATCHES[caseId]), QUESTION_ALIAS_PACKS[caseId]);
  },
  historicalQuestionRoutingContexts: HISTORICAL_QUESTION_ROUTING_CONTEXTS,
  postMessage: (response) => self.postMessage(response),
});

self.onmessage = (message: MessageEvent<RuntimeWorkerRequest>) => { void handle(message.data); };

export {};
