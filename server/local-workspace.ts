// Local Node backend only. This module is never included in the Worker bundle.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Answer,AnswerVersion} from '../src/lib/types';
import {WorkspaceConflict,type WorkspaceStore} from './workspace-store';

export class LocalWorkspace implements WorkspaceStore {
  private db:DatabaseSync;
  constructor(filename:string){
    mkdirSync(dirname(filename),{recursive:true,mode:0o700});this.db=new DatabaseSync(filename);chmodSync(filename,0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS answers(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,document TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,answer_id TEXT NOT NULL,kind TEXT NOT NULL,document TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS versions_answer ON versions(answer_id,id);
      CREATE TABLE IF NOT EXISTS assets(hash TEXT PRIMARY KEY,data TEXT NOT NULL);`);
  }
  private decode(document:string):Answer{
    const answer=JSON.parse(document) as Answer;
    answer.assets=(answer.assets||[]).map(asset=>({...asset,data:String((this.db.prepare('SELECT data FROM assets WHERE hash=?').get(asset.sha256) as {data:string}|undefined)?.data||'')}));
    return answer;
  }
  async list(){return (this.db.prepare('SELECT document FROM answers ORDER BY updated_at DESC').all() as {document:string}[]).map(row=>this.decode(row.document))}
  async save(input:Answer,expectedRevision:number,kind:string){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const previous=this.db.prepare('SELECT revision FROM answers WHERE id=?').get(input.source.id) as {revision:number}|undefined;
      if((previous?.revision||0)!==expectedRevision)throw new WorkspaceConflict();
      const updatedAt=new Date().toISOString();
      const answer:Answer={...input,workspace:{idea:'',selectedParagraphIds:[],...input.workspace,revision:expectedRevision+1,updatedAt}};
      for(const asset of answer.assets||[])this.db.prepare('INSERT OR IGNORE INTO assets(hash,data) VALUES(?,?)').run(asset.sha256,asset.data);
      const document=JSON.stringify({...answer,assets:(answer.assets||[]).map(({data,...asset})=>asset)});
      this.db.prepare('INSERT INTO answers(id,revision,document,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,document=excluded.document,updated_at=excluded.updated_at').run(answer.source.id,answer.workspace!.revision,document,updatedAt);
      if(kind!=='draft'||!previous)this.db.prepare('INSERT INTO versions(answer_id,kind,document,created_at) VALUES(?,?,?,?)').run(answer.source.id,kind,document,updatedAt);
      this.db.exec('COMMIT');return answer;
    }catch(e){this.db.exec('ROLLBACK');throw e}
  }
  async versions(id:string):Promise<AnswerVersion[]>{
    return (this.db.prepare('SELECT id,kind,document,created_at FROM versions WHERE answer_id=? ORDER BY id DESC').all(id) as {id:number;kind:string;document:string;created_at:string}[]).map(row=>{
      const answer=JSON.parse(row.document) as Answer;return{id:row.id,kind:row.kind,createdAt:row.created_at,instruction:answer.workspace?.idea||answer.artifact?.provenance.prompt||'',title:answer.source.title};
    });
  }
  async version(id:string,version:number){const row=this.db.prepare('SELECT document FROM versions WHERE answer_id=? AND id=?').get(id,version) as {document:string}|undefined;return row?this.decode(row.document):undefined}
  close(){this.db.close()}
}
