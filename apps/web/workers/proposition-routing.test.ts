import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { applyPresentationPatch, applyQuestionAliasPack, createQuestionRoutingOffer, createRuntimeState, type CaseFile, type GameCommand, type SaveEnvelope } from '@turtle-soup/mystery-core';
import { selectPresentationPatches, selectHistoricalQuestionRoutingContexts } from '../../../tools/generate-content-registry.ts';
import { QUESTION_ALIAS_PACKS } from '../.generated/question-alias-registry.ts';
import { INVESTIGATION_REVISION, PROOF_REVISION, QUESTION_LANGUAGE_REVISION } from '../.generated/question-language-registry.ts';
import { createRuntimeWorkerHandler } from './runtime-handler.ts';
import type { RuntimeWorkerResponse } from '../lib/worker-protocol.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const id = 'c01-cold-room-knock';
const base = JSON.parse(readFileSync(`${root}/content/zh/cases/${id}.json`, 'utf8')) as CaseFile;
const c01 = applyQuestionAliasPack(applyPresentationPatch(base, selectPresentationPatches(root, 'v2.12-internal-rc', [id]).get(id)), QUESTION_ALIAS_PACKS[id]);
type Response = Extract<RuntimeWorkerResponse, { projection: unknown }>;

test('current v2.12 worker enables the complete sample investigation stack', () => {
  assert.equal(QUESTION_LANGUAGE_REVISION, 'm01');
  assert.equal(INVESTIGATION_REVISION, 'm2');
  assert.equal(PROOF_REVISION, 'm3');
});
async function worker(save?: SaveEnvelope, file:CaseFile=c01) {
  let sequence = 0;
  const responses: RuntimeWorkerResponse[] = [];
  const handler = createRuntimeWorkerHandler({questionLanguageRevision:'m01', loadCase: async () => file, historicalQuestionRoutingContexts: selectHistoricalQuestionRoutingContexts(root, 'v2.12-m01-dev', [file.id]), postMessage:r=>responses.push(r)});
  await handler({id:++sequence,type:'initialize',caseId:file.id,save});
  const initial = responses.at(-1) as Response;
  return { initial, async command(command:GameCommand) { await handler({id:++sequence,type:'command',command}); return responses.at(-1) as Response; } };
}

test('live F01 preserves occupancy rather than substituting the agent causing a sound', async () => {
  const w=await worker();
  const r=await w.command({type:'ask_text',rawText:'敲门时冷藏室里有人吗？'});
  assert.equal(r.accepted,true);
  assert.equal(r.projection.transcript[0]?.interpretedAs,'敲击发生时，冷藏室里是否有人？');
});

test('clarification, cancel, rewrite, undo, limited counting and forged resolution survive the actual Worker boundary', async () => {
  const w=await worker();
  const negative='冷藏室里没有人，对吗？';
  let r=await w.command({type:'ask_text',rawText:negative});
  assert.equal(r.accepted,false);
  assert.equal(r.projection.interpretation?.candidates.length,1);
  assert.match(r.projection.interpretation!.explanation!,/否定/u);
  assert.deepEqual((await worker(r.save)).initial.projection,r.projection);
  r=await w.command({type:'dismiss_interpretation',rawText:negative});
  assert.equal(r.projection.interpretation,undefined);
  assert.equal((await worker(r.save)).initial.projection.interpretation,undefined);
  assert.equal((await w.command({type:'confirm_proposition',rawText:negative,queryId:'query-person-inside',resolverRevision:'m01'})).accepted,false);
  await w.command({type:'ask_text',rawText:negative});
  r=await w.command({type:'ask_text',rawText:'冷藏室的温度是多少？'});
  assert.equal(r.projection.interpretation,undefined);
  assert.equal((await worker(r.save)).initial.projection.interpretation,undefined);
  await w.command({type:'ask_text',rawText:negative});
  r=await w.command({type:'confirm_interpretation',queryId:'query-person-inside',rawText:negative});
  assert.equal(r.save.commands.at(-1)?.type,'confirm_proposition');
  assert.equal(r.projection.transcript.length,1);
  assert.deepEqual((await worker(r.save)).initial.projection,r.projection);
  r=await w.command({type:'undo_last_question'});
  assert.equal(r.projection.transcript.length,0);
  assert.deepEqual((await worker(r.save)).initial.projection,r.projection);
  const forged=await w.command({type:'ask_proposition',rawText:'敲门时冷藏室里有人吗？',resolverRevision:'m01',queryId:'query-knock-source',candidateQueryIds:['query-knock-source']});
  assert.equal(forged.accepted,false);
  assert.equal(forged.projection.transcript.length,0);
  await w.command({type:'set_replay_mode',mode:'limited-questions'});
  for(let i=0;i<4;i++) {
    await w.command({type:'ask_text',rawText:negative});
    r=await w.command({type:'dismiss_interpretation',rawText:negative});
  }
  assert.equal(r.projection.transcript.length,0);
});

