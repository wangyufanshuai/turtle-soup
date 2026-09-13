import type { CaseFile, GameEvent, LegacyGameCommand, ProofCommand, ProofOperation, ReasoningBoardDraft, RuntimeResult, RuntimeState, TheoryDraft, ProofFeedback } from './types.ts';
import {createStateFromProjection} from './engine.ts';

export const PROOF_OPERATION_TYPES = new Set<ProofOperation['type']>([
  'choose_explanation', 'clear_explanation', 'upsert_theory_event', 'remove_theory_event', 'move_theory_event',
  'link_theory_evidence', 'set_theory_motive', 'place_reasoning_item', 'remove_reasoning_item',
  'connect_reasoning_items', 'disconnect_reasoning_items',
]);
export function isProofOperation(command: LegacyGameCommand): command is ProofOperation {
  return PROOF_OPERATION_TYPES.has(command.type as ProofOperation['type']);
}
export function boardsFor(state: RuntimeState, id = state.activeTheoryId): Record<string, ReasoningBoardDraft> {
  return state.proofWorkspace?.boards[id] ?? state.reasoningBoards;
}

function normalizeAction(action: LegacyGameCommand): LegacyGameCommand {
  if (action.type === 'set_theory_hypothesis') return {...action,type:'choose_explanation',revision:'m2'};
  if (action.type === 'submit_theory') return {...action,type:'submit_investigation',revision:'m2'};
  if (action.type === 'start_case') return {type:'begin_investigation',revision:'m2'};
  return action;
}

interface Host {
  reduce: (file: CaseFile, state: RuntimeState, action: LegacyGameCommand) => RuntimeResult;
  project: (file: CaseFile, state: RuntimeState) => RuntimeResult['projection'];
  eventId: (file: CaseFile, id: string) => string | undefined;
  publicEventId: (file: CaseFile, id: string) => string;
  validProof: (file: CaseFile, state: RuntimeState) => boolean;
  feedback: (file: CaseFile, state: RuntimeState) => ProofFeedback;
  chapters: (file: CaseFile, state: RuntimeState) => string[];
}

