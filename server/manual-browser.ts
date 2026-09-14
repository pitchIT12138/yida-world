import {Hono} from 'hono';
import type {RuntimeEnv} from './model';
import {boundedBytes} from './imports';
import {MANUAL_WIDTH,MANUAL_HEIGHT,manualURL,validateManualAction} from '../src/lib/manual-browser';
import {answerAddress} from '../src/lib/rich-source';
import {validateSource} from '../src/lib/validation';

export const manualBrowserRoutes=new Hono<{Bindings:RuntimeEnv}>();
const rate=new Map<string,{until:number;count:number}>();
manualBrowserRoutes.use('*',async(c,next)=>{
  const origin=c.req.header('origin');
  if(origin&&origin!==new URL(c.req.url).origin)return c.json({error:'请求来源不匹配'},403);
  if(c.req.header('X-Reader-Client')!=='yida')return c.json({error:'请从导入面板打开窗口。'},403);
  const create=c.req.method==='POST'&&new URL(c.req.url).pathname.replace(/\/$/,'')==='/api/manual-browser';
  const now=Date.now(),key=(c.req.header('cf-connecting-ip')||'local')+(create?':create':':operate');
  for(const [k,v]of rate)if(v.until<now)rate.delete(k);
  const value=rate.get(key)||{until:now+60000,count:0};rate.set(key,value);
  if(++value.count>(create?6:1200))return c.json({error:'操作较多，请稍后重试。'},429);
  await next();
});
async function readBody(req:Request){
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw new Error('请求格式无效');
  return JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(req.body),16000)));
}
manualBrowserRoutes.all('*',async c=>{
  const path=new URL(c.req.url).pathname.replace(/^\/api\/manual-browser/,'').replace(/\/$/,''),method=c.req.method;
  const create=path===''&&method==='POST';
  if(!create&&!((['/screen','/status'].includes(path)&&method==='GET')||(['action','capture'].some(x=>path==='/'+x)&&method==='POST')||(path===''&&method==='DELETE')))return c.json({error:'窗口操作不存在。'},404);
  const id=c.req.header('X-Reader-Session');
  if(!create&&(!id||!/^([a-f0-9]{64})$/.test(id)))return c.json({code:'SESSION_EXPIRED',error:'窗口已关闭，请重新打开。'},410);
  let body:unknown;
  try{
    if(create){const value=await readBody(c.req.raw);const url=value?.url===undefined?'https://www.zhihu.com/signin':typeof value.url==='string'?manualURL(value.url):undefined;if(!url)throw new Error('请输入知乎回答链接');body={url}}
    if(path==='/action')body=validateManualAction(await readBody(c.req.raw));
  }catch(e){return c.json({error:e instanceof Error?e.message:'请求无效'},400)}
  if(!c.env.COLLECTOR_URL||!c.env.COLLECTOR_TOKEN)return c.json({code:'WINDOW_UNAVAILABLE',error:'手动窗口服务尚未启动，请在项目中运行 npm run collector。'},503);
  try{
    const endpoint=new URL(c.env.COLLECTOR_URL);
    if(endpoint.username||endpoint.password||!(endpoint.protocol==='https:'||(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname))))throw new Error('Invalid collector endpoint');
    endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/sessions'+(create?'':'/'+id+path);endpoint.search='';endpoint.hash='';
    const response=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+c.env.COLLECTOR_TOKEN,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(30000)])});
    const bytes=await boundedBytes(response,path==='/capture'?4_000_000:2_000_000);
    if(path==='/screen'&&response.ok){
      if(!response.headers.get('content-type')?.startsWith('image/jpeg')||bytes[0]!==255||bytes[1]!==216)throw new Error('Invalid frame');
      c.header('Content-Type','image/jpeg');return c.body(new Uint8Array(bytes).buffer);
    }
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!response.ok){
      const status=([400,404,409,410,413,422,429,503].includes(response.status)?response.status:502) as 400|404|409|410|413|422|429|503|502;
      return c.json({code:typeof data.code==='string'?data.code:'WINDOW_FAILED',error:typeof data.error==='string'?data.error:'窗口操作未完成，请重试。'},status);
    }
    if(create){
      if(!/^[a-f0-9]{64}$/.test(data.id)||data.width!==MANUAL_WIDTH||data.height!==MANUAL_HEIGHT)throw new Error('Invalid session');
      return c.json({id:data.id,width:data.width,height:data.height,notice:typeof data.notice==='string'?data.notice:undefined},201);
    }
    if(path==='/status'){if(typeof data.authenticated!=='boolean')throw new Error('Invalid status');return c.json({authenticated:data.authenticated})}
    if(path==='/capture'){
      const source=validateSource(data.source),address=answerAddress(source.sourceUrl||'');
      if(!address||source.id!=='zhihu-'+address.id||source.imported?.completeness==='partial')throw new Error('Invalid source');
      return c.json({source});
    }
    return c.json({ok:true});
  }catch{return c.json({code:'WINDOW_FAILED',error:'手动窗口服务连接中断，请重试；本地服务需保持运行。'},502)}
});
