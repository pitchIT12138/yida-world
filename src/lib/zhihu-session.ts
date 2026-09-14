import {writable} from 'svelte/store';
import {answerShare} from './answer-share';
import {validateSource} from './validation';
import type {AnswerSource} from './types';

export type LoginState={phase:'disconnected'|'connecting'|'login'|'ready'|'reading'|'error';authenticated:boolean;error:string;pendingURL:string};
export class SessionError extends Error{constructor(message:string,public code='SESSION_ERROR'){super(message)}}
type Job={url:string;resolve:(source:AnswerSource)=>void;reject:(error:Error)=>void};
/** Page-lifetime login. Closing the composer does not discard the user's QR session. */
export class ZhihuSession{
  private state:LoginState={phase:'disconnected',authenticated:false,error:'',pendingURL:''};
  private store=writable(this.state);
  subscribe=this.store.subscribe;
  private id='';private starting?:Promise<void>;private timer?:ReturnType<typeof setTimeout>;
  private controller=new AbortController();private job?:Job;private reading=false;private checking=false;private generation=0;
  get current(){return this.state}
  private set(value:Partial<LoginState>){this.state={...this.state,...value};this.store.set(this.state)}
  private headers(){return {'Content-Type':'application/json','X-Reader-Client':'yida','X-Reader-Session':this.id}}
  async request(path:string,method='GET',body?:unknown,signal?:AbortSignal){
    const response=await fetch('/api/manual-browser'+path,{method,headers:this.headers(),body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,this.controller.signal]):this.controller.signal});
    if(!response.ok){const data=await response.json();throw new SessionError(data.error||'窗口操作失败',data.code||(response.status===409?'SESSION_BUSY':'SESSION_ERROR'))}return response;
  }
  async start(){
    if(this.id)return;if(this.starting)return this.starting;
    const generation=this.generation;this.set({phase:'connecting',error:''});
    this.starting=(async()=>{
      const data=await(await this.request('','POST',{url:'https://www.zhihu.com/signin'})).json();
      if(!/^[a-f0-9]{64}$/.test(data.id))throw new SessionError('登录窗口返回无效会话。');
      if(generation!==this.generation){void this.release(data.id);return}
      this.id=data.id;this.set({phase:'login',authenticated:false});await this.check();
    })().catch(e=>{if(generation!==this.generation)return;this.set({phase:'error',error:e.message});this.job?.reject(e);this.job=undefined;throw e}).finally(()=>{if(generation===this.generation)this.starting=undefined});
    return this.starting;
  }
  async check(){
    if(!this.id||this.checking||this.reading)return;const generation=this.generation;this.checking=true;clearTimeout(this.timer);
    try{
      const status=await(await this.request('/status')).json();if(generation!==this.generation)return;if(typeof status.authenticated!=='boolean')throw new SessionError('登录状态格式无效。');
      this.set({authenticated:status.authenticated,phase:status.authenticated?'ready':'login',error:''});
      if(status.authenticated)void this.pump();
    }catch(e){
      if(generation!==this.generation)return;
      if(e instanceof SessionError&&e.code==='SESSION_EXPIRED'){this.id='';this.set({authenticated:false,phase:'disconnected'});if(this.job)void this.start().catch(()=>{})}
      else if(!(e instanceof SessionError&&e.code==='SESSION_BUSY')&&!this.controller.signal.aborted)this.set({error:e instanceof Error?e.message:'登录状态读取失败'});
    }finally{if(generation===this.generation){this.checking=false;if(this.id)this.timer=setTimeout(()=>void this.check(),this.state.authenticated?15000:1500)}}
  }
  import(value:string):Promise<AnswerSource>{
    const address=answerShare(value);if(!address)return Promise.reject(new SessionError('请输入知乎回答分享链接。'));
    this.job?.reject(new SessionError('已改为读取新链接。','SUPERSEDED'));
    const result=new Promise<AnswerSource>((resolve,reject)=>{this.job={url:address.url,resolve,reject}});
    this.set({pendingURL:address.url,error:''});
    void this.start().then(()=>this.pump()).catch(()=>{});return result;
  }
  private async pump(){
    if(this.reading||!this.job||!this.id||!this.state.authenticated)return;
    const job=this.job,generation=this.generation;this.reading=true;this.set({phase:'reading',error:''});
    try{
      let data:any;
      for(let attempt=0;;attempt++){
        if(generation!==this.generation)return;
        const response=await fetch('/api/import/answer?url='+encodeURIComponent(job.url),{headers:this.headers(),signal:this.controller.signal});
        data=await response.json();
        // The final QR frame can still be rendering as the reader takes over the same page.
        if(response.status===409&&data.code==='SESSION_BUSY'&&attempt<20){await new Promise(resolve=>setTimeout(resolve,250));continue}
        if(!response.ok)throw new SessionError(data.error||'全文读取失败',data.code);
        break;
      }
      if(generation!==this.generation)return;
      const source=validateSource(data.source);
      if(answerShare(source.sourceUrl||'')?.id!==answerShare(job.url)?.id)throw new SessionError('返回内容不属于所选回答。');
      if(this.job===job){this.job=undefined;this.set({phase:'ready',pendingURL:'',error:''});job.resolve(source)}
    }catch(e){
      if(generation!==this.generation)return;
      if(e instanceof SessionError&&e.code==='SESSION_EXPIRED'){
        this.id='';this.set({phase:'disconnected',authenticated:false});void this.start().catch(()=>{});
      }else if(e instanceof SessionError&&['READER_LOGIN_REQUIRED','PAGE_CHECK_REQUIRED'].includes(e.code)){
        this.set({phase:'login',authenticated:false,error:'请用知乎 App 完成扫码，链接会自动继续读取。'});
        await this.request('/action','POST',{type:'navigate',url:'https://www.zhihu.com/signin'}).catch(()=>{});
      }else if(this.job===job){this.job=undefined;this.set({phase:'ready',pendingURL:'',error:e instanceof Error?e.message:'全文读取失败'});job.reject(e instanceof Error?e:new Error('全文读取失败'))}
    }finally{if(generation===this.generation){this.reading=false;if(this.job&&this.job!==job&&this.state.authenticated)void this.pump();clearTimeout(this.timer);if(this.id)this.timer=setTimeout(()=>void this.check(),1500)}}
  }
  async showLogin(){await this.start();if(this.id){await this.request('/action','POST',{type:'navigate',url:'https://www.zhihu.com/signin'});this.set({phase:'login',authenticated:false});void this.check()}}
  private release(id:string){return fetch('/api/manual-browser',{method:'DELETE',headers:{...this.headers(),'X-Reader-Session':id},keepalive:true}).catch(()=>{})}
  async close(){
    this.generation++;this.starting=undefined;this.checking=false;this.reading=false;clearTimeout(this.timer);this.controller.abort();this.controller=new AbortController();
    this.job?.reject(new SessionError('已断开知乎登录。','CANCELLED'));this.job=undefined;
    const id=this.id;this.id='';this.set({phase:'disconnected',authenticated:false,error:'',pendingURL:''});if(id)await this.release(id);
  }
}
export const zhihuSession=new ZhihuSession();
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>void zhihuSession.close());