// This boundary is used only by explicitly versioned commands, including during replay.
// Old logs retain the old shared board and multi-command semantics.
export function reduceProofCommand(file: CaseFile, original: RuntimeState, command: ProofCommand, host: Host): RuntimeResult {
  const reject = (message: string): RuntimeResult => ({state:original, projection:host.project(file,original), accepted:false, events:[{type:'command_rejected',message}]});
  if (command.revision !== 'm3') return reject('无法读取证明编辑版本。');
  const id = command.type !== 'proof_action' ? command.theoryId
    : 'theoryId' in command.action ? command.action.theoryId : original.activeTheoryId;
  if (!original.theoryDrafts.some(d => d.id === id)) return reject('未知的理论草稿。');
  const operations = (command.type === 'undo_proof_edit' ? [] : command.type === 'edit_proof' ? command.operations : [command.action]).map(normalizeAction);
  if (command.type === 'undo_proof_edit') {
    const history = original.proofWorkspace?.history?.[id] ?? [], snapshot = history.at(-1);
    if (!snapshot) return reject('这份假设还没有可以撤销的编辑。');
    const state = structuredClone(original), currentNote = state.theoryDrafts.find(d=>d.id===id)?.note;
    if (original.solved) state.proofWorkspace!.archive = archiveProof(file,original,host);
    state.theoryDrafts = state.theoryDrafts.map(d=>d.id===id ? {...structuredClone(snapshot.draft),note:currentNote} : d);
    state.explicitExplanationChoices = {...state.explicitExplanationChoices};
    if (snapshot.explicitChoice) state.explicitExplanationChoices[id]=true;
    else delete state.explicitExplanationChoices[id];
    state.proofWorkspace!.boards[id] = structuredClone(snapshot.boards);
    state.proofWorkspace!.history = {...state.proofWorkspace!.history,[id]:history.slice(0,-1)};
    state.reasoningBoards = state.proofWorkspace!.boards[state.activeTheoryId];
    state.solved=false;state.replayBeatIds=[];state.acceptedCommandCount++;
    const feedback=state.proofWorkspace!.feedback?.[id];
    if(feedback)state.proofWorkspace!.feedback={...state.proofWorkspace!.feedback,[id]:{...feedback,stale:true}};
    repairEvidenceStates(state);
    return {state,projection:host.project(file,state),events:[{type:'theory_updated',theoryId:id}],accepted:true};
  }
  if (!operations.length || operations.length > 32 || (command.type === 'edit_proof' && operations.some(op => !isProofOperation(op)
    || ('theoryId' in op && op.theoryId !== id)))) return reject('这组编辑无法作为同一份草稿提交。');
  let state = structuredClone(original);
  state.proofWorkspace ??= {revision:'m3',boards:{'theory-a':structuredClone(state.reasoningBoards),'theory-b':structuredClone(state.reasoningBoards)}};
  state.reasoningBoards = structuredClone(boardsFor(state,id));
  const beforeEdit = {draft:structuredClone(state.theoryDrafts.find(d=>d.id===id)!),boards:structuredClone(state.reasoningBoards),
    explicitChoice:state.explicitExplanationChoices?.[id]};
  const editsProof = operations.some(isProofOperation);
  if (original.solved && (editsProof || operations.some(op=>op.type==='select_theory' || op.type==='undo_last_question'))) {
    state.proofWorkspace.archive = archiveProof(file,original,host);
  }
  const events: GameEvent[] = [];
  for (let action of operations) {
    if (action.type === 'set_theory_hypothesis') action = {...action,type:'choose_explanation',revision:'m2'};
    if (action.type === 'submit_theory') action = {...action,type:'submit_investigation',revision:'m2'};
    if (action.type === 'start_case') action = {type:'begin_investigation',revision:'m2'};
    if (action.type === 'connect_reasoning_items' && host.eventId(file,action.fromItemId) === host.eventId(file,action.toItemId)) return reject('一个事件不能连接到它自己。');
    if (action.type === 'request_proof_replay' && (!host.validProof(file,state) || timeCycleBoard(state.reasoningBoards))) return reject('当前结构已经变化，请重新提交检验。此前的结案记录仍保留。');
    const beforeRemoval = action.type === 'remove_reasoning_item' ? state.reasoningBoards[action.boardId]?.connections : undefined;
    let result:RuntimeResult;
    if (action.type === 'place_reasoning_item') {
      // Slot acceptance in frozen cases often contains exactly the hidden answer.
      // New drafts may arrange any public event; correctness stays in the certificate.
      const board=host.project(file,state).reasoningBoards.find(b=>b.id===action.boardId);
      const itemId=host.publicEventId(file,host.eventId(file,action.itemId) ?? '');
      if (!board?.slots.some(s=>s.id===action.slotId) || !board.items.some(e=>e.id===itemId)) return reject('只能把公开事件放入当前推理板的位置。');
      const current=state.reasoningBoards[action.boardId] ?? {placements:{},connections:[]};
      const placements=Object.fromEntries(Object.entries(current.placements).filter(([,item])=>item!==itemId));
      placements[action.slotId]=itemId;
      const next={...state,acceptedCommandCount:state.acceptedCommandCount+1,reasoningBoards:{...state.reasoningBoards,[action.boardId]:{...current,placements}}};
      result={state:next,projection:host.project(file,next),accepted:true,events:[{type:'reasoning_board_updated',boardId:action.boardId}]};
    } else result = host.reduce(file,state,action);
    if (!result.accepted && !result.events.some(e => e.type === 'interpretation_required' || e.type === 'interpretation_dismissed')) {
      return {...reject('这组编辑没有完成，已保留编辑前的结构。'),events:result.events};
    }
    state = result.state;
    events.push(...result.events);
    if (action.type === 'submit_investigation') {
      const cycleBoard = timeCycleBoard(state.reasoningBoards);
      if (cycleBoard) {
        state.solved=false;
        events.splice(0,events.length,{type:'theory_judged',judgement:'unfounded',message:'先后关系形成了循环：一个事件经过连接又先于它自己。请检查这张板的方向。',proofFailureCategory:'time'});
      }
      state.proofWorkspace!.feedback={...state.proofWorkspace!.feedback,[id]:state.solved ? undefined : cycleBoard
        ? {message:'先后关系形成了循环。沿着已连好的先后关系检查方向，保留有材料支持的连接。',nextStep:'board',boardId:cycleBoard,stale:false}
        : host.feedback(file,{...state,activeTheoryId:id,proofWorkspace:{...state.proofWorkspace!,boards:{...state.proofWorkspace!.boards,[id]:state.reasoningBoards}}})};
    }
    if (action.type === 'undo_last_question') {
      // A question undo removes that answer's authority, not later material inspections.
      state.game = createStateFromProjection(file,{discoveredEvidenceIds:original.game.discoveredEvidenceIds,
        visitedLocationIds:original.game.visitedLocationIds,answeredQueryIds:state.game.answeredQueryIds});
      const available=new Set(host.project(file,state).eventOptions.map(e=>e.id));
      if (state.theoryDrafts.some(d=>d.eventIds.some(e=>!available.has(host.publicEventId(file,e))))) return reject('这条回答仍支持证明里的事件。先在事件链撤下相关片段，再撤销回答；你的原稿与材料仍保留。');
      state.solved=false;state.replayBeatIds=[];
    }
    if (action.type === 'remove_reasoning_item' && beforeRemoval) state.reasoningBoards[action.boardId].connections=beforeRemoval;
    if (action.type === 'select_theory') {state.solved=false;state.replayBeatIds=[];}
    if (action.type === 'place_reasoning_item') {
      const eventId = host.eventId(file,action.itemId)!;
      state.theoryDrafts = state.theoryDrafts.map(d => d.id === id && !d.eventIds.includes(eventId) ? {...d,eventIds:[...d.eventIds,eventId]} : d);
    }
    if (action.type === 'remove_theory_event') {
      const itemId = host.publicEventId(file,host.eventId(file,action.eventId)!);
      state.reasoningBoards = Object.fromEntries(Object.entries(state.reasoningBoards).map(([key,board]) => [key,
        {...board,placements:Object.fromEntries(Object.entries(board.placements).filter(([,item]) => item !== itemId))}]));
    }
  }
  // Prune only after the whole transaction: swaps retain relations between surviving nodes.
  state.reasoningBoards = Object.fromEntries(Object.entries(state.reasoningBoards).map(([key,board]) => {
    const placed = new Set(Object.values(board.placements));
    return [key,{...board,connections:board.connections.filter(c => placed.has(c.fromItemId) && placed.has(c.toItemId))}];
  }));
  state.proofWorkspace ??= {revision:'m3',boards:{'theory-a':structuredClone(state.reasoningBoards),'theory-b':structuredClone(state.reasoningBoards)}};
  state.proofWorkspace = {...state.proofWorkspace,boards:{...state.proofWorkspace.boards,[id]:state.reasoningBoards}};
  if (editsProof) {
    const history = original.proofWorkspace?.history?.[id] ?? [];
    state.proofWorkspace.history = {...state.proofWorkspace.history,[id]:[...history,beforeEdit].slice(-30)};
    state.solved=false;state.replayBeatIds=[];
    const feedback=state.proofWorkspace.feedback?.[id];
    if (feedback) state.proofWorkspace.feedback={...state.proofWorkspace.feedback,[id]:{...feedback,stale:true}};
  }
  state.reasoningBoards = state.proofWorkspace.boards[state.activeTheoryId];
  state.unlockedChapterIds=host.chapters(file,state);
  if (JSON.stringify(original.game)!==JSON.stringify(state.game) && state.proofWorkspace.feedback) {
    state.proofWorkspace.feedback=Object.fromEntries(Object.entries(state.proofWorkspace.feedback).map(([key,value])=>[key,value?{...value,stale:true}:value]));
  }
  repairEvidenceStates(state);
  if (command.type === 'edit_proof') state.acceptedCommandCount = original.acceptedCommandCount + 1;
  return {state,projection:host.project(file,state),events,accepted:!events.some(e => e.type === 'interpretation_required' || e.type === 'question_rejected')};
}

