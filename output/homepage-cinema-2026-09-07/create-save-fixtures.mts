import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { serializeSaveArchive, readSaveArchive } from '../../apps/web/lib/archive-io.ts';
import { CASE_SAVE_IDENTITIES } from '../../apps/web/.generated/public-catalog.ts';
const dir='output/homepage-cinema-2026-09-07/save-fixtures';mkdirSync(dir,{recursive:true});
const base='output/v212/historical-save-oracle-preflight/old-generated/fixtures/c01-cold-room-knock/';
for(const [state,file] of [['partial','partial-question'],['closed','solved-before-replay']]){
 const save=JSON.parse(readFileSync(base+file+'.save.json','utf8'));
 const serialized=serializeSaveArchive([save]);
 const result=await readSaveArchive(new File([serialized],state+'.json'),CASE_SAVE_IDENTITIES);
 if(!result.ok) throw Error(result.reason);
 writeFileSync(dir+'/'+state+'.json',serialized);
 console.log(JSON.stringify({state,completed:save.completed,commands:save.commands.length,validated:result.ok}));
}
writeFileSync(dir+'/invalid.json','{"invalid":true}');
