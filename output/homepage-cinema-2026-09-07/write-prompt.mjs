import {readFileSync, writeFileSync} from 'node:fs';
const [id]=process.argv.slice(2);
const job=JSON.parse(readFileSync('output/homepage-cinema-2026-09-07/next-batch.json','utf8')).find(x=>x.id===id);
if(!job) throw new Error('unknown job');
writeFileSync('output/homepage-cinema-2026-09-07/current-prompt.txt',job.prompt,'utf8');
console.log(JSON.stringify({id,bytes:Buffer.byteLength(job.prompt)}));
