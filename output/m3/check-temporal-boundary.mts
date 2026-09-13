import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createRuntimeWorkerHandler} from '../../apps/web/workers/runtime-handler.ts';
import type {CaseFile,GameCommand,SaveEnvelope} from '../../packages/mystery-core/src/index.ts';
const strict=(r:string)=>r==='precedes'||r==='sampled-before';
const cases=readdirSync('content/zh/cases').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync('content/zh/cases/'+f,'utf8')) as CaseFile);
const multiple=cases.filter(f=>(f.reasoningBoards??[]).filter(b=>b.allowedRelations.some(strict)).length>1);
assert.deepEqual(multiple.map(f=>f.id),['c33-early-late-arrival']);
const file=multiple[0];
async function worker(save?:SaveEnvelope){let response:any,id=0;const handler=createRuntimeWorkerHandler({proofRevision:'m3',investigationRevision:'m2',questionLanguageRevision:'m01',loadCase:async()=>file,postMessage:r=>{response=r;}});await handler({type:'initialize',id:++id,caseId:file.id,save});return {initial:response,async send(command:GameCommand){await handler({type:'command',id:++id,command});assert.ok('projection' in response);return response;}};}
const w=await worker();let r=w.initial;
for(const e of file.evidenceItems)r=await w.send({type:'set_evidence_state',evidenceId:e.id,state:'examined'});
const eventMap=new Map(file.events.map(e=>[e.id,r.projection.eventOptions.find((p:any)=>p.timeLabel===(e.time as {value:string}).value)!.id]));
const hypothesis=file.hypotheses.find(h=>h.id===file.solutionCertificate.canonicalHypothesisId)!;
const option=r.projection.theoryOptions.find((o:any)=>o.label===file.localization!['zh-CN'][hypothesis.labelKey]);assert.ok(option);
await w.send({type:'set_theory_hypothesis',theoryId:'theory-a',hypothesisId:option.id});
for(const event of file.events)await w.send({type:'upsert_theory_event',theoryId:'theory-a',eventId:eventMap.get(event.id) as string});
for(const e of file.evidenceItems)await w.send({type:'link_theory_evidence',theoryId:'theory-a',evidenceId:e.id,linked:true});
await w.send({type:'set_theory_motive',theoryId:'theory-a',motiveKey:option.motiveOptions[0].id});
for(const [i,obligation] of file.solutionCertificate.proofObligations!.entries()){
  const boardId=`board-0${i+1}`;
  for(const [j,p] of obligation.requiredPlacements!.entries())await w.send({type:'place_reasoning_item',boardId,slotId:`slot-0${j+1}`,itemId:eventMap.get(p.eventId) as string});
  for(const c of obligation.requiredConnections!)await w.send({type:'connect_reasoning_items',boardId,fromItemId:eventMap.get(c.fromEventId) as string,toItemId:eventMap.get(c.toEventId) as string,relation:c.relation});
}
const solved=await w.send({type:'submit_theory',theoryId:'theory-a'});assert.equal(solved.projection.solved,true,JSON.stringify(solved.events));
const results=[];
for(const [i,board] of file.reasoningBoards!.entries()){
  const relation=board.allowedRelations.find(strict);if(!relation)continue;
  // Both frozen certificates fully order the four occupied nodes. Enumerate every
  // possible additional strict edge; backwards edges must fail even with the full certificate.
  const items=solved.projection.reasoningBoards[i].slots.map((s:any)=>s.itemId);
  for(let from=0;from<items.length;from++)for(let to=0;to<items.length;to++){
    if(from===to)continue;
    const check=await worker(solved.save);await check.send({type:'select_theory',theoryId:'theory-a'});
    await check.send({type:'connect_reasoning_items',boardId:`board-0${i+1}`,fromItemId:items[from],toItemId:items[to],relation});
    const submit=await check.send({type:'submit_theory',theoryId:'theory-a'});
    assert.equal(submit.projection.solved,from<to,JSON.stringify({i,from,to,events:submit.events}));
    results.push({boardId:board.id,fromSlot:from+1,toSlot:to+1,solved:submit.projection.solved,passed:true});
  }
}
const report={at:new Date().toISOString(),passed:true,method:'White-box Worker boundary audit; no UI or independent puzzle-solving claim',casesScanned:cases.length,multipleTemporalBoards:multiple.map(f=>f.id),checks:results.length,results,
  conclusion:'No additional false win reproduced in the frozen corpus: C33 is the only multi-temporal-board case; both full certificates order their nodes in the same event order. Every possible backwards addition is rejected. Current cycle feedback checks one board at a time.',
  future:'Before adding partially ordered or new multi-temporal-board content, version and test union-graph contradictions; do not infer temporal edges from causal, overlap, buffering or provenance relations.'};
writeFileSync('output/m3/temporal-boundary.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:results.length}));
