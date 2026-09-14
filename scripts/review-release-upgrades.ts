import {readFile,writeFile,readdir} from 'node:fs/promises';
import {parse} from 'dotenv';
import {reviewCandidate} from './release-review';
const env=parse(await readFile('.dev.vars','utf8'));
for(const id of await readdir('artifacts/release-upgrades')){
 const dir='artifacts/release-upgrades/'+id;
 try{const a=JSON.parse(await readFile(dir+'/candidate.json','utf8'));const handoff=JSON.parse(await readFile('.data/handoffs/'+id+'.json','utf8'));const evidence=await reviewCandidate(a.source,a.artifact,handoff.answer.assets||[],env,dir);await writeFile(dir+'/evidence.json',JSON.stringify(evidence,null,2));await writeFile(dir+'/checks.json',JSON.stringify(evidence.checks,null,2));console.log(id+': '+evidence.content.verdict+' '+JSON.stringify(evidence.content.findings));}
 catch(e){await writeFile(dir+'/review-failure.json',JSON.stringify({error:String(e)}));console.log(id+': '+String(e))}
}
