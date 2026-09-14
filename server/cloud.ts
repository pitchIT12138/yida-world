import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import type {Answer,AnswerVersion} from '../src/lib/types';
import {WorkspaceConflict,type WorkspaceStore} from './workspace-store';
export type CloudBindings={DB?:D1Database;MEDIA?:R2Bucket};
export async function digest(value:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function day(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10)}
export class CloudWorkspace implements WorkspaceStore {
 constructor(private db:D1Database,private bucket:R2Bucket,private owner:string){}
 async read(key:string):Promise<Answer>{const obj=await this.bucket.get(key);if(!obj)throw Error('保存的内容暂时无法读取，请重试。');return obj.json<Answer>()}
 async list(){const rows=await this.db.prepare('SELECT body_key FROM documents WHERE owner=? ORDER BY updated_at DESC LIMIT 100').bind(this.owner).all<{body_key:string}>();return Promise.all(rows.results.map(r=>this.read(r.body_key)))}
 async save(input:Answer,expected:number,kind:string){
  const updatedAt=new Date().toISOString(),id=input.source.id,revision=expected+1;
  const answer={...input,workspace:{idea:'',selectedParagraphIds:[],...input.workspace,revision,updatedAt}};
  const bodyKey=`documents/${await digest(this.owner)}/${id}/${revision}-${crypto.randomUUID()}.json`;
  await this.bucket.put(bodyKey,JSON.stringify(answer),{httpMetadata:{contentType:'application/json'}});
  // The conditional write and history insertion share one D1 transaction. The unique blob key
  // identifies this winning writer even when another request raced for the same revision.
  const results=await this.db.batch([
   this.db.prepare(`INSERT INTO documents(owner,id,revision,body_key,updated_at) SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM documents WHERE owner=? AND id=?) ON CONFLICT(owner,id) DO UPDATE SET revision=excluded.revision,body_key=excluded.body_key,updated_at=excluded.updated_at WHERE documents.revision=?`).bind(this.owner,id,revision,bodyKey,updatedAt,expected,this.owner,id,expected),
   this.db.prepare(`INSERT INTO versions(owner,id,revision,body_key,kind,title,instruction,created_at) SELECT owner,id,revision,body_key,?,?,?,updated_at FROM documents WHERE owner=? AND id=? AND body_key=?`).bind(kind,input.source.title,input.workspace?.idea||input.artifact?.provenance.prompt||'',this.owner,id,bodyKey)
  ]);
  if(!results[0].meta.changes){await this.bucket.delete(bodyKey);throw new WorkspaceConflict()}
  return answer;
 }
 async versions(id:string):Promise<AnswerVersion[]>{const rows=await this.db.prepare('SELECT revision AS id,kind,title,instruction,created_at AS createdAt FROM versions WHERE owner=? AND id=? ORDER BY revision DESC LIMIT 100').bind(this.owner,id).all<AnswerVersion>();return rows.results}
 async version(id:string,revision:number){const row=await this.db.prepare('SELECT body_key FROM versions WHERE owner=? AND id=? AND revision=?').bind(this.owner,id,revision).first<{body_key:string}>();return row?this.read(row.body_key):undefined}
}
export async function reserveGeneration(db:D1Database,owner:string,kind:'user'|'editor',id:string,sourceId:string,sourceHash:string,fingerprint:string,bodyKey=''){
 const currentDay=day();const result=await db.prepare(`INSERT OR IGNORE INTO jobs(id,owner,day,kind,status,fingerprint,source_id,source_hash,body_key,repairs,created_at)
 SELECT ?,?,?,?,'queued',?,?,?,?,0,? WHERE (SELECT count(*) FROM jobs WHERE day=? AND kind=?)<? AND (SELECT count(*) FROM jobs WHERE day=? AND kind=? AND owner=?)<?`).bind(id,owner,currentDay,kind,fingerprint,sourceId,sourceHash,bodyKey,new Date().toISOString(),currentDay,kind,kind==='user'?20:6,currentDay,kind,owner,kind==='user'?3:6).run();
 return result.meta.changes===1;
}