function repairEvidenceStates(state: RuntimeState) {
  const linked = new Set(state.theoryDrafts.flatMap(d=>d.evidenceIds));
  for (const [id,value] of Object.entries(state.evidenceStates)) {
    if (linked.has(id) && value !== 'verified') state.evidenceStates[id]='connected';
    else if (!linked.has(id) && value === 'connected') state.evidenceStates[id]='examined';
  }
}

function archiveProof(file: CaseFile, state: RuntimeState, host: Host) {
  const verified = host.reduce(file,{...state,reasoningBoards:boardsFor(state)}, {type:'request_proof_replay'}).projection;
  return {theory:structuredClone(verified.theoryDrafts.find(d=>d.id===state.activeTheoryId)!),replay:verified.replay,debrief:verified.debrief};
}

/** A public structural contradiction, independent of the authored solution. */
export function timeCycleBoard(boards:Record<string,ReasoningBoardDraft>):string|undefined {
  for (const [id,board] of Object.entries(boards)) {
    const edges=board.connections.filter(c=>c.relation==='precedes' || c.relation==='sampled-before');
    const visiting=new Set<string>(),done=new Set<string>();
    const visit=(node:string):boolean=>{
      if(visiting.has(node))return true;if(done.has(node))return false;
      visiting.add(node);
      if(edges.some(c=>c.fromItemId===node && visit(c.toItemId)))return true;
      visiting.delete(node);done.add(node);return false;
    };
    if(edges.some(c=>visit(c.fromItemId)))return id;
  }
  return undefined;
}
