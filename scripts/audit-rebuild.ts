import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {StudioStore} from '../studio/store';
import {publicCandidate} from '../server/curation';
import type {StudioAnswer} from '../studio/types';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const db=new StudioStore('.data/studio.sqlite');
try{
 const records=await db.list() as StudioAnswer[],articles=[];
 for(const file of (await readdir('src/data/generated')).filter(f=>f.endsWith('.json'))){
  const item=JSON.parse(await readFile('src/data/generated/'+file,'utf8'));
  const record=records.find(a=>a.source.id===item.source.id)!;
  assert.ok(record);assert.equal(record.studio.status,'accepted');
  assert.equal(hash(record.source),hash(item.source));assert.equal(hash(publicCandidate(record).artifact),hash(item.artifact));
  const evidence=JSON.parse(await readFile('artifacts/reviews/'+item.artifact.provenance.runId+'.json','utf8'));
  assert.equal(evidence.artifactHash,hash(item.artifact));assert.equal(item.artifact.provenance.sourceHash,hash(item.source));
  assert.deepEqual([...new Set(evidence.results.map((r:any)=>r.width))].sort(),[360,740]);
  let changes=0,removed=0,notesChecked=0;
  try{for(const snapshot of await readdir('.data/cleaning/'+item.source.id)){
   const saved=JSON.parse(await readFile('.data/cleaning/'+item.source.id+'/'+snapshot,'utf8'));
   changes+=saved.diff.changes.length;removed+=saved.diff.changes.filter((c:any)=>!c.after.length).length;
   for(const note of saved.before.studio.notes){assert.ok(record.studio.notes.some(n=>n.id===note.id&&n.text===note.text),'missing note '+note.id);notesChecked++}
  }}catch(e:any){if(e.code!=='ENOENT')throw e}
  articles.push({id:item.source.id,title:item.source.title,runId:item.artifact.provenance.runId,revision:record.workspace?.revision,blocks:item.artifact.blocks.length,images:item.assets?.length||0,checks:evidence.results.length,cleaningChanges:changes,removedParagraphs:removed,notesChecked,historyVersions:(await db.versions(item.source.id)).length,review:evidence.review});
 }
 assert.equal(articles.length,17);
 const result={checkedAt:new Date().toISOString(),totals:{articles:articles.length,blocks:articles.reduce((n,a)=>n+a.blocks,0),images:articles.reduce((n,a)=>n+a.images,0),operationResults:articles.reduce((n,a)=>n+a.checks,0),removedParagraphs:articles.reduce((n,a)=>n+a.removedParagraphs,0)},articles};
 await writeFile('artifacts/reviews/rebuild/final-manifest.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result.totals));
}finally{db.close()}