test('the place name 后台 is not classified as a changed time in a negative C03 question',async()=>{
  const raw=JSON.parse(readFileSync(`${root}/content/zh/cases/c03-second-shadow.json`,'utf8')) as CaseFile;
  const w=await worker(undefined,raw);
  const r=await w.command({type:'ask_text',rawText:'罗弈当时不在后台吗？'});
  assert.equal(r.accepted,false);
  assert.equal(r.projection.transcript.length,0);
  assert.equal(r.projection.interpretation?.candidates[0]?.queryId,'query-actor-present');
  assert.match(r.projection.interpretation?.explanation??'',/否定/u);
});

for(const caseId of ['c01-cold-room-knock','c03-second-shadow','c61-missing-tape-turn','c84-handoff-after-stop']) {
  const raw=JSON.parse(readFileSync(`${root}/content/zh/cases/${caseId}.json`,'utf8')) as CaseFile;
  const file=applyQuestionAliasPack(applyPresentationPatch(raw,selectPresentationPatches(root,'v2.12-internal-rc',[caseId]).get(caseId)),QUESTION_ALIAS_PACKS[caseId]);
  test(`${caseId}: starters are safe, canonical identities unchanged, old AI context replays but is not live authority`,async()=>{
    const w=await worker(undefined,file);
    assert.equal(w.initial.save.contentHash,raw.metadata?.canonicalHash);
    const starters=w.initial.projection.questionScaffolds.filter(c=>c.starterEligible);
    assert.equal(starters.length,2);
    assert.ok(starters.every(c=>c.label.endsWith('？')&&!c.label.includes('是否成立')));
    if(caseId===id) assert.ok(!JSON.stringify(w.initial.projection.questionScaffolds).includes('拖延检查'));
    const question='核对这条线索';
    const oldOffer=createQuestionRoutingOffer(file,createRuntimeState(file,'opaque'),question);
    const queryId=oldOffer.bindings.at(-1)!.queryId;
    const command:GameCommand={type:'ask_resolved_text',rawText:question,queryId,resolutionSource:'ai-confirmed',contextHash:oldOffer.context.contextHash};
    const save={...w.initial.save,commands:[...w.initial.save.commands,command]};
    const saved=JSON.stringify(save);
    assert.equal((await worker(save,file)).initial.restoreStatus,'restored');
    assert.equal(JSON.stringify(save),saved);
    assert.equal((await w.command(command)).accepted,false);
  });
}

test('relation neighbours, unsupported time and negation never silently choose the wrong proposition', async () => {
  for(const text of ['敲门前冷藏室里有人吗？','冷藏室里没有人，对吗？','门会自动锁住，而且里面有人吗？']) {
    const r=await (await worker()).command({type:'ask_text',rawText:text});
    assert.equal(r.accepted,false,text);
    assert.equal(r.projection.transcript.length,0,text);
  }
  for(const [text,expected] of [['敲击发生时，冷藏室里是否有人？','敲击发生时，冷藏室里是否有人？'],['敲门声是人敲的吗？','敲门声是人敲的吗？']]) {
    const r=await (await worker()).command({type:'ask_text',rawText:text});
    assert.equal(r.accepted,true,text);
    assert.equal(r.projection.transcript[0]?.interpretedAs,expected,text);
  }
});

test('new live routing has an explicit replay identity; old raw-text commands preserve their historical meaning', async () => {
  const w=await worker();
  const rawText='敲门时冷藏室里有人吗？';
  const oldSave:SaveEnvelope={...w.initial.save,commands:[{type:'start_case',initialDraftOrder:'opaque'},{type:'ask_text',rawText}]};
  const original=JSON.stringify(oldSave);
  const old=await worker(oldSave);
  assert.equal(old.initial.restoreStatus,'restored');
  assert.equal(old.initial.projection.transcript[0]?.interpretedAs,'敲门声是人敲的吗？');
  assert.equal(JSON.stringify(oldSave),original);
  const current=await w.command({type:'ask_text',rawText});
  assert.notEqual(current.save.commands.at(-1)?.type,'ask_text');
  const restored=await worker(current.save);
  assert.equal(restored.initial.restoreStatus,'restored');
  assert.deepEqual(restored.initial.projection,current.projection);
});
