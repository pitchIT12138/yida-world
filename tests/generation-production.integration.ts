// Explicit real provider check, using administrator quota; never publishes the candidate.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {validateArtifact} from '../src/lib/validation';
const env={...parse(await readFile('.dev.vars','utf8')),...process.env};
const base=env.RELEASE_URL?.replace(/\/$/,'');if(!base||!env.RUNNER_TOKEN)throw Error('Missing release test configuration');
const answer=JSON.parse(await readFile('src/data/generated/birthday.json','utf8'));
const input={source:answer.source,selectedParagraphIds:[answer.source.paragraphs[0].id],instruction:'只为所选段落生成一个可运行的交互块：改变人数，比较至少两人生日相同与至少一人和指定生日相同的概率。假设一年365天、独立均匀分布，清楚标明。用于私有生成链路验收，不公开上架。',tier:'balanced'};
const id=crypto.randomUUID(),headers={Authorization:'Bearer '+env.RUNNER_TOKEN},started=Date.now(),evidence:any={runId:id,base,provider:'real configured production model',public:false,events:[],polls:[]};
const deadline=AbortSignal.timeout(360000);let terminal:any,polling=false;
const poll=async()=>{if(polling)return;polling=true;try{const r=await fetch(base+'/api/generation/'+id+'?requestId='+id,{headers,signal:AbortSignal.any([deadline,AbortSignal.timeout(10000)])});const data=await r.json();evidence.polls.push({atMs:Date.now()-started,status:r.status,type:data.event?.type,stage:data.event?.stage});if(r.ok&&data.event?.type==='result')evidence.polledResult=true;}catch{evidence.polls.push({atMs:Date.now()-started,networkError:true})}finally{polling=false}};
const timer=setInterval(()=>void poll(),5000);
try{
 const r=await fetch(base+'/api/generate',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Generation-Request':id},body:JSON.stringify(input),signal:deadline});
 assert.equal(r.status,200);assert.equal(r.headers.get('x-generation-run-id'),id);evidence.headersMs=Date.now()-started;
 const reader=r.body!.getReader(),decoder=new TextDecoder();let buffer='';
 for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end:number;while((end=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of chunk.split('\n'))if(line.startsWith('data:')){const e=JSON.parse(line.slice(5));evidence.events.push({atMs:Date.now()-started,type:e.type,stage:e.stage,message:e.message});if(e.type==='result'||e.type==='error')terminal=e;}}}
 assert.equal(terminal?.type,'result',terminal?.message||'No terminal result');
 const artifact=validateArtifact(terminal.artifact,input.source,input.selectedParagraphIds);evidence.provenance=artifact.provenance;evidence.elapsedMs=Date.now()-started;
 const saved=await(await fetch(base+'/api/generation/'+id+'?requestId='+id,{headers,signal:deadline})).json();assert.deepEqual(saved.event.artifact,artifact);evidence.persistedResultMatches=true;
 const guest=await fetch(base+'/api/generation/'+id,{signal:deadline});assert.equal(guest.status,401);evidence.guestStatus=guest.status;
 const duplicate=await fetch(base+'/api/generate',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Generation-Request':id},body:JSON.stringify(input),signal:deadline});assert.equal(duplicate.status,409);evidence.duplicateStatus=duplicate.status;
 assert(evidence.events.filter((e:any)=>e.type==='status').length>=3);
 assert(Math.min(evidence.events[0].atMs,...evidence.polls.filter((p:any)=>p.status===200).map((p:any)=>p.atMs))<15000,'No visible progress within 15 seconds');
 evidence.passed=true;
}catch(e){evidence.passed=false;evidence.error=e instanceof Error?e.message:String(e);process.exitCode=1}
finally{clearInterval(timer);await mkdir('artifacts/reviews/generation-connection',{recursive:true});await writeFile('artifacts/reviews/generation-connection/production.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2))}
