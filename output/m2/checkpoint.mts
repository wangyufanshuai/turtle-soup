import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { currentSource, fileTree, hashBytes } from '../../tools/lib/v212-evidence.ts';
const root = process.cwd();
const destination = resolve(root, '../turtle-soup-snapshots/m2-start-2026-09-06');
const source = currentSource(root);
const files = [...source.files.filter(f => f.sha256 !== 'deleted'), ...fileTree(root, 'apps/web/out').map(f => ({path:`apps/web/out/${f.path}`,sha256:f.sha256})), ...fileTree(root, 'output/m01').map(f => ({path:`output/m01/${f.path}`,sha256:f.sha256})), ...fileTree(root, 'docs').map(f => ({path:`docs/${f.path}`,sha256:f.sha256}))];
for (const f of files) {
  const target=resolve(destination,f.path);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(resolve(root,f.path),target);
  if(hashBytes(readFileSync(target))!==f.sha256) throw new Error(`Copy mismatch: ${f.path}`);
}
const report={createdAt:new Date().toISOString(),destination,sourceDigest:source.digest,files,verified:true};
writeFileSync(resolve(destination,'checkpoint.json'),JSON.stringify(report,null,2));
writeFileSync(resolve(root,'output/m2/checkpoint.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({destination,sourceDigest:source.digest,files:files.length,verified:true}));
