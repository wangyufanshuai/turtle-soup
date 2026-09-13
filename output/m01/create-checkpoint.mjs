import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd();
const destination = resolve(root, '..', 'turtle-soup-snapshots', 'm01-2026-09-06');
if (existsSync(destination)) throw new Error('Checkpoint already exists; never overwrite');
const paths = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,maxBuffer:64*1024*1024}).toString().split('\0').filter(Boolean);
function walk(dir) { if (!existsSync(resolve(root,dir))) return; for (const entry of readdirSync(resolve(root,dir),{withFileTypes:true})) { const p=dir+'/'+entry.name; if(entry.isDirectory()) walk(p); else paths.push(p); } }
walk('apps/web/out');
const files = [];
mkdirSync(destination,{recursive:true});
for (const p of [...new Set(paths)].sort()) {
  const source=resolve(root,p), target=resolve(destination,p);
  if (!source.startsWith(root+sep) || !target.startsWith(destination+sep)) throw new Error('Invalid checkpoint path');
  if (!existsSync(source)) { files.push({path:p,deleted:true}); continue; }
  cpSync(source,target,{recursive:false});
  const bytes=readFileSync(source), copied=readFileSync(target);
  const hash=x=>createHash('sha256').update(x).digest('hex');
  if(hash(bytes)!==hash(copied)) throw new Error('Copy mismatch: '+p);
  files.push({path:p,bytes:bytes.length,sha256:hash(bytes)});
}
const metadata={root,destination,createdAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),status:execFileSync('git',['status','--porcelain'],{cwd:root}).toString(),files};
writeFileSync(resolve(destination,'checkpoint-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
writeFileSync(resolve(root,'output/m01/checkpoint.json'),JSON.stringify({destination,files:files.length,bytes:files.reduce((s,f)=>s+(f.bytes??0),0),head:metadata.head},null,2)+'\n');
console.log(readFileSync(resolve(root,'output/m01/checkpoint.json'),'utf8'));
