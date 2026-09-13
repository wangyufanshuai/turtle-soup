import {readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {resolve, join, relative, dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('E:/xuexi/turtle-soup');
const output=join(root,'output/homepage-cinema-2026-09-07');
const dest=join(output,'source-before.json');
if(existsSync(dest)) throw new Error('Baseline already exists; do not overwrite');
function scan(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>['node_modules','.next','.generated','out','.git'].includes(e.name)?[]:e.isDirectory()?scan(join(dir,e.name)):[join(dir,e.name)]);}
const files=['apps','packages','content'].flatMap(d=>scan(join(root,d)));
const hashes=Object.fromEntries(files.map(f=>[relative(root,f).replaceAll('\\','/'),createHash('sha256').update(readFileSync(f)).digest('hex')]));
for(const file of ['apps/web/components/case-select.tsx','apps/web/components/case-select.module.css','apps/web/components/archive-tools.tsx']){const path=join(output,'source-before',file);mkdirSync(dirname(path),{recursive:true});copyFileSync(join(root,file),path);}
writeFileSync(dest,JSON.stringify({capturedAt:new Date().toISOString(),hashes},null,2));
console.log(JSON.stringify({files:files.length}));
