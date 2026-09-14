import {readFile,readdir} from 'node:fs/promises';
import {LocalWorkspace} from '../server/local-workspace';
import {publicCandidate} from '../server/curation';
const db=new LocalWorkspace('.data/workspace.sqlite');
try{const saved=await db.list();for(const file of (await readdir('src/data/generated')).filter(f=>f.endsWith('.json'))){const curated=JSON.parse(await readFile('src/data/generated/'+file,'utf8'));const old=saved.find(a=>a.source.id===curated.source.id);if(!old)continue;let handoff;try{handoff=JSON.parse(await readFile('.data/handoffs/'+file,'utf8'))}catch{continue}const original=handoff.answer;
 if(JSON.stringify(old.source)===JSON.stringify(curated.source)&&JSON.stringify(old.artifact)===JSON.stringify(curated.artifact)){console.log('已是当前精选：'+old.source.id);continue}
 const originalArtifact=original.artifact?publicCandidate(original).artifact:undefined;
 if(old.workspace?.idea?.trim()||old.reference||JSON.stringify(old.source)!==JSON.stringify(original.source)||(old.artifact&&JSON.stringify(old.artifact)!==JSON.stringify(original.artifact)&&JSON.stringify(old.artifact)!==JSON.stringify(originalArtifact))){console.log('保留用户修改：'+old.source.id);continue}
 if(process.argv.includes('--apply')){const snapshot=await db.save(old,old.workspace!.revision,'before-curated-refresh');await db.save({...snapshot,artifact:curated.artifact,assets:curated.assets},snapshot.workspace!.revision,'curated-refresh')}
 console.log((process.argv.includes('--apply')?'已同步默认产物：':'可同步默认产物：')+old.source.id);
}}finally{db.close()}
