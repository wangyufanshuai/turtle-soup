import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyPresentationPatch, applyQuestionAliasPack, createQuestionRoutingReplayContext } from '../../packages/mystery-core/src/index.ts';
import { selectPresentationPatches, selectHistoricalQuestionRoutingContexts } from '../../tools/generate-content-registry.ts';
import { QUESTION_ALIAS_PACKS } from '../../apps/web/.generated/question-alias-registry.ts';
const ids=['c01-cold-room-knock','c03-second-shadow','c61-missing-tape-turn','c84-handoff-after-stop'];
const root=process.cwd();
const patches=selectPresentationPatches(root,'v2.12-internal-rc',ids);
const contexts=selectHistoricalQuestionRoutingContexts(root,'v2.12-internal-rc',ids);
for (const id of ids) {
  const base=JSON.parse(readFileSync(`content/zh/cases/${id}.json`,'utf8'));
  const c=applyQuestionAliasPack(applyPresentationPatch(base,patches.get(id)),QUESTION_ALIAS_PACKS[id]);
  const context={...createQuestionRoutingReplayContext(c,'v2.11-internal-rc'),sourceProfile:'v2.12-internal-rc'};
  contexts[id]=[...(contexts[id]??[]),context] as typeof contexts[string];
}
mkdirSync('content/zh/question-language/m01',{recursive:true});
const bytes=JSON.stringify(contexts,null,2)+'\n';
writeFileSync('content/zh/question-language/m01/historical-routing.json',bytes);
console.log(createHash('sha256').update(bytes).digest('hex'));
