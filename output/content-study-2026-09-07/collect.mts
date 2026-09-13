import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const root=process.cwd(),dir='output/content-study-2026-09-07';
const read=(p:string)=>readFileSync(resolve(root,p),'utf8'),json=(p:string)=>JSON.parse(read(p));
const identity=json(`${dir}/delivery-identity.json`),start=json(`${dir}/start-identity.json`),checkpoint=json(`${dir}/checkpoint.json`),source=currentSource(root),build=fileTree(root,'apps/web/out');
if(source.digest!==identity.sourceDigest||hashBytes(JSON.stringify(build))!==identity.buildHash)throw Error('Delivery identity changed');
const sourceMap=new Map(source.files.map(f=>[f.path,f.sha256]));
for(const f of start.sourceFiles)if(sourceMap.get(f.path)!==f.sha256)throw Error('Original source changed: '+f.path);
const mutableDocs=new Set(['docs/v2.12-next-step.md','docs/next-development-plan-2026-09-06.md']);
const protectedFiles=checkpoint.files.filter((f:any)=>(f.path.startsWith('output/')||f.path.startsWith('docs/'))&&!mutableDocs.has(f.path));
for(const f of protectedFiles)if(!existsSync(resolve(root,f.path))||hashBytes(readFileSync(resolve(root,f.path)))!==f.sha256)throw Error('Original evidence changed: '+f.path);
const snapshots=readdirSync(resolve(root,dir)).filter(n=>n.startsWith('delivery-')&&n.endsWith('.json')).map(name=>({name,data:json(`${dir}/${name}`)})).filter(s=>typeof s.data.text==='string');
for(const s of snapshots){if(s.data.text.includes('正在打开独立试玩进度'))throw Error('Loading screenshot');if(s.data.scrollWidth>s.data.clientWidth+1)throw Error('Page overflow: '+s.name);if(!existsSync(resolve(root,dir,s.name.replace('.json','.png'))))throw Error('Missing image');}
for(const id of ['c61','c84'])for(const [w,h]of [[1440,900],[390,844]])if(!snapshots.some(s=>s.name.includes('-'+id+'-')&&s.data.width===w&&s.data.height===h))throw Error('Missing viewport '+id+w);
const core=read(`${dir}/core-tests.log`),tests=read(`${dir}/study-tests.log`),frozen=json(`${dir}/frozen-check.log`),errors=json(`${dir}/delivery-console.json`),focus=json(`${dir}/delivery-focus-check.json`),audit=json(`${dir}/content-audit.json`);
if(!core.includes('pass 145')||!core.includes('fail 0')||!tests.includes('pass 11')||!tests.includes('fail 0')||!frozen.passed||errors.length||focus.top< -1||focus.top>80)throw Error('A check failed');
for(const c of audit.cases){if(hashBytes(readFileSync(resolve(root,c.base.path)))!==c.base.sha256)throw Error('Frozen source mismatch');}
const originals=new Set(start.sourceFiles.map((f:any)=>f.path));
const report={at:new Date().toISOString(),passed:true,profile:'v2.12-m3-dev',sourceDigest:source.digest,buildHash:identity.buildHash,addedSourceFiles:source.files.filter(f=>!originals.has(f.path)).map(f=>f.path),originalSourceUnchanged:true,protectedEvidence:{unchanged:true,files:protectedFiles.length},checks:{core:145,study:11,finalBuildAndTypecheck:true,frozen:{files:frozen.files,cases:frozen.cases,zips:frozen.historicalZips},consoleErrors:errors.length,proofStartPosition:focus},scope:'Independent TS-015 material-study prototypes. Visible IAB Chromium controls; author-designed examples, not blind or human play. No original case certificate, migration or formal Fun Gate claim. Earlier preview/final builds retained as development history; only delivery screenshots belong to the current build.',workflows:json(`${dir}/delivery-workflows.json`),screenshots:snapshots.map(s=>({file:s.name,width:s.data.width,height:s.data.height,clientWidth:s.data.clientWidth,scrollWidth:s.data.scrollWidth})),artifacts:fileTree(root,dir).filter(f=>f.path!=='verification.json'&&!f.path.endsWith('.mts'))};
writeFileSync(resolve(root,dir,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,source:source.digest,build:identity.buildHash,added:report.addedSourceFiles,screenshots:snapshots.length,protectedEvidenceFiles:protectedFiles.length},null,2));
