import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const root=process.cwd();
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const identity=read('output/m3/round4-identity.json');
assert.equal(identity.sourceDigest,'0c808e031a91c03f734ed2de4a57c307be3d63cb9c090d42d1d2dafabc8b6d7d');
assert.equal(identity.buildHash,'56217966354d2056aae9fa15b1962b6097a8868db07941f0c35ad2a3ecfdc709');
assert.equal(currentSource(root).digest,identity.sourceDigest,'Final source changed; rebuild and recapture UI, do not rebind earlier evidence');
assert.equal(hashBytes(JSON.stringify(fileTree(root,'apps/web/out'))),identity.buildHash,'Final build changed');
const checkpoint=read('output/m3/checkpoint.json');
const protectedFiles=checkpoint.files.filter((f:any)=>/^output\/(?:m01|m2)\//.test(f.path)||/^docs\/(?:m01|m2)-/.test(f.path));
for(const f of protectedFiles){assert.ok(existsSync(f.path),f.path);assert.equal(hashBytes(readFileSync(f.path)),f.sha256,f.path);}
const flows=read('output/m3/browser/final-r4/results.json');
assert.deepEqual(flows.map((f:any)=>f.flow).sort(),['c01-desktop','c01-mobile','c03-desktop','c03-mobile','c61-desktop','c61-mobile','c84-desktop','c84-mobile']);
assert.ok(flows.every((f:any)=>f.passed));
const uiFiles=fileTree(root,'output/m3/browser/final-r4');
const snapshots=uiFiles.filter(f=>f.path.endsWith('.json')&&!['actions.json','results.json'].includes(f.path)).map(f=>{
  const snapshot=read('output/m3/browser/final-r4/'+f.path);
  assert.ok(!snapshot.text.includes('正在打开案件'),f.path);
  const expected=f.path.includes('-desktop-')?{width:1440,height:900}:{width:390,height:844};
  assert.deepEqual(snapshot.viewport,expected,f.path);
  assert.ok(snapshot.scrollWidth<=snapshot.viewport.width+1,f.path+' horizontal overflow');
  assert.ok(uiFiles.some(s=>s.path===f.path.replace(/\.json$/,'.png')));
  return {path:f.path,viewport:snapshot.viewport,horizontalOverflow:false};
});
const core=readFileSync('output/m3/final-core-tests.log','utf8'),worker=readFileSync('output/m3/final-worker-tests.log','utf8');
assert.match(core,/pass 145/);assert.match(core,/fail 0/);assert.match(worker,/pass 30/);assert.match(worker,/fail 0/);
const historical=read('output/m3/historical-replay.json'),oldClient=read('output/m3/old-client.json'),language=read('output/m3/language-audit.json'),boundary=read('output/m3/temporal-boundary.json');
assert.equal(historical.passed,true);assert.equal(historical.valid,128);assert.equal(historical.negative,1);
assert.ok(oldClient.currentAccepted&&oldClient.oldRejected&&oldClient.originalUnchanged);assert.ok(boundary.passed);
const languageTotals=language.summary.reduce((a:any,s:any)=>({total:a.total+s.total,supported:a.supported+s.supported,correctDirect:a.correctDirect+s.correctDirect,wrongDirect:a.wrongDirect+s.wrongDirect}),{total:0,supported:0,correctDirect:0,wrongDirect:0});
assert.deepEqual(languageTotals,{total:160,supported:64,correctDirect:62,wrongDirect:0});
const frozen=read('output/m3/final-frozen-check.log');
assert.ok(frozen.passed&&frozen.checkOnly);assert.equal(frozen.cases,84);assert.equal(frozen.historicalZips,25);assert.equal(frozen.files,427);
for(const n of [1,2,3,4]){assert.ok(existsSync(`output/m3/round${n}-result.json`));assert.ok(existsSync(`output/m3/round${n}-identity.json`));}
const report={at:new Date().toISOString(),scope:'M3 four iterative implementations, focused four-case/two-viewport verification; not release or human fun acceptance',releaseProfile:'v2.12-m3-dev',publishable:false,
  identity:{sourceDigest:identity.sourceDigest,buildHash:identity.buildHash,head:identity.head,details:'round4-identity.json'},
  rounds:[1,2,3,4].map(n=>({round:n,identity:`round${n}-identity.json`,result:`round${n}-result.json`})),
  automated:{corePassed:145,workerPassed:30,newM3Worker:11,m01M2Worker:19,typecheck:'round4-typecheck.log',build:'round4-build.log',historical:{valid:128,negative:1,cases:84},oldClientFailClosed:true,language:languageTotals,temporalBoundaryChecks:24},
  preserved:{checkpoint:checkpoint.destination,files:protectedFiles.length,allSha256Match:true,details:protectedFiles},
  browser:{engine:'Codex in-app browser',flows,snapshots,artifacts:uiFiles,whiteBox:'C61/C84 correct structure referenced frozen authoring rules, then entered only through visible controls. No hidden browser state, storage, Worker injection or solved-save injection. C01/C03 are focused editing/recovery flows, not full solves.'},
  frozenGuard:{log:'final-frozen-check.log',canonicalCases:84,protectedFiles:427,historicalZIPs:25,passed:true,measuredAt:frozen.measuredAt},
  notRun:['Human blind play/fun evaluation','All six interaction families full UI completion','C01/C03 full solves on M3','Firefox/WebKit','Full keyboard/screen-reader audit','M3 full offline and archive-import matrix','Complete legacy v2.12 release gates','Deployment or distributable release'],
  next:['TS-015 C61/C84 versioned fair-content rewrite proposal','TS-013/014 remaining family-specific interaction and keyboard coverage','TS-018/019 failure recovery and full release-gate expansion']};
writeFileSync('output/m3/final-evidence.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceDigest:identity.sourceDigest,buildHash:identity.buildHash,flows:flows.length,screenshots:snapshots.length,preservedFiles:protectedFiles.length,passed:true}));
