import {Hono} from 'hono';
import type {StudioStore} from './store';
import {WorkspaceConflict} from '../server/workspace-store';
import {boundedBytes} from '../server/imports';
export function studioAPI(store:StudioStore){
 const api=new Hono();
 api.use('*',async(c,next)=>{if(c.req.header('X-Studio-Client')!=='yida-studio'||(c.req.header('origin')&&c.req.header('origin')!==new URL(c.req.url).origin))return c.json({error:'请从本地工作台访问'},403);await next()});
 api.get('/',async c=>c.json(await store.list()));
 api.get('/:id/versions',async c=>c.json(await store.versions(c.req.param('id'))));
 api.get('/:id/versions/:version',async c=>{const a=await store.version(c.req.param('id'),Number(c.req.param('version')));return a?c.json(a):c.json({error:'版本不存在'},404)});
 api.post('/:id',async c=>{try{const b=JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(c.req.raw.body),150000000)));if(b.answer?.source?.id!==c.req.param('id'))throw Error('回答标识不匹配');if(!['draft','source','import','media'].includes(b.kind))throw Error('无效操作');const old=(await store.list()).find(a=>a.source.id===b.answer.source.id) as any;b.answer.artifact=old?.artifact;b.answer.reference=old?.reference;b.answer.studio.status=old?.studio.status||'draft';return c.json(await store.saveRecord(b.answer,b.expectedRevision,b.kind))}catch(e){return c.json({error:e instanceof Error?e.message:'保存失败'},e instanceof WorkspaceConflict?409:400)}});
 return api;
}
