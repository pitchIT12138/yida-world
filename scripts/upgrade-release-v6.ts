import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'dotenv';
import {generateArtifact} from '../server/generation';
const env=parse(await readFile('.dev.vars','utf8'));
for(const id of ['studio-3d0c8ad5-ea44-4f61-9530-f086b7135a6f','studio-baa43112-f206-4e48-86d1-3d1427326601','story-1747681485547843585']){
 const root='artifacts/release-upgrades/'+id,dir=root+'/v6';await mkdir(dir,{recursive:true});const input=JSON.parse(await readFile(root+'/request.json','utf8')),findings=JSON.parse(await readFile(root+'/content-repair-request.json','utf8')).message;
 // A new strategy evaluation after adding strict provider JSON mode. Previous failed runs
 // remain immutable; this receives its own real run id and two-repair budget.
 delete input.previous;input.instruction+=' 首发新版采用新的JSON输出协议。本任务从原文重新设计，不照抄旧作。此前模型失败案例（必须避免同类错误）：'+findings+' 每个交互须有可复位的状态，界面控件与统计输出具备稳定id。请保持代码精简但不要牺牲事实与功能。';
 await writeFile(dir+'/request.json',JSON.stringify(input,null,2));let call=0;
 try{const result=await generateArtifact(input,{...env,MAX_OUTPUT_TOKENS:'20000'},{runId:crypto.randomUUID(),signal:AbortSignal.timeout(300000),onOutput:async(text,usage)=>{await writeFile(dir+'/model-'+(++call)+'.json',JSON.stringify({text,usage}))},onStatus:e=>console.log(id+': '+(e.type==='status'?e.message:e.type))});await writeFile(dir+'/candidate.json',JSON.stringify({source:input.source,artifact:result.artifact},null,2));console.log(id+': v6 ready')}
 catch(e){await writeFile(dir+'/failure.json',JSON.stringify({error:String(e),calls:call}));console.log(id+': '+String(e))}
}
