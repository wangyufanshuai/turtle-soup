import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { currentSource, fileTree } from '../../tools/lib/v212-evidence.ts';
import { propositionPolicy, type CaseFile } from '../../packages/mystery-core/src/index.ts';
import { validateSaveEnvelope as oldValidate } from '../v212/legacy-runtime-2967346/packages/mystery-core/src/save-envelope.ts';
const root=process.cwd();
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const source=currentSource(root);
const build=fileTree(root,'apps/web/out');
const browser=fileTree(root,'output/m01/browser-final');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const flows=[];
for(const code of ['c01','c03','c61','c84'])for(const viewport of ['desktop','mobile']) {
  const label=`${code}-${viewport}`;
  for(const [step,count,pending] of [['direct',1,false],['clarify',1,true],['cancel-restored',1,false],['rewrite',1,false],['confirmed',2,false],['undo',1,false],['restored',1,false]] as const) {
    const state=read(`output/m01/browser-final/${label}-${step}.json`);
    assert.ok(state.text.includes(`${count} 次有效提问`),label+step);
    assert.equal(Boolean(state.confirmations),pending,label+step);
    assert.equal(state.width,viewport==='desktop'?1440:390);
    assert.equal(state.height,viewport==='desktop'?900:844);
    assert.ok(state.scrollWidth<=state.clientWidth);
  }
  const opening=`${label}-${label==='c03-desktop'?'starters':'opening'}`;
  const initial=read(`output/m01/browser-final/${opening}.json`);
  assert.ok(initial.text.includes('0 次有效提问')&&initial.text.includes('先验证一个公开前提'));
  assert.equal(Boolean(initial.confirmations),false);
  flows.push({case:code,viewport,passed:true,scope:'Question and recovery UI only; not a solved playthrough',opening:`${opening}.png`,clarification:`${label}-clarify.png`,restored:`${label}-restored.png`});
}
const oldProbe={schemaVersion:1,caseId:'c01-cold-room-knock',caseVersion:1,contentHash:'sha256:c01-cold-room-knock-v1',updatedAt:new Date().toISOString(),commands:[{type:'ask_proposition',rawText:'敲门时冷藏室里有人吗？',resolverRevision:'m01',queryId:'query-person-inside',candidateQueryIds:['query-person-inside']}]};
const original=JSON.stringify(oldProbe);const oldResult=oldValidate(oldProbe);assert.equal(oldResult.ok,false);assert.equal(JSON.stringify(oldProbe),original);
const references=['c01-cold-room-knock','c03-second-shadow','c61-missing-tape-turn','c84-handoff-after-stop'].map(id=>{
  const bytes=readFileSync(`content/zh/cases/${id}.json`),file=JSON.parse(bytes.toString('utf8')) as CaseFile;
  return {id,canonicalHash:file.metadata?.canonicalHash,fileSha256:hash(bytes),queries:propositionPolicy(file)!.map(p=>{
    const query=file.questionSemantics.find(q=>q.id===p.id)!;assert.ok(query);
    return {queryId:p.id,label:p.label,openingStarter:Boolean(p.starter),predicate:query.predicate,supportingFactIds:query.supportingFactIds??[],evidenceIds:(file.evidenceItems??[]).filter(e=>e.sourceFactIds?.some(f=>query.supportingFactIds?.includes(f))).map(e=>e.id)};
  })};
});
writeFileSync('output/m01/source-references.json',JSON.stringify(references,null,2)+'\n');
const report={createdAt:new Date().toISOString(),profile:'v2.12-m01-dev',head:source.head,sourceDigest:source.digest,
  buildHash:hash(JSON.stringify(build)),buildFileCount:build.length,buildBytes:build.reduce((sum,f)=>sum+f.bytes,0),
  sourceFiles:source.files,builtFiles:build,browserArtifacts:browser,flows,oldClientProbe:{version:'pinned v2.11 validator',rejected:true,inputUnchanged:true},
  notRun:['Firefox/WebKit UI','full solved UI flows','ZIP creation/execution','real mobile keyboard/device','screen reader/complete accessibility audit','human fun evaluation','live AI service UI fault matrix']};
writeFileSync('output/m01/final-evidence.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sourceDigest:report.sourceDigest,buildHash:report.buildHash,buildFiles:build.length,browserFlows:flows.length,browserArtifacts:browser.length,oldClientProbe:report.oldClientProbe},null,2));
