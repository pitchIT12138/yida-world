import { Hono } from 'hono';
import { answerAddress, parseAnswerHTML } from '../src/lib/rich-source';
import { validateSource } from '../src/lib/validation';
import type { RuntimeEnv } from './model';
import { mediaMime } from '../src/lib/media';
import {answerShare} from '../src/lib/answer-share';

export async function readRenderedAnswer(address:{id:string;url:string},env:RuntimeEnv,signal:AbortSignal,sessionId?:string){
  if(!env.COLLECTOR_URL||!env.COLLECTOR_TOKEN)return;
  const endpoint=new URL(env.COLLECTOR_URL);
  if(endpoint.username||endpoint.password||!(endpoint.protocol==='https:'||(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname))))throw new Error('读取服务地址无效');
  endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+(sessionId?'/sessions/'+sessionId+'/answer':'/answer');endpoint.search='';endpoint.searchParams.set('url',address.url);
  const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+env.COLLECTOR_TOKEN},redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
  const data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,4_000_000)));
  if(!response.ok)return {status:response.status,error:typeof data.error==='string'?data.error:'网页读取服务暂时不可用。',code:typeof data.code==='string'?data.code:'READER_FAILED'};
  const source=validateSource(data.source);
  if(source.id!=='zhihu-'+address.id||answerAddress(source.sourceUrl||'')?.id!==address.id)throw new Error('读取结果不属于所选回答');
  return {source};
}

export async function boundedBytes(response:Response,max:number):Promise<Uint8Array>{
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error('远程文件超过大小上限')}
  if(!response.body)throw new Error('远程响应为空');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new Error('远程文件超过大小上限')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length}return bytes;
}
export function isZhihuMedia(value:string):boolean{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)zhimg\.com$/.test(u.hostname)}catch{return false}
}
export const importRoutes=new Hono<{Bindings:RuntimeEnv}>();
const rate=new Map<string,{until:number;count:number}>();
importRoutes.use('*',async(c,next)=>{
  const key=c.req.header('cf-connecting-ip')||'local',now=Date.now();
  for(const [k,v]of rate)if(v.until<now)rate.delete(k);
  const value=rate.get(key)||{until:now+60000,count:0};if(++value.count>180)return c.json({error:'读取请求较多，请稍后重试。'},429);rate.set(key,value);await next();
});
importRoutes.get('/answer',async c=>{
  const address=answerShare(c.req.query('url')||'');if(!address)return c.json({error:'请输入单条知乎回答的分享文案、链接或回答 ID。'},400);
  const sessionId=c.req.header('X-Reader-Session');
  if(sessionId){
    if(!/^[a-f0-9]{64}$/.test(sessionId)||c.req.header('X-Reader-Client')!=='yida')return c.json({code:'SESSION_EXPIRED',error:'登录会话无效，请重新扫码。'},410);
    try{
      const result=await readRenderedAnswer(address,c.env,c.req.raw.signal,sessionId);
      if(!result)return c.json({error:'读取服务尚未连接。'},503);
      return c.json({...result,sourceUrl:address.url},result.source?200:result.status===410?410:result.status===409?409:422);
    }catch{return c.json({code:'READER_FAILED',error:'当前会话读取未完成，请重试。'},502)}
  }
  let pageCheck=false;
  try{
    let url=address.url;const signal=AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(10000)]);
    for(let i=0;i<3;i++){
      const r=await fetch(url,{redirect:'manual',signal,headers:{Accept:'text/html'}});
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');await r.body?.cancel();const next=location?answerAddress(new URL(location,url).href):undefined;
        if(!next||next.id!==address.id)break;url=next.url;continue;
      }
      const html=new TextDecoder().decode(await boundedBytes(r,4_000_000));pageCheck=/<meta\b[^>]*\bid=["']zh-zse-ck["']/i.test(html);
      if(r.ok){const source=parseAnswerHTML(html,'url').find(s=>answerAddress(s.sourceUrl||'')?.id===address.id);if(source&&source.imported?.completeness!=='partial')return c.json({source:validateSource(source)})}
      break;
    }
  }catch{/* The renderer can execute the normal page loading flow when plain HTTP cannot. */}
  try{const result=await readRenderedAnswer(address,c.env,c.req.raw.signal);if(result)return c.json({...result,sourceUrl:address.url},result.source?200:422)}catch{return c.json({code:'READER_FAILED',error:'网页读取服务没有完成加载，链接已保留，可重试或粘贴正文／HTML。',sourceUrl:address.url},422)}
  return c.json({code:pageCheck?'PAGE_CHECK_REQUIRED':'SOURCE_UNAVAILABLE',error:pageCheck?'知乎返回了需要执行 JavaScript 的页面校验，网页读取服务尚未连接。链接已保留，也可粘贴完整正文或 HTML。':'暂时没有取得对应回答全文。请重试或粘贴完整正文／HTML，链接已保留。',sourceUrl:address.url},422);
});
importRoutes.get('/media',async c=>{
  let url=c.req.query('url')||'';if(!isZhihuMedia(url))return c.json({error:'仅支持读取知乎图片／媒体域名。可在导入面板手动补充原文件。'},400);
  const signal=AbortSignal.timeout(20000);
  try{
    for(let i=0;i<3;i++){
      const r=await fetch(url,{redirect:'manual',signal,headers:{Accept:'image/*,video/*,audio/*',Referer:'https://www.zhihu.com/'}});
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');await r.body?.cancel();if(!location)throw 0;
        const next=new URL(location,url).href;if(!isZhihuMedia(next))throw 0;url=next;continue;
      }
      if(!r.ok){await r.body?.cancel();throw 0}
      const bytes=await boundedBytes(r,20_000_000),mime=mediaMime(bytes,(r.headers.get('content-type')||'').split(';')[0]);
      if(!mime||!bytes.length)throw 0;
      c.header('Content-Type',mime);c.header('Content-Disposition','attachment');
      c.header('Cache-Control','private, max-age=3600');
      return c.body(new Uint8Array(bytes).buffer);
    }
    throw 0;
  }catch{return c.json({error:'未取得原媒体文件，可能已过期、受限或超过 20 MB。请重试或手动补充原文件。'},422)}
});
