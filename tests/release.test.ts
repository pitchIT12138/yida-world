import {describe,it,expect,vi} from 'vitest';
import {app} from '../server/app';
import {CloudWorkspace,digest,reserveGeneration} from '../server/cloud';
import {parseProfile} from '../server/auth';
import {cloudFixture} from './cloud-fixture';
import {source,fixture} from './fixtures';
describe('release storage and identity',()=>{
 it('isolates owners, preserves history, rejects stale writes and missing-head updates',async()=>{
  const {DB,MEDIA}=cloudFixture(),a=new CloudWorkspace(DB,MEDIA,'a'),b=new CloudWorkspace(DB,MEDIA,'b');
  const value={source,votes:0,accent:'#000',tag:'test'};
  await expect(a.save(value,3,'import')).rejects.toThrow();await a.save(value,0,'import');
  expect(await b.list()).toEqual([]);expect(await b.version(source.id,1)).toBeUndefined();
  await expect(a.save(value,0,'import')).rejects.toThrow();await a.save(value,1,'generation');expect(await a.versions(source.id)).toHaveLength(2);expect((await a.version(source.id,1))?.source).toEqual(source);
 });
 it('enforces user and global quotas atomically across instances',async()=>{
  const {DB}=cloudFixture();for(let i=0;i<3;i++)expect(await reserveGeneration(DB,'a','user','a'+i,'x','h','a'+i)).toBe(true);
  expect(await reserveGeneration(DB,'a','user','a4','x','h','a4')).toBe(false);
  for(let i=0;i<17;i++)expect(await reserveGeneration(DB,'owner'+i,'user','b'+i,'x','h','b'+i)).toBe(true);
  expect(await reserveGeneration(DB,'other','user','extra','x','h','extra')).toBe(false);
 });
 it('keeps large provider ids lossless and rejects error profiles',()=>{expect(parseProfile('{"uid":1747681485547843585,"fullname":"作者"}').id).toBe('zhihu:1747681485547843585');expect(()=>parseProfile('{"code":404,"message":"not found"}')).toThrow()});
 it('requires a real session for cloud workspace and rejects cross-origin writes',async()=>{
  const env={...cloudFixture(),AUTH_REQUIRED:'true'};
  expect((await app.request('/api/workspace',{headers:{'X-Workspace-Client':'yida'}},env)).status).toBe(401);
  expect((await app.request('/api/auth/logout',{method:'POST',headers:{origin:'https://evil.invalid'}},env)).status).toBe(403);
 });
 it('expires sessions and consumes OAuth state only in the matching browser',async()=>{
  const f=cloudFixture(),env={...f,AUTH_REQUIRED:'true',ZHIHU_APP_ID:'test',ZHIHU_APP_KEY:'test',ZHIHU_REDIRECT_URI:'https://site.test/api/auth/callback'};
  const state='s',browser='b';await f.DB.prepare('INSERT INTO oauth_states VALUES(?,?,?)').bind(await digest(state),await digest(browser),Date.now()+60000).run();
  const bad=await app.request('https://site.test/api/auth/callback?state=s&code=x',{headers:{cookie:'yida_oauth=wrong'}},env);expect(bad.status).toBe(400);expect(f.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get()?.n).toBe(1);
  await f.DB.prepare('INSERT INTO users VALUES(?,?,?,?)').bind('id','name','','now').run();const token=crypto.randomUUID();await f.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token),'id',Date.now()-1).run();const r=await app.request('/api/auth/session',{headers:{cookie:'yida_session='+token}},env);expect((await r.json()).user).toBeNull();
 });
 it('exchanges OAuth only once, binds a private session and invalidates logout',async()=>{
  const f=cloudFixture(),env={...f,AUTH_REQUIRED:'true',ZHIHU_APP_ID:'test',ZHIHU_APP_KEY:'test',ZHIHU_REDIRECT_URI:'https://site.test/api/auth/callback'};
  const state='valid-state',browser='valid-browser';await f.DB.prepare('INSERT INTO oauth_states VALUES(?,?,?)').bind(await digest(state),await digest(browser),Date.now()+60000).run();
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:'mock-provider-token'})).mockResolvedValueOnce(new Response('{"uid":1747681485547843585,"fullname":"Fixture user"}'));vi.stubGlobal('fetch',fetcher);
  try{const callback='https://site.test/api/auth/callback?state='+state+'&code=mock-code',headers={cookie:'yida_oauth='+browser};const r=await app.request(callback,{headers},env);expect(r.status).toBe(302);const cookie=r.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');const session=cookie.match(/yida_session=([^;]+)/)![1];
   const profile=await(await app.request('/api/auth/session',{headers:{cookie:'yida_session='+session}},env)).json();expect(profile.user.id).toBe('zhihu:1747681485547843585');
   expect((await app.request(callback,{headers},env)).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(2);
   await app.request('/api/auth/logout',{method:'POST',headers:{cookie:'yida_session='+session}},env);expect((await(await app.request('/api/auth/session',{headers:{cookie:'yida_session='+session}},env)).json()).user).toBeNull();
  }finally{vi.unstubAllGlobals()}
 });
 it('protects the task and media upload interfaces with separate credentials',async()=>{const env={...cloudFixture(),RUNNER_TOKEN:'secret'};expect((await app.request('/api/admin/jobs/claim',{method:'POST'},env)).status).toBe(401);expect((await app.request('/api/admin/jobs/claim',{method:'POST',headers:{Authorization:'Bearer secret'}},env)).status).toBe(200)});
});

