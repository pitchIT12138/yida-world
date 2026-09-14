import {identity,runner,authRoutes,authConfigured} from './auth';
import {CloudWorkspace,reserveGeneration} from './cloud';
import {generateArtifact} from './generation';
import {releaseRoutes} from './release';
import { Hono } from 'hono';
import { profile, type RuntimeEnv } from './model';
import { validateInput, validateArtifact } from '../src/lib/validation';
import type { GenerationInput, GenerationEvent } from '../src/lib/types';
import { importRoutes } from './imports';
import { workspaceRoutes } from './workspace';
import { manualBrowserRoutes } from './manual-browser';

export const app = new Hono<{Bindings:RuntimeEnv}>();
const contentCache=new Map<string,{until:number;data:unknown}>();
const requests=new Map<string,{until:number;count:number}>();
const encoder=new TextEncoder();
const usedTickets=new Set<string>();
export async function hash(value:unknown):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function bounded(v:string|undefined,fallback:number,min:number,max:number){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback}
function allowed(env:RuntimeEnv){return env.GENERATION_ENABLED!=='false'}
function requestHashInput(input:GenerationInput){return {source:input.source,current:input.current,previous:input.previous,selectedParagraphIds:input.selectedParagraphIds,instruction:input.instruction,tier:input.tier}}
async function sign(value:string,key:string){
  const k=await crypto.subtle.importKey('raw',encoder.encode('yida-repair-v1:'+key),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return {k,signature:await crypto.subtle.sign('HMAC',k,encoder.encode(value))};
}
async function ticket(payload:unknown,key:string){
  const value=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const {signature}=await sign(value,key);
  return value+'.'+btoa(String.fromCharCode(...new Uint8Array(signature)));
}
async function verifyTicket(token:string,key:string):Promise<any>{
  try{
    const [v,s]=token.split('.');
    const {k}=await sign(v,key);
    if(!await crypto.subtle.verify('HMAC',k,Uint8Array.from(atob(s),c=>c.charCodeAt(0)),encoder.encode(v)))throw 0;
    const p=JSON.parse(decodeURIComponent(escape(atob(v))));
    if(!Number.isFinite(p.until)||p.until<Date.now())throw 0;
    return p;
  }catch{throw new Error('修复凭证已过期或无效，请重新生成')}
}
async function readJSON(req:Request){
  if(Number(req.headers.get('content-length'))>18000000)throw new Error('请求过大');
  const reader=req.body?.getReader();if(!reader)throw new Error('请求为空');
  let result='',size=0;const dec=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>18000000){await reader.cancel();throw new Error('请求过大')}result+=dec.decode(value,{stream:true})}
  return JSON.parse(result+dec.decode());
}
app.use('/api/*',async(c,next)=>{
  c.header('X-Content-Type-Options','nosniff');
  c.header('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(c.req.method)){
    const origin=c.req.header('origin');
    if(origin && origin!==new URL(c.req.url).origin)return c.json({error:'请求来源不匹配'},403);
  }
  const user=await identity(c.req.raw,c.env);
  c.set('user' as never,user as never);
  if(c.env.AUTH_REQUIRED==='true'&&['/api/workspace','/api/import','/api/manual-browser'].some(p=>c.req.path.startsWith(p))&&!user)return c.json({error:'请先使用知乎登录。'},401);
  if(user&&c.env.DB&&c.env.MEDIA)c.env={...c.env,WORKSPACE_STORE:new CloudWorkspace(c.env.DB,c.env.MEDIA,user.id)};
  await next();
});
app.route('/api/auth',authRoutes);
app.route('/api',releaseRoutes);
app.get('/api/config',async c=>{
  const tiers=(['balanced','frontier'] as const).filter(t=>!!profile(c.env,t));
  const user=await identity(c.req.raw,c.env);
  const generationEnabled=allowed(c.env)&&tiers.length>0&&(c.env.AUTH_REQUIRED!=='true'||!!user);
  return c.json({authRequired:c.env.AUTH_REQUIRED==='true',loginConfigured:authConfigured(c.env),user:await identity(c.req.raw,c.env)||null,workspaceEnabled:!!c.env.WORKSPACE_STORE,generationEnabled,tiers:generationEnabled?tiers:[],timeoutMs:bounded(c.env.GENERATION_TIMEOUT_MS,120000,1000,120000),reason:generationEnabled?undefined:c.env.AUTH_REQUIRED==='true'&&!user?'使用知乎登录后即可生成自己的交互回答。':'尚未连接生成模型，原文阅读仍然可用。'});
});
app.route('/api/workspace',workspaceRoutes);
app.route('/api/import',importRoutes);
app.route('/api/manual-browser',manualBrowserRoutes);
app.get('/api/content/:kind/:id?',async c=>{
  const kind=c.req.param('kind'),id=c.req.param('id');
  if(!['knowledge','story'].includes(kind)||id&&!/^\d{1,30}$/.test(id))return c.json({error:'内容地址无效'},400);
  const key=id?kind+'/'+id:kind+'/list',cached=contentCache.get(key);
  if(cached && cached.until>Date.now())return c.json(cached.data);
  const abort=AbortSignal.timeout(20000);
  try{
    const r=await fetch('https://api.zhihu.com/km-indep-home/hackathon/v2/'+key,{headers:{Accept:'application/json'},signal:abort});
    if(!r.ok){await r.body?.cancel();return c.json({error:'知乎内容接口暂不可用（HTTP '+r.status+'）'},502)}
    const raw=await r.text();
    if(raw.length>1500000)throw new Error('内容过大');
    const data=JSON.parse(raw);
    if(id?(!data||typeof data.content!=='string'):!Array.isArray(data))throw new Error('接口返回格式不正确');
    if(contentCache.size>=64)contentCache.delete(contentCache.keys().next().value!);
    contentCache.set(key,{data,until:Date.now()+3600000});
    return c.json(data);
  }catch{return c.json({error:'知乎内容暂时无法读取，请稍后重试，或粘贴已有原文。'},502)}
});
app.post('/api/generate',async c=>{
  let input:GenerationInput;
  try{input=validateInput(await readJSON(c.req.raw))}catch(e){return c.json({error:e instanceof Error?e.message:'请求格式不正确'},400)}
  const p=profile(c.env,input.tier);
  if(!allowed(c.env)||!p)return c.json({error:'当前档位尚未连接模型，原文与已有结果已保留。'},503);
  const user=await identity(c.req.raw,c.env),trusted=await runner(c.req.raw,c.env);
  if(c.env.AUTH_REQUIRED==='true'&&!user&&!trusted)return c.json({error:'请先使用知乎登录。'},401);
  const now=Date.now(),owner=trusted?'@editor':user?.id||'local';
  const rateKey=owner==='local'?(c.req.header('cf-connecting-ip')||'local'):owner;
  const rate=requests.get(rateKey),max=bounded(c.env.REQUESTS_PER_MINUTE,4,1,30);
  if(rate&&rate.until>now&&rate.count>=max)return c.json({error:'生成请求较多，请一分钟后重试。'},429);
  if(requests.size>2000)for(const [k,v]of requests)if(v.until<now)requests.delete(k);
  requests.set(rateKey,{until:rate&&rate.until>now?rate.until:now+60000,count:rate&&rate.until>now?rate.count+1:1});
  let runId=crypto.randomUUID() as string,repairs=0;
  try{
    if(input.repair){
      const proof=await verifyTicket(input.repair.ticket,p.key);
      if(proof.owner!==owner||proof.inputHash!==await hash(requestHashInput(input))||proof.candidateHash!==await hash(input.repair.candidate)||proof.repairs>=2)throw Error('修复结果与原请求不匹配');
      validateArtifact(input.repair.candidate,input.source);
      if(typeof input.repair.message!=='string'||input.repair.message.length>600)throw Error('修复反馈格式不正确');
      runId=proof.runId;repairs=proof.repairs+1;
      if(c.env.DB){const r=await c.env.DB.prepare('UPDATE jobs SET repairs=repairs+1 WHERE id=? AND owner=? AND repairs=?').bind(runId,owner,proof.repairs).run();if(!r.meta.changes)throw Error('修复凭证已使用')}
      else {if(usedTickets.has(input.repair.ticket))throw Error('修复凭证已使用');usedTickets.add(input.repair.ticket)}
    }else if(c.env.DB&&!await reserveGeneration(c.env.DB,owner,trusted?'editor':'user',runId,input.source.id,await hash(input.source),runId))return c.json({error:'今日生成额度已用完，已有内容仍可阅读。'},429);
  }catch(e){return c.json({error:e instanceof Error?e.message:'修复请求无效'},400)}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),bounded(c.env.GENERATION_TIMEOUT_MS,120000,1000,120000));
  const disconnect=()=>controller.abort();c.req.raw.signal.addEventListener('abort',disconnect,{once:true});
  const stream=new ReadableStream<Uint8Array>({
    start(output){let closed=false;const send=(event:GenerationEvent)=>{if(!closed)try{output.enqueue(encoder.encode('data: '+JSON.stringify(event)+'\n\n'))}catch{closed=true;controller.abort()}};
      void(async()=>{try{
        const result=await generateArtifact(input,c.env,{signal:controller.signal,runId,repairs,onStatus:send,onRepair:async()=>{if(c.env.DB){const r=await c.env.DB.prepare('UPDATE jobs SET repairs=repairs+1 WHERE id=? AND repairs<2').bind(runId).run();if(!r.meta.changes)throw Error('已达到两次修复上限')}}});
        const repairTicket=result.repairs<2?await ticket({until:Date.now()+300000,owner,runId,repairs:result.repairs,inputHash:await hash(requestHashInput(input)),candidateHash:await hash(result.artifact)},p.key):undefined;
        if(c.env.DB)await c.env.DB.prepare("UPDATE jobs SET status='generated' WHERE id=?").bind(runId).run();
        send({type:'result',artifact:result.artifact,repairTicket});
      }catch(e){if(c.env.DB)await c.env.DB.prepare("UPDATE jobs SET status='failed' WHERE id=?").bind(runId).run();send({type:'error',code:controller.signal.aborted?'TIMEOUT':'GENERATION_FAILED',message:controller.signal.aborted?'生成超时或已取消，上一版保持不变。':e instanceof Error?e.message:'生成失败'});}
      finally{clearTimeout(timer);c.req.raw.signal.removeEventListener('abort',disconnect);if(!closed){closed=true;try{output.close()}catch{}}}})();
    },cancel(){controller.abort();clearTimeout(timer)}
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
});
app.get('/api/health',c=>c.json({ok:true}));
app.all('/api/*',c=>c.json({error:'接口不存在'},404));
export default app;
