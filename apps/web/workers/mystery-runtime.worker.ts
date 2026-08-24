/// <reference lib="webworker" />

import {
  createRuntimeState,
  projectPlayerState,
  reduceGameCommand,
  replayCommands,
  validateCompatibleSave,
  applyPresentationPatch,
  type CaseFile,
  type CaseId,
  type GameCommand,
  type RuntimeState,
  type SaveEnvelope,
} from "@turtle-soup/mystery-core";
import { loadCaseFile } from "../.generated/worker-case-registry";
import { PRESENTATION_PATCHES } from "../.generated/presentation-patch-registry";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "../lib/worker-protocol";

let caseFile: CaseFile | undefined;
let state: RuntimeState | undefined;
let commands: GameCommand[] = [];

function makeSave(): SaveEnvelope {
  if (!caseFile || !state) throw new Error("Runtime is not initialized");
  return {
    schemaVersion: 1,
    caseId: caseFile.id,
    caseVersion: caseFile.metadata?.contentVersion ?? 1,
    contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
    commands,
    updatedAt: new Date().toISOString(),
    completed: state.solved,
  };
}

self.onmessage = async (message: MessageEvent<RuntimeWorkerRequest>) => {
  const request = message.data;
  if (request.type === "initialize") {
    try {
      const baseCaseFile = await loadCaseFile(request.caseId);
      const patch = PRESENTATION_PATCHES[request.caseId];
      caseFile = applyPresentationPatch(baseCaseFile, patch);
    } catch (error) {
      const response: RuntimeWorkerResponse = {
        id: request.id,
        type: "error",
        code: "case_load_failed",
        message: error instanceof Error ? error.message : "案件内容无法加载",
      };
      self.postMessage(response);
      return;
    }
    let restoreStatus: RuntimeWorkerResponse["restoreStatus"] = "new";
    const validation = request.save === undefined
      ? undefined
      : validateCompatibleSave(request.save, caseFile.id, {
        caseVersion: caseFile.metadata?.contentVersion ?? 1,
        contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
      });
    if (validation?.ok) {
      try {
        const restored = replayCommands(caseFile, validation.value.commands);
        state = restored.state;
        commands = validation.value.commands;
        restoreStatus = "restored";
      } catch {
        state = createRuntimeState(caseFile);
        commands = [];
        restoreStatus = "corrupt";
      }
    } else {
      state = createRuntimeState(caseFile);
      commands = [];
      if (validation) restoreStatus = validation.code === "invalid" ? "corrupt" : "incompatible";
    }
    const response: RuntimeWorkerResponse = {
      id: request.id,
      projection: projectPlayerState(caseFile, state),
      events: [{ type: "case_started" }],
      accepted: true,
      save: makeSave(),
      restoreStatus,
    };
    self.postMessage(response);
    return;
  }

  if (!caseFile || !state) {
    const response: RuntimeWorkerResponse = { id: request.id, type: "error", code: "not_initialized", message: "推理核心尚未初始化" };
    self.postMessage(response);
    return;
  }
  const result = reduceGameCommand(caseFile, state, request.command);
  if (result.accepted) {
    state = result.state;
    if (request.command.type === "restart_case") commands = [];
    else if (request.command.type !== "start_case") commands = [...commands, request.command];
  }
  const response: RuntimeWorkerResponse = {
    id: request.id,
    projection: result.accepted ? projectPlayerState(caseFile, state) : result.projection,
    events: result.events,
    accepted: result.accepted,
    save: makeSave(),
  };
  self.postMessage(response);
};

export {};