describe('publication transaction',()=>{
 it('deduplicates intake and completion, retains baseline on stale source and allows rollback',async()=>{
  const f=cloudFixture(),env={...f,RUNNER_TOKEN:'runner'};
  async function post(path:string,data:unknown){return app.request('/api/admin'+path,{method:'POST',headers:{Authorization:'Bearer runner','Content-Type':'application/json'},body:JSON.stringify(data)},env)}
  const s={...source,bodyScope:'test fixture chapter',imported:{method:'official' as const,completeness:'partial' as const,notes:['test fixture only']},paragraphs:[{id:'p1',text:'Test original body. '.repeat(10)}]};
  const enqueued=await(await post('/jobs',{source:s})).json();expect(enqueued.status).toBe('queued');
  expect((await(await post('/jobs',{source:s})).json()).deduplicated).toBe(true);
  const {job}=await(await post('/jobs/claim',{})).json();const a=fixture();a.provenance={...a.provenance,runId:job.id,sourceHash:await digest(JSON.stringify(s))};
  const evidence={artifactHash:await digest(JSON.stringify(a)),content:{verdict:'pass',findings:['Unit test fixture; not a real model evaluation']},browser:{results:[740,360].map(width=>({width,blockId:'block-one',action:'click',observed:'1',expect:{text:'1'}}))}};
  const payload={lease:job.lease,answer:{source:s,artifact:a,assets:[]},evidence};
  expect((await post('/jobs/'+job.id+'/complete',{...payload,evidence:{...evidence,browser:{results:[]}}})).status).toBe(400);
  expect((await post('/jobs/'+job.id+'/complete',payload)).status).toBe(200);
  expect((await(await post('/jobs/'+job.id+'/complete',payload)).json()).deduplicated).toBe(true);
  const newer={...s,title:'New source'};const second=await(await post('/jobs',{source:newer})).json();const claim2=await(await post('/jobs/claim',{})).json();
  await f.DB.prepare('UPDATE sources SET hash=? WHERE id=?').bind('changed-after-generation',s.id).run();
  a.provenance={...a.provenance,runId:second.id,sourceHash:await digest(JSON.stringify(newer))};evidence.artifactHash=await digest(JSON.stringify(a));
  expect((await post('/jobs/'+second.id+'/complete',{lease:claim2.job.lease,answer:{source:newer,artifact:a},evidence})).status).toBe(409);
  const feed=await(await app.request('/api/feed',{},env)).json();expect(feed.items[0].source.title).toBe(s.title);
  expect((await post('/public/test/restore',{version:1,expectedRevision:1})).status).toBe(200);
  expect((await post('/public/test/restore',{version:1,expectedRevision:1})).status).toBe(409);
 });
});
