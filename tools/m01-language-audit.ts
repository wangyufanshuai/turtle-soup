import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolvePropositionM01, type CaseFile } from '../packages/mystery-core/src/index.ts';

const names:Record<string,string>={c01:'c01-cold-room-knock',c03:'c03-second-shadow',c61:'c61-missing-tape-turn',c84:'c84-handoff-after-stop'};
const bytes=readFileSync('content/zh/question-language/m01/holdout.tsv');
const cases=Object.fromEntries(Object.entries(names).map(([code,id])=>[code,JSON.parse(readFileSync(`content/zh/cases/${id}.json`,'utf8')) as CaseFile]));
const rows=bytes.toString('utf8').trim().split(/\r?\n/u).slice(1).map(line=>{
  const [code,query,kind,text]=line.split('\t');
  const file=cases[code];
  assert.ok(file,code);
  const semantic=query==='-'?undefined:file.questionSemantics.find(q=>q.id===query);
  assert.ok(query==='-'||semantic,query);
  const resolution=resolvePropositionM01(file,text);
  return {code,text,kind,expectedQuery:query==='-'?null:query,actual:resolution,
    supportingFactIds:semantic?.supportingFactIds??[],
    wrongDirect:resolution.status==='matched'&&resolution.queryId!==query,
    correctDirect:resolution.status==='matched'&&resolution.queryId===query};
});
const summary=Object.keys(names).map(code=>{
  const subset=rows.filter(row=>row.code===code);
  const supported=subset.filter(row=>row.expectedQuery!==null).length;
  const correct=subset.filter(row=>row.correctDirect).length;
  const wrong=subset.filter(row=>row.wrongDirect).length;
  const direct=correct+wrong;
  return {code,total:subset.length,supported,correctDirect:correct,wrongDirect:wrong,
    ambiguous:subset.filter(r=>r.actual.status==='ambiguous').length,
    unrecognized:subset.filter(r=>r.actual.status==='unrecognized').length,
    directPrecision:direct?correct/direct:null,supportedCoverage:correct/supported};
});
const report={createdAt:new Date().toISOString(),revision:'m01',corpusSha256:createHash('sha256').update(bytes).digest('hex'),
  provenance:'Main-agent authored source-grounded holdout, separate from runtime rules and legacy generated corpora. Not human language or fun evidence. Record-verifiability paraphrases do not establish quantitative or causal coverage.',summary,rows};
const destination=process.argv.includes('--m2')?'output/m2':'output/m01';
mkdirSync(destination,{recursive:true});
writeFileSync(`${destination}/language-audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
for(const entry of summary) {
  assert.ok(entry.total>=40,`${entry.code}: at least 40 inputs`);
  assert.equal(entry.wrongDirect,0,`${entry.code}: no wrong direct proposition`);
  assert.ok(entry.supportedCoverage>=0.9,`${entry.code}: supported coverage >= 90%`);
}
