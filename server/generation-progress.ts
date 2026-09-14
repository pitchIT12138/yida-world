import type {GenerationEvent,GenerationSnapshot} from '../src/lib/types';
import type {RuntimeEnv} from './model';

export const progressKey=(owner:string,id:string)=>'private-generation/'+owner+'/'+id+'/progress.json';
// Serialize writes: a slow earlier stage must never overwrite the final result.
export function generationProgress(env:RuntimeEnv,owner:string,id:string,requestId:string,timeout:number,send:(e:GenerationEvent)=>void){
 const startedAt=Date.now();let event:GenerationEvent={type:'status',stage:'accepted',message:'网站已接收请求，准备连接模型…'},pending=Promise.resolve(),terminal=false;
 function update(next:GenerationEvent){
  if(terminal)return pending;
  event=next;terminal=next.type!=='status';
  const now=Date.now(),snapshot:GenerationSnapshot={runId:id,requestId,startedAt,updatedAt:now,deadlineAt:startedAt+timeout,event:next.type==='status'?{...next,elapsedMs:now-startedAt}:next};
  if(next.type==='status')send(snapshot.event);
  if(env.MEDIA)pending=pending.catch(()=>{}).then(async()=>{await env.MEDIA!.put(progressKey(owner,id),JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}})});
  if(next.type!=='status')pending=pending.then(()=>send(snapshot.event));
  // Callers await final writes; status callbacks also need an attached rejection handler.
  void pending.catch(()=>{});
  return pending;
 }
 return {update,heartbeat:()=>event.type==='status'?update(event):pending,flush:()=>pending};
}
