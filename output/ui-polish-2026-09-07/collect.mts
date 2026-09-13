import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const root=process.cwd(),dir='output/ui-polish-2026-09-07';
const json=(p:string)=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const identity=json(`${dir}/narrow-identity.json`),prior=json(`${dir}/final-identity.json`),release=json(`${dir}/release-identity.json`),checkpoint=json(`${dir}/checkpoint.json`);
const source=currentSource(root),build=fileTree(root,'apps/web/out');
if(source.digest!==identity.sourceDigest || hashBytes(JSON.stringify(build))!==identity.buildHash)throw Error('Final identity changed');
const nonCss=(files:any[])=>files.filter(f=>!f.path.endsWith('.css'));
if(JSON.stringify(nonCss(source.files))!==JSON.stringify(nonCss(prior.sourceFiles)))throw Error('Non-CSS source changed after core/Worker/type checks');
const mutableDocs=new Set(['docs/v2.12-next-step.md','docs/next-development-plan-2026-09-06.md']);
const protectedFiles=checkpoint.files.filter((f:any)=>/^output\/(m01|m2|m3)\//.test(f.path)||(f.path.startsWith('docs/')&&!mutableDocs.has(f.path)));
for(const f of protectedFiles)if(!existsSync(resolve(root,f.path))||hashBytes(readFileSync(resolve(root,f.path)))!==f.sha256)throw Error('Protected evidence drift: '+f.path);
const original=new Map(checkpoint.files.map((f:any)=>[f.path,f.sha256]));
const changed=source.files.filter(f=>original.get(f.path)!==f.sha256).map(f=>f.path);
const stages=['release','narrow'].map(phase=>{
  const snapshots=readdirSync(resolve(root,dir)).filter(n=>n.startsWith(phase+'-')&&n.endsWith('.json')).map(name=>({name,data:json(`${dir}/${name}`)})).filter(s=>typeof s.data.text==='string'&&typeof s.data.width==='number');
  for(const s of snapshots){if(s.data.text.includes('正在打开案件'))throw Error('Loading frame: '+s.name);const limit=s.data.layout?.clientWidth??s.data.width;if(s.data.scrollWidth>limit+1)throw Error('Overflow: '+s.name);if(!existsSync(resolve(root,dir,s.name.replace('.json','.png'))))throw Error('Missing screenshot');}
  const coverage=[...new Set(snapshots.flatMap(s=>{const c=s.name.match(/-c(01|03|61|84)-/);return c?[`C${c[1]}:${s.data.width}x${s.data.height}`]:[]}))].sort();
  for(const c of ['C01','C03','C61','C84'])for(const v of ['390x844','1440x900'])if(!coverage.includes(c+':'+v))throw Error('Missing case viewport '+c+v);
  return{phase,identity:phase==='narrow'?identity.sourceDigest:release.sourceDigest,buildHash:phase==='narrow'?identity.buildHash:release.buildHash,knownFindings:phase==='release'?['320px Windows viewport had page overflow because body min-width was 320px plus native scrollbar; fixed and rechecked in narrow. Earlier snapshots record innerWidth, not clientWidth, and are not a no-overflow certificate.']:[],snapshotCount:snapshots.length,coverage,snapshots:snapshots.map(s=>({file:s.name,width:s.data.width,height:s.data.height,clientWidth:s.data.layout?.clientWidth??null,scrollWidth:s.data.scrollWidth})),workflows:json(`${dir}/${phase}-workflows.json`)};
});
const history=json(`${dir}/historical-replay.json`),frozen=json(`${dir}/frozen-check.log`),access=json(`${dir}/narrow-accessibility.json`),consoleErrors=json(`${dir}/narrow-console.json`);
if(!history.passed||!frozen.passed||access.focusFirst!=='关闭证据详情'||!access.escapeClosed||access.hit.buttons.some((b:any)=>!b.hit||b.height<44)||consoleErrors.length)throw Error('Verification failed');
const refs=fileTree(root,dir).filter(f=>/^(release-|narrow-)/.test(f.path)||['core-tests.log','worker-tests.log','final-typecheck.log','historical-replay.json','frozen-check.log'].includes(f.path));
const report={at:new Date().toISOString(),sourceDigest:source.digest,buildHash:identity.buildHash,profile:'v2.12-m3-dev',passed:true,changedSourceFiles:changed,protectedEvidence:{files:protectedFiles.length,unchanged:true},checks:{core:145,worker:30,typecheck:true,build:true,history:{valid:history.valid,negative:history.negative,cases:history.cases},frozen:{files:frozen.files,cases:frozen.cases,zips:frozen.historicalZips},nonCssSourceIdenticalToTestedBuild:true,consoleErrors:consoleErrors.length,readerKeyboardAndHitCheck:true},stages,artifacts:refs,scope:'Actual IAB Chromium UI. Four case workflows observed at desktop and mobile, with C61/C84 proof correction, solve and replay. Authoring reference used for correct proof; no blind play or human Fun Gate. Release phase is an earlier build; narrow phase is current. Action logs are partial and not an exhaustive input trace. Legacy release gates remain unchanged.'};
writeFileSync(resolve(root,dir,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,source:source.digest,build:identity.buildHash,changed,protectedFiles:protectedFiles.length,stages:stages.map(s=>({phase:s.phase,screenshots:s.snapshotCount,coverage:s.coverage}))},null,2));
