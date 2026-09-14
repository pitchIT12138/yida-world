import {afterEach,describe,it,expect,vi}from 'vitest';
import app from '../server/app';
import { fixture,source }from './fixtures';
const env={BALANCED_API_BASE:'https://model.example/v1',BALANCED_API_KEY:'test-secret-not-real',BALANCED_MODEL:'mock-model',GENERATION_ENABLED:'true',REQUESTS_PER_MINUTE:'30'};
const input={source,selectedParagraphIds:[],instruction:'测试加工',tier:'balanced'};
let ip=0;
function post(body:unknown,overrides:Record<string,string>={}){
  return app.request('http://local.test/api/generate',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':String(++ip)},body:JSON.stringify(body)},{...env,...overrides});
}
function mock(text:string){return new Response(JSON.stringify({choices:[{message:{content:text}}],usage:{prompt_tokens:10,completion_tokens:20}}),{headers:{'Content-Type':'application/json'}})}
function plan(){const a=fixture();return {format:'interaction-plan-v1',artifact:a,contracts:[{blockId:a.blocks[0].id,controls:[{selector:'#add',action:'click',effect:'计数加一'}],reads:[],writes:['count'],feedback:'从0开始，增加1'}]}}
function success(_url:any,init:any){const request=JSON.parse(init.body),ctx=JSON.parse(request.messages[1].content);if(ctx.stageInstruction?.includes('只做整篇设计清单'))return Promise.resolve(mock(JSON.stringify(plan())));if(ctx.stageInstruction?.includes('只实现给定计划'))return Promise.resolve(mock(JSON.stringify({...fixture().blocks[0],blockId:fixture().blocks[0].id})));return Promise.resolve(mock(JSON.stringify(fixture())))}
function events(text:string){return text.trim().split('\n\n').map(x=>JSON.parse(x.slice(6)))}
afterEach(()=>vi.unstubAllGlobals());
describe('real generation transport with explicitly mocked provider',()=>{
  it('does not pretend to generate when credentials are missing',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const r=await post(input,{BALANCED_API_KEY:''});expect(r.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps keys out of public config',async()=>{
    const r=await app.request('http://local.test/api/config',{},env);const text=await r.text();
    expect(text).not.toContain(env.BALANCED_API_KEY);expect(text).not.toContain(env.BALANCED_API_BASE);expect(JSON.parse(text).tiers).toEqual(['balanced']);
  });
  it('records server provenance and actual provider usage',async()=>{
    const fetcher=vi.fn().mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const r=await post(input),e=events(await r.text()),result=e.find(x=>x.type==='result');
    expect(fetcher).toHaveBeenCalledTimes(2);expect(result.artifact.provenance.model).toBe('mock-model');
    expect(result.artifact.provenance.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifact.provenance.runId).not.toContain('TEST-FIXTURE');expect(result.repairTicket).toBeTruthy();
    expect(result.artifact.provenance.usage.completion_tokens).toBe(40);
  });
  it('passes the current design baseline to the next model and records its fingerprint',async()=>{
    const fetcher=vi.fn().mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const current=fixture();current.design!.intent='保留这一篇独特的表达意图';
    const result=events(await(await post({...input,current})).text()).at(-1);
    const request=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(JSON.stringify(request)).toContain(current.design!.intent);
    expect(result.artifact.provenance.baselineVersion).toBe(current.design!.version);
    expect(result.artifact.provenance.baselineHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('sends old code and source as a reference after the author edits the source',async()=>{
    const fetcher=vi.fn().mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const previous={source:structuredClone(source),artifact:fixture()};previous.artifact.design!.intent='延续已经完成的比较方式';
    const changed={...source,title:'修订后的原文'};
    const result=events(await(await post({...input,source:changed,previous})).text()).at(-1);
    const request=JSON.parse(fetcher.mock.calls[0][1].body),context=JSON.parse(request.messages[1].content);
    expect(context.source.title).toBe(changed.title);expect(context.previousVersion).toEqual(previous);
    expect(context.designBaseline.intent).toBe(previous.artifact.design!.intent);expect(context.designPolicyVersion).toBe('composed-v8.2026-09-14');
    expect(result.type).toBe('result');
  });
  it('repairs malformed output at most twice, then reports failure',async()=>{
    const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(mock('not JSON')));vi.stubGlobal('fetch',fetcher);
    const e=events(await(await post(input)).text());expect(fetcher).toHaveBeenCalledTimes(3);expect(e.at(-1).type).toBe('error');
  });
  it('structural repair consumes the one of the two repairs',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(mock('bad')).mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const e=events(await(await post(input)).text());expect(fetcher).toHaveBeenCalledTimes(3);
    expect(e.at(-1).type).toBe('result');expect(e.at(-1).repairTicket).toBeTruthy();
  });
  it('accepts one runtime repair with the signed original candidate',async()=>{
    const fetcher=vi.fn().mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const result=events(await(await post(input)).text()).at(-1);
    const repaired=events(await(await post({...input,repair:{message:'test runtime error',candidate:result.artifact,ticket:result.repairTicket}})).text()).at(-1);
    expect(repaired.type).toBe('result');expect(repaired.repairTicket).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('rejects a changed candidate before making a repair call',async()=>{
    const fetcher=vi.fn().mockImplementation(success);vi.stubGlobal('fetch',fetcher);
    const result=events(await(await post(input)).text()).at(-1);result.artifact.explanation='tampered';
    const r=await post({...input,repair:{message:'error',candidate:result.artifact,ticket:result.repairTicket}});
    expect(r.status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry provider rate limit failures or leak its error body',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('SECRET_DIAGNOSTIC',{status:429}));vi.stubGlobal('fetch',fetcher);
    const text=await(await post(input)).text();expect(fetcher).toHaveBeenCalledTimes(1);expect(text).toContain('额度');expect(text).not.toContain('SECRET_DIAGNOSTIC');
  });
  it('rejects cross-origin writes and content path traversal',async()=>{
    const r=await app.request('http://local.test/api/generate',{method:'POST',headers:{origin:'https://attacker.test'},body:JSON.stringify(input)},env);expect(r.status).toBe(403);
    const bad=await app.request('http://local.test/api/content/knowledge/not-a-number',{},env);expect(bad.status).toBe(400);
  });
});

describe('official detail route',()=>{it('keeps knowledge on the verified knowledge endpoint',async()=>{const fetcher=vi.fn().mockResolvedValue(Response.json({content:'Official body',work_id:'1307332455322529792'}));vi.stubGlobal('fetch',fetcher);const r=await app.request('/api/content/knowledge/1307332455322529792',{},env);expect(r.status).toBe(200);expect(fetcher.mock.calls[0][0]).toBe('https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/1307332455322529792')})});
