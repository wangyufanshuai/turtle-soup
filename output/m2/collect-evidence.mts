import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const root=process.cwd(),source=currentSource(root),builtFiles=fileTree(root,'apps/web/out');
// This collector closes the observed run; it must not bless old screenshots for a later build.
assert.equal(source.digest,'a2e4977d827757d11a61a5d3f7205ff8a716dc549ad55b84b2eee016cf7c7635','Source changed: obtain new UI evidence');
assert.equal(hashBytes(JSON.stringify(builtFiles)),'88dcd331e2376921fdb49ef220fd4d8f2766490aed2f211063f7a9725fb033fc','Build changed: obtain new UI evidence');
const precache=JSON.parse(readFileSync('output/m2/precache.json','utf8'));
assert.equal(precache.releaseProfile,'v2.12-m2-dev');
assert.ok(readFileSync('apps/web/out/sw.js','utf8').includes('black-soup-v2-12-m2-dev'));
const index=JSON.parse(readFileSync('output/m2/browser/index.json','utf8')) as Array<{name:string;width:number;url:string;overflow:boolean;checks:string[]}>;
const stages=['initial','draft-restored','answer','source','source-restored','return','comparison','choice-restored','choice-cleared','alternate','undo','finish'];
const browserFlows=['c01','c03','c61','c84'].flatMap(code=>['desktop','mobile'].map(size=>{
  const prefix=`final-${code}-${size}-`, expectedWidth=size==='desktop'?1440:390,expectedHeight=size==='desktop'?900:844;
  for(const stage of stages) {
    const record=index.find(r=>r.name===prefix+stage);assert.ok(record,`${prefix}${stage}`);
    assert.equal(record.width,expectedWidth);assert.equal(record.overflow,false);
    const dom=JSON.parse(readFileSync(`output/m2/browser/${prefix}${stage}.json`,'utf8'));
    assert.equal(dom.height,expectedHeight);assert.ok(dom.scrollWidth<=dom.clientWidth);
    assert.ok(dom.url.includes(size==='desktop'?':8111/':':8112/'));
  }
  return {case:code,engine:'IAB Chromium',viewport:{width:expectedWidth,height:expectedHeight},passed:true,
    scope:'M2 UI verbs: notes, explicit choice/clear, answer-to-evidence in two clicks, evidence linking, reload, return focus and question undo. Not a complete solve.',stages:stages.map(s=>prefix+s)};
}));
const reports=['core-tests.log','m2-tests.log','typecheck.log','build.log','historical-replay.json','old-client.json','language-audit.json','frozen-check.log','precache.json','server-cleanup.json'];
assert.match(readFileSync('output/m2/core-tests.log','utf8'),/pass 145/u);
assert.match(readFileSync('output/m2/core-tests.log','utf8'),/fail 0/u);
assert.match(readFileSync('output/m2/m2-tests.log','utf8'),/pass 19/u);
assert.match(readFileSync('output/m2/m2-tests.log','utf8'),/fail 0/u);
assert.ok(!readFileSync('output/m2/typecheck.log','utf8').includes('error TS'));
const history=JSON.parse(readFileSync('output/m2/historical-replay.json','utf8'));
assert.equal(history.passed,true);assert.equal(history.valid,128);assert.equal(history.negative,1);
assert.equal(JSON.parse(readFileSync('output/m2/old-client.json','utf8')).oldRejected,true);
assert.ok(JSON.parse(readFileSync('output/m2/language-audit.json','utf8')).summary.every((r:{wrongDirect:number})=>r.wrongDirect===0));
assert.match(readFileSync('output/m2/frozen-check.log','utf8'),/"passed": true/u);
const m01=JSON.parse(readFileSync('../turtle-soup-snapshots/m2-start-2026-09-06/checkpoint.json','utf8'));
const oldEvidence=m01.files.filter((f:{path:string})=>f.path.startsWith('output/m01/'));
for(const f of oldEvidence)assert.equal(hashBytes(readFileSync(f.path)),f.sha256,`M01 evidence changed: ${f.path}`);
const report={createdAt:new Date().toISOString(),profile:'v2.12-m2-dev',publishable:false,humanEvaluation:'pending',
  checkpoint:'E:/xuexi/turtle-soup-snapshots/m2-start-2026-09-06/checkpoint.json',currentSource:source,buildHash:hashBytes(JSON.stringify(builtFiles)),builtFiles,
  results:{coreTests:145,m2WorkerTests:10,m01WorkerTests:9,languageInputs:160,languageWrongDirect:0,historicalValid:128,historicalNegative:1,historicalCases:84,frozenFiles:427,historicalZips:25},
  browserFlows,browserEvidence:fileTree(root,'output/m2/browser'),
  reports:reports.map(path=>({path:`output/m2/${path}`,sha256:hashBytes(readFileSync(`output/m2/${path}`))})),
  priorM01EvidencePreserved:{files:oldEvidence.length,byteVerified:true},
  notRun:['Human fun evaluation','Full 84-case and six-family solution/replay matrix','Firefox/WebKit','Real mobile OS keyboard/IME and safe area','Screen-reader and full accessibility audit','Live AI outage matrix','Independent ZIP installation','Exact nonzero evidence-scroll offset restoration'],
  evidenceNotes:['Names beginning final- belong to the current build, served from 8111/8112. Earlier c01-* screenshots on 8110 are exploratory and not final evidence.','bug-mobile-evidence-layer is a diagnostic capture; current hit testing and an actual footer click did not reproduce an overlay obstruction.','Some immediate reload captures contain a transition frame; final-c84-mobile-selected-detail and manual settled captures provide representative visual review.','DOM captures contain public rendered UI/form values; no browser storage, Worker injection, author truth, or saved fixture was used in the browser.'],subagents:0};
writeFileSync('output/m2/final-evidence.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceDigest:source.digest,buildHash:report.buildHash,builtFiles:builtFiles.length,browserFlows:browserFlows.length,browserFiles:report.browserEvidence.length,priorM01EvidencePreserved:report.priorM01EvidencePreserved}));
