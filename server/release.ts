import {Hono} from 'hono';
import type {RuntimeEnv} from './model';
import {runner} from './auth';
import {CloudWorkspace,digest,reserveGeneration} from './cloud';
import {validateSource,validateArtifact} from '../src/lib/validation';
import {validateAssets} from '../src/lib/archive';
import {DESIGN_POLICY_VERSION} from '../src/lib/design-policy';
import {boundedBytes} from './imports';
export const releaseRoutes=new Hono<{Bindings:RuntimeEnv}>();
const PUBLIC='@public';
async function body(req:Request){return JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(req.body),100_000_000)))}
function offset(v:string|undefined){return Math.max(0,Math.min(10000,Number(v)||0))}
releaseRoutes.get('/discover',async c=>{
 if(!c.env.DB)return c.json({items:[],next:null,message:'讨论列表将在管理员同步后出现。'});
 const rows=await c.env.DB.prepare('SELECT id,title,summary,url,fetched_at AS fetchedAt,published_at AS publishedAt FROM discussions ORDER BY fetched_at DESC,id LIMIT 21 OFFSET ?').bind(offset(c.req.query('offset'))).all();
 return c.json({items:rows.results.slice(0,20),next:rows.results.length>20?offset(c.req.query('offset'))+20:null,message:rows.results.length?undefined:'尚未同步讨论。精选回答仍可直接阅读。'});
});
releaseRoutes.get('/feed',async c=>{
 if(!c.env.DB||!c.env.MEDIA)return c.json({items:[],next:null});const start=offset(c.req.query('offset'));
 const rows=await c.env.DB.prepare('SELECT body_key FROM documents WHERE owner=? ORDER BY updated_at DESC,id LIMIT 11 OFFSET ?').bind(PUBLIC,start).all<{body_key:string}>();
 const store=new CloudWorkspace(c.env.DB,c.env.MEDIA,PUBLIC);const items=await Promise.all(rows.results.slice(0,10).map(async r=>{const a=await store.read(r.body_key);return {...a,workspace:undefined,reference:undefined}}));return c.json({items,next:rows.results.length>10?start+10:null});
});
releaseRoutes.get('/media/:id',async c=>{
 const id=c.req.param('id');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return c.json({error:'内容标识无效'},400);
 if(!c.env.MEDIA)return c.json({error:'图片存储暂不可用'},503);const obj=await c.env.MEDIA.get('curated/'+id+'.json');
 if(!obj)return c.json({error:'原图暂不可用'},404);return new Response(obj.body as any,{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});
});
releaseRoutes.use('/admin/*',async(c,next)=>{if(!await runner(c.req.raw,c.env))return c.json({error:'需要后台任务凭证'},401);if(!c.env.DB||!c.env.MEDIA)return c.json({error:'发布存储未连接'},503);await next()});
releaseRoutes.post('/admin/discover',async c=>{
 const {items}=await body(c.req.raw);if(!Array.isArray(items)||items.length>30)return c.json({error:'讨论列表无效'},400);
 for(const item of items){const url=new URL(item.url);if(url.protocol!=='https:'||!['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname)||typeof item.title!=='string'||item.title.length>300||typeof item.summary!=='string'||item.summary.length>10000)return c.json({error:'讨论内容无效'},400)}
 if(items.length)await c.env.DB!.batch(await Promise.all(items.map(async x=>c.env.DB!.prepare('INSERT INTO discussions(id,title,summary,url,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,fetched_at=excluded.fetched_at').bind(await digest(x.url),x.title,x.summary,x.url,new Date().toISOString()))));return c.json({count:items.length});
});
releaseRoutes.post('/admin/media/:id',async c=>{const assets=await validateAssets((await body(c.req.raw)).assets);const id=c.req.param('id');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return c.json({error:'标识无效'},400);await c.env.MEDIA!.put('curated/'+id+'.json',JSON.stringify(assets),{httpMetadata:{contentType:'application/json'}});return c.json({count:assets.length})});
releaseRoutes.post('/admin/seed',async c=>{try{const a=await body(c.req.raw);validateSource(a.source);validateArtifact(a.artifact,a.source);await validateAssets(a.assets);if(a.artifact.provenance.sourceHash!==await digest(JSON.stringify(a.source)))throw Error('原文指纹不匹配');const store=new CloudWorkspace(c.env.DB!,c.env.MEDIA!,'@baseline');const old=await store.version(a.source.id,1);if(old)return c.json({preserved:true,id:a.source.id});await store.save({source:a.source,artifact:a.artifact,assets:a.assets,votes:0,tag:'精选回答',accent:'#477866'},0,'baseline');return c.json({saved:true,id:a.source.id})}catch(e){return c.json({error:String(e)},400)}});
releaseRoutes.post('/admin/public/:id/restore',async c=>{try{const input=await body(c.req.raw),id=c.req.param('id');if(!Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw Error('版本无效');const store=new CloudWorkspace(c.env.DB!,c.env.MEDIA!,PUBLIC),history=new CloudWorkspace(c.env.DB!,c.env.MEDIA!,input.baseline?'@baseline':PUBLIC);const old=await history.version(id,input.version);if(!old)return c.json({error:'历史版本不存在'},404);return c.json(await store.save(old,input.expectedRevision,'restore'))}catch(e){return c.json({error:String(e)},409)}});
releaseRoutes.post('/admin/jobs',async c=>{
 try{
  const input=await body(c.req.raw),source=validateSource(input.source);
  if(source.imported?.method!=='official'||!source.bodyScope||!source.paragraphs.some(p=>p.text.length>100))throw Error('自动生产需要官方正文及明确范围，摘要不能提交');
  const sourceHash=await digest(JSON.stringify(source)),fingerprint=await digest(source.id+':'+sourceHash+':'+DESIGN_POLICY_VERSION);
  const existing=await c.env.DB!.prepare('SELECT id,status FROM jobs WHERE fingerprint=? AND kind=? ORDER BY created_at DESC LIMIT 1').bind(fingerprint,'editor').first();
  if(existing)return c.json({...existing,deduplicated:true});
  const key='sources/'+source.id+'/'+sourceHash+'.json';await c.env.MEDIA!.put(key,JSON.stringify(input),{httpMetadata:{contentType:'application/json'}});
  const id=crypto.randomUUID();if(!await reserveGeneration(c.env.DB!,'@editor','editor',id,source.id,sourceHash,fingerprint,key))return c.json({error:'今日内容生产额度已用完'},429);
  await c.env.DB!.prepare('INSERT INTO sources(id,hash,body_key,fetched_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,body_key=excluded.body_key,fetched_at=excluded.fetched_at').bind(source.id,sourceHash,key,new Date().toISOString()).run();
  return c.json({id,status:'queued',deduplicated:false});
 }catch(e){return c.json({error:e instanceof Error?e.message:'素材提交失败'},400)}
});
releaseRoutes.post('/admin/jobs/claim',async c=>{
 const lease=crypto.randomUUID();const row=await c.env.DB!.prepare(`UPDATE jobs SET status='running',lease=?,lease_until=? WHERE id=(SELECT id FROM jobs WHERE kind='editor' AND body_key!='' AND (status='queued' OR (status='running' AND lease_until<?)) ORDER BY created_at LIMIT 1) RETURNING *`).bind(lease,Date.now()+1800000,Date.now()).first<any>();
 if(!row)return c.json({job:null});const object=await c.env.MEDIA!.get(row.body_key);if(!object)return c.json({error:'原文快照暂不可用'},503);return c.json({job:row,input:await object.json()});
});

releaseRoutes.post('/admin/jobs/:id/repair',async c=>{
 const input=await body(c.req.raw);const result=await c.env.DB!.prepare("UPDATE jobs SET repairs=repairs+1 WHERE id=? AND lease=? AND status='running' AND lease_until>? AND repairs<2").bind(c.req.param('id'),input.lease,Date.now()).run();return result.meta.changes?c.json({ok:true}):c.json({error:'修复额度或租约无效'},409);
});
releaseRoutes.post('/admin/jobs/:id/fail',async c=>{
 const input=await body(c.req.raw),id=c.req.param('id'),outcome=input.outcome==='content_rejected'?'content_rejected':'system_failed';
 const job=await c.env.DB!.prepare("SELECT id FROM jobs WHERE id=? AND lease=? AND status='running'").bind(id,input.lease).first();if(!job)return c.json({error:'任务租约无效'},409);
 await c.env.MEDIA!.put('failures/'+id+'.json',JSON.stringify({outcome,error:String(input.error||'验收失败'),candidate:input.candidate,createdAt:new Date().toISOString()}));
 const r=await c.env.DB!.prepare("UPDATE jobs SET status=?,error=? WHERE id=? AND lease=? AND status='running'").bind(outcome==='content_rejected'?'rejected':'failed',String(input.error||'验收失败').slice(0,1000),id,input.lease).run();return c.json({saved:!!r.meta.changes,outcome});
});
releaseRoutes.post('/admin/jobs/:id/complete',async c=>{
 try{
  const input=await body(c.req.raw),job=await c.env.DB!.prepare('SELECT * FROM jobs WHERE id=?').bind(c.req.param('id')).first<any>();
  if(!job)return c.json({error:'任务不存在'},404);
  if(job.status==='published')return c.json({published:true,deduplicated:true,id:job.source_id});
  if(job.status!=='running'||job.lease!==input.lease||job.lease_until<Date.now())return c.json({error:'任务租约已失效'},409);
  const answer=input.answer,source=validateSource(answer.source),artifact=validateArtifact(answer.artifact,source);await validateAssets(answer.assets);
  if(source.id!==job.source_id||await digest(JSON.stringify(source))!==job.source_hash||artifact.provenance.sourceHash!==job.source_hash||artifact.provenance.method!=='api'||artifact.provenance.runId!==job.id)throw Error('产物与任务原文不匹配');
  const proof=input.evidence;if(!proof||proof.artifactHash!==await digest(JSON.stringify(artifact))||proof.content?.verdict!=='pass'||!Array.isArray(proof.browser?.results)||!proof.browser.results.length)throw Error('缺少内容与实际操作验收证据');
  for(const block of artifact.blocks)for(const width of [740,360])if(!proof.browser.results.some((r:any)=>r.blockId===block.id&&r.width===width&&r.observed===r.expect?.text))throw Error('每个交互必须通过两个宽度的实际操作验收');
  const head=await c.env.DB!.prepare('SELECT revision FROM documents WHERE owner=? AND id=?').bind(PUBLIC,source.id).first<{revision:number}>(),revision=(head?.revision||0)+1,now=new Date().toISOString();
  const key='published/'+source.id+'/'+job.id+'.json';
  await c.env.MEDIA!.put(key,JSON.stringify({source,artifact,assets:answer.assets||[],tag:'交互新作',votes:0,accent:answer.accent||'#367b73'}),{httpMetadata:{contentType:'application/json'}});
  await c.env.MEDIA!.put('evidence/'+job.id+'.json',JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}});
  const results=await c.env.DB!.batch([
   c.env.DB!.prepare(`INSERT INTO documents(owner,id,revision,body_key,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sources WHERE id=? AND hash=?) AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='running' AND lease=? AND lease_until>?) ON CONFLICT(owner,id) DO UPDATE SET revision=excluded.revision,body_key=excluded.body_key,updated_at=excluded.updated_at WHERE documents.revision=?`).bind(PUBLIC,source.id,revision,key,now,source.id,job.source_hash,job.id,job.lease,Date.now(),revision-1),
   c.env.DB!.prepare(`INSERT OR IGNORE INTO versions(owner,id,revision,body_key,kind,title,instruction,created_at) SELECT owner,id,revision,body_key,'publication',?,?,updated_at FROM documents WHERE owner=? AND id=? AND body_key=?`).bind(source.title,artifact.provenance.prompt,PUBLIC,source.id,key),
   c.env.DB!.prepare(`UPDATE jobs SET status='published' WHERE id=? AND EXISTS(SELECT 1 FROM documents WHERE owner=? AND id=? AND body_key=?)`).bind(job.id,PUBLIC,source.id,key)
  ]);
  if(!results[0].meta.changes)return c.json({error:'原文或发布版本已更新，请重新生成'},409);
  return c.json({published:true,id:source.id,revision});
 }catch(e){return c.json({error:e instanceof Error?e.message:'发布失败'},400)}
});
