import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
export function cloudFixture(){
 const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
 const prepare=(sql:string,args:unknown[]=[])=>({bind(...values:unknown[]){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args as any[])||null},async all(){return {results:sqlite.prepare(sql).all(...args as any[]),success:true}},async run(){const r=sqlite.prepare(sql).run(...args as any[]);return {success:true,meta:{changes:Number(r.changes)}}}});
 const DB={prepare,async batch(statements:any[]){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows}catch(e){sqlite.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 const objects=new Map<string,string>();const MEDIA={async get(key:string){const value=objects.get(key);return value===undefined?null:{json:async()=>JSON.parse(value),text:async()=>value,body:value}},async put(key:string,value:string){objects.set(key,value)},async delete(key:string){objects.delete(key)}} as unknown as R2Bucket;
 return {DB,MEDIA,sqlite,objects};
}
