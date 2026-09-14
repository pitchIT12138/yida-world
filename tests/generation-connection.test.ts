import {afterEach,it,expect,vi} from 'vitest';
import {generate} from '../src/lib/client';
import {fixture,source} from './fixtures';
import {generationProgress,progressKey} from '../server/generation-progress';
import {cloudFixture} from './cloud-fixture';
import app from '../server/app';
import {digest,reserveGeneration} from '../server/cloud';
const input={source,selectedParagraphIds:[],instruction:'测试加工',tier:'balanced' as const};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
const hanging=(signal:AbortSignal)=>new Promise<Response>((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));

it('recovers the completed result through status polling while stream headers are buffered; never submits twice',async()=>{
 vi.useFakeTimers();let id='';const status=vi.fn();
 const fetcher=vi.fn((url:string,init:any)=>{
  if(url==='/api/generate'){id=init.headers['X-Generation-Request'];return hanging(init.signal)}
  return Promise.resolve(Response.json({runId:id,requestId:id,updatedAt:Date.now(),event:{type:'result',artifact:fixture()}}));
 });vi.stubGlobal('fetch',fetcher);
 const result=generate(input,new AbortController().signal,status);
 await vi.advanceTimersByTimeAsync(5000);expect((await result).artifact.blocks[0].id).toBe(fixture().blocks[0].id);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/generate')).toHaveLength(1);
 expect(vi.getTimerCount()).toBe(0);
});
it('does not wait forever for unacknowledged requests and cleans up cancellation',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((url:string,init:any)=>url==='/api/generate'?hanging(init.signal):Promise.resolve(Response.json({}, {status:404}))));
 const result=generate(input,new AbortController().signal,()=>{});const checked=expect(result).rejects.toThrow('20 秒');
 await vi.advanceTimersByTimeAsync(21000);await checked;expect(vi.getTimerCount()).toBe(0);
 const controller=new AbortController(),cancelled=generate(input,controller.signal,()=>{});const rejected=expect(cancelled).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;expect(vi.getTimerCount()).toBe(0);
});
it('a responsive status API with stale task data cannot keep a dead task alive',async()=>{
 vi.useFakeTimers();let id='';const updatedAt=Date.now();
 vi.stubGlobal('fetch',vi.fn((url:string,init:any)=>{if(url==='/api/generate'){id=init.headers['X-Generation-Request'];return hanging(init.signal)}return Promise.resolve(Response.json({runId:id,requestId:id,updatedAt,event:{type:'status',stage:'model_waiting',message:'等待模型'}}))}));
 const result=generate(input,new AbortController().signal,()=>{});const checked=expect(result).rejects.toThrow('30 秒');await vi.advanceTimersByTimeAsync(57000);await checked;
});
it('forwards provider failures without exposing a fake result',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: '+JSON.stringify({type:'error',code:'MODEL_SERVICE_FAILED',message:'模型服务限流或额度不足，请稍后重试'})+'\n\n')));
 await expect(generate(input,new AbortController().signal,()=>{})).rejects.toThrow('限流');
});
it('serializes stored progress, emits the result after saving, and protects status across users',async()=>{
 const f=cloudFixture(),id=crypto.randomUUID();await reserveGeneration(f.DB,'zhihu:a','user',id,source.id,'hash',id);
 const sent:any[]=[],p=generationProgress(f,'zhihu:a',id,id,300000,e=>sent.push(e));
 void p.update({type:'status',stage:'model_waiting',message:'等待模型'});void p.heartbeat();await p.update({type:'result',artifact:fixture()});await p.heartbeat();
 expect(JSON.parse(f.objects.get(progressKey('zhihu:a',id))!).event.type).toBe('result');expect(sent.at(-1).type).toBe('result');
 const env={...f,AUTH_REQUIRED:'true'};
 for(const user of ['a','b']){await f.DB.prepare('INSERT INTO users VALUES(?,?,?,?)').bind('zhihu:'+user,user,'','now').run();const cookie=crypto.randomUUID();await f.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(cookie),'zhihu:'+user,Date.now()+60000).run();const r=await app.request('/api/generation/'+id,{headers:{cookie:'yida_session='+cookie}},env);expect(r.status).toBe(user==='a'?200:404)}
 expect((await app.request('/api/generation/'+id,{},env)).status).toBe(401);
 expect(f.sqlite.prepare('SELECT count(*) AS n FROM jobs').get()?.n).toBe(1);
});
