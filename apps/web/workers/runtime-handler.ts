import {
  commitsRuntimeTransition,
  createQuestionRoutingOffer,
  createRuntimeState,
  createPropositionCommand,
  projectPlayerState,
  reduceGameCommand,
  replayCommands,
  sanitizeGameCommand,
  validateCompatibleSave,
  validateSaveEnvelope,
  isProofOperation,
  type CaseFile,
  type CaseId,
  type GameCommand,
  type HistoricalQuestionRoutingContext,
  type RuntimeState,
  type SaveEnvelope,
} from "@turtle-soup/mystery-core";
import type { RuntimeWorkerRequest, RuntimeWorkerResponse } from "../lib/worker-protocol.ts";

/** Production Worker handler; tests inject only transport and content loading, never runtime behavior. */
export function createRuntimeWorkerHandler(dependencies: {
  loadCase: (caseId: CaseId) => Promise<CaseFile>;
  questionLanguageRevision?: "m01";
  investigationRevision?: "m2";
  proofRevision?: "m3";
  /** Build-pinned worker metadata only; never read this authority from commands, saves, or requests. */
  historicalQuestionRoutingContexts?: Readonly<
    Record<string, readonly HistoricalQuestionRoutingContext[]>
  >;
  postMessage: (response: RuntimeWorkerResponse) => void;
}) {
  let caseFile: CaseFile | undefined;
  let state: RuntimeState | undefined;
  let commands: GameCommand[] = [];
  let persistenceBlocked = false;
  let recoverySave: SaveEnvelope | undefined;
  let queue = Promise.resolve();
  const investigationStart: GameCommand =
    dependencies.investigationRevision === "m2"
      ? { type: "begin_investigation", revision: "m2" }
      : { type: "start_case", initialDraftOrder: "opaque" };
  const initialCommand: GameCommand =
    dependencies.proofRevision === "m3"
      ? { type: "proof_action", revision: "m3", action: investigationStart }
      : investigationStart;

  function makeSave(): SaveEnvelope {
    if (!caseFile || !state) throw new Error("Runtime is not initialized");
    return {
      schemaVersion: 1,
      caseId: caseFile.id,
      caseVersion: caseFile.metadata?.contentVersion ?? 1,
      contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
      commands: structuredClone(commands),
      updatedAt: new Date().toISOString(),
      completed: state.solved,
    };
  }

  async function handle(request: RuntimeWorkerRequest): Promise<void> {
    if (request.type === "initialize") {
      // A failed case switch must never leave the previous runtime usable.
      caseFile = undefined;
      state = undefined;
      commands = [];
      persistenceBlocked = false;
      recoverySave = undefined;
      try {
        caseFile = await dependencies.loadCase(request.caseId);
        if (dependencies.questionLanguageRevision)
          caseFile = {
            ...caseFile,
            questionLanguageRevision: dependencies.questionLanguageRevision,
          };
        if (dependencies.investigationRevision)
          caseFile = { ...caseFile, investigationRevision: dependencies.investigationRevision };
        if (dependencies.proofRevision)
          caseFile = { ...caseFile, proofRevision: dependencies.proofRevision };
        if (caseFile.id !== request.caseId) throw new Error("case identity mismatch");
      } catch {
        dependencies.postMessage({
          id: request.id,
          type: "error",
          code: "case_load_failed",
          message: "案件内容无法加载或版本不匹配；未切换到其他案件。",
        });
        return;
      }
      let restoreStatus: "new" | "restored" | "incompatible" | "corrupt" = "new";
      const validation =
        request.save === undefined
          ? undefined
          : validateCompatibleSave(request.save, caseFile.id, {
              caseVersion: caseFile.metadata?.contentVersion ?? 1,
              contentHash: caseFile.metadata?.canonicalHash ?? "unversioned",
            });
      if (validation?.ok) {
        try {
          state = replayCommands(caseFile, validation.value.commands, {
            historicalQuestionRoutingContexts:
              dependencies.historicalQuestionRoutingContexts?.[caseFile.id],
          }).state;
          commands = validation.value.commands;
          restoreStatus = "restored";
        } catch {
          restoreStatus = "corrupt";
        }
      } else if (validation)
        restoreStatus = validation.code === "invalid" ? "corrupt" : "incompatible";
      if (!state) {
        state = createRuntimeState(caseFile, "opaque", dependencies.investigationRevision);
        commands = [initialCommand];
      }
      if (request.saveReadFailed) restoreStatus = "corrupt";
      persistenceBlocked = restoreStatus === "corrupt" || restoreStatus === "incompatible";
      if (persistenceBlocked) {
        const original = validateSaveEnvelope(request.save);
        if (original.ok) recoverySave = original.value;
      }
      dependencies.postMessage({
        id: request.id,
        projection: projectPlayerState(caseFile, state),
        events: [{ type: "case_started" }],
        accepted: !persistenceBlocked,
        save: makeSave(),
        restoreStatus,
        persistenceBlocked,
        ...(recoverySave ? { recoverySave } : {}),
      });
      return;
    }
    if (!caseFile || !state) {
      dependencies.postMessage({
        id: request.id,
        type: "error",
        code: "not_initialized",
        message: "推理核心尚未初始化",
      });
      return;
    }
    if (request.type === "prepare_question_routing") {
      dependencies.postMessage({
        id: request.id,
        type: "routing_context",
        offer: createQuestionRoutingOffer(caseFile, state, request.rawText),
      });
      return;
    }
    const command = sanitizeGameCommand(request.command);
    if (!command || (persistenceBlocked && command.type !== "restart_case")) {
      dependencies.postMessage({
        id: request.id,
        projection: projectPlayerState(caseFile, state),
        events: [
          {
            type: "command_rejected",
            message: persistenceBlocked
              ? "原存档无法完整恢复，已保留且未覆盖。请先导出备份，再明确选择重新开始。"
              : "调查操作格式无效。",
          },
        ],
        accepted: false,
        save: makeSave(),
        persistenceBlocked,
        ...(recoverySave ? { recoverySave } : {}),
      });
      return;
    }
    let loggedCommand: GameCommand =
      command.type === "confirm_interpretation" &&
      command.rawText === undefined &&
      state.pendingInterpretation
        ? { ...command, rawText: state.pendingInterpretation.rawText }
        : command;
    if (dependencies.questionLanguageRevision === "m01" && loggedCommand.type === "ask_text") {
      loggedCommand = createPropositionCommand(caseFile, loggedCommand.rawText);
    } else if (
      loggedCommand.type === "confirm_interpretation" &&
      state.pendingInterpretation?.resolverRevision === "m01" &&
      loggedCommand.rawText
    ) {
      loggedCommand = {
        ...loggedCommand,
        type: "confirm_proposition",
        resolverRevision: "m01",
        rawText: loggedCommand.rawText,
      };
    }
    if (dependencies.investigationRevision === "m2") {
      if (loggedCommand.type === "set_theory_hypothesis")
        loggedCommand = { ...loggedCommand, type: "choose_explanation", revision: "m2" };
      else if (loggedCommand.type === "submit_theory")
        loggedCommand = { ...loggedCommand, type: "submit_investigation", revision: "m2" };
      else if (loggedCommand.type === "start_case") loggedCommand = initialCommand;
    }
    if (
      dependencies.proofRevision === "m3" &&
      !["proof_action", "edit_proof", "undo_proof_edit", "set_theory_note"].includes(
        loggedCommand.type,
      ) &&
      loggedCommand.type !== "proof_action" &&
      loggedCommand.type !== "edit_proof" &&
      loggedCommand.type !== "undo_proof_edit"
    ) {
      loggedCommand = isProofOperation(loggedCommand)
        ? {
            type: "edit_proof",
            revision: "m3",
            theoryId: "theoryId" in loggedCommand ? loggedCommand.theoryId : state.activeTheoryId,
            operations: [loggedCommand],
          }
        : { type: "proof_action", revision: "m3", action: loggedCommand };
    }
    const result = reduceGameCommand(caseFile, state, loggedCommand);
    if (commitsRuntimeTransition(result)) {
      state = result.state;
      if (command.type === "restart_case") {
        state = createRuntimeState(caseFile, "opaque", dependencies.investigationRevision);
        commands = [initialCommand];
        persistenceBlocked = false;
        recoverySave = undefined;
      } else if (command.type === "start_case" || command.type === "begin_investigation")
        commands = [loggedCommand];
      else {
        const previous = commands.at(-1);
        const replaceNote =
          loggedCommand.type === "set_theory_note" &&
          previous?.type === "set_theory_note" &&
          previous.theoryId === loggedCommand.theoryId;
        commands = [...(replaceNote ? commands.slice(0, -1) : commands), loggedCommand];
      }
    }
    dependencies.postMessage({
      id: request.id,
      projection: projectPlayerState(caseFile, state),
      events: result.events,
      accepted: result.accepted,
      save: makeSave(),
      persistenceBlocked,
      ...(command.type === "restart_case" && result.accepted
        ? { restoreStatus: "new" as const }
        : {}),
    });
  }

  // Async initialization and rapid commands observe their transport order.
  return (request: RuntimeWorkerRequest): Promise<void> => {
    const next = queue.then(async () => {
      if (
        !request ||
        !Number.isSafeInteger(request.id) ||
        !["initialize", "command", "prepare_question_routing"].includes(request.type) ||
        (request.type === "initialize" &&
          (typeof request.caseId !== "string" || request.caseId.length > 256)) ||
        (request.type === "prepare_question_routing" &&
          (typeof request.rawText !== "string" || request.rawText.length > 2_000))
      ) {
        dependencies.postMessage({
          id: Number.isSafeInteger(request?.id) ? request.id : 0,
          type: "error",
          code: "invalid_request",
          message: "调查请求格式无效。",
        });
        return;
      }
      try {
        await handle(request);
      } catch {
        dependencies.postMessage({
          id: request.id,
          type: "error",
          code: "runtime_failed",
          message: "调查操作未完成，请重新加载；未改写原存档。",
        });
      }
    });
    queue = next;
    return next;
  };
}
