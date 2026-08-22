/// <reference lib="webworker" />

import {
  createRuntimeState,
  projectPlayerState,
  reduceGameCommand,
  replayCommands,
  type CaseFile,
  type GameCommand,
  type RuntimeState,
  type SaveEnvelope,
} from "@turtle-soup/mystery-core";
import caseData from "../../../content/zh/cases/c01-cold-room-knock.json";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "../lib/worker-protocol";

const caseFile = caseData as CaseFile;
let state: RuntimeState = createRuntimeState(caseFile);
let commands: GameCommand[] = [];

function makeSave(): SaveEnvelope {
  return {
    schemaVersion: 1,
    caseId: caseFile.id,
    caseVersion: caseFile.metadata?.contentVersion ?? 1,
    contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
    commands,
    updatedAt: new Date().toISOString(),
  };
}

function compatible(save: SaveEnvelope): boolean {
  return save.schemaVersion === 1
    && save.caseId === caseFile.id
    && save.caseVersion === (caseFile.metadata?.contentVersion ?? 1)
    && save.contentHash === (caseFile.metadata?.canonicalHash ?? "unversioned");
}

self.onmessage = (message: MessageEvent<RuntimeWorkerRequest>) => {
  const request = message.data;
  if (request.type === "initialize") {
    let restoreStatus: RuntimeWorkerResponse["restoreStatus"] = "new";
    if (request.save && compatible(request.save)) {
      const restored = replayCommands(caseFile, request.save.commands);
      state = restored.state;
      commands = request.save.commands;
      restoreStatus = "restored";
    } else {
      state = createRuntimeState(caseFile);
      commands = [];
      if (request.save) restoreStatus = "incompatible";
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
