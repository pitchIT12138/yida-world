import type {Answer,AnswerVersion} from './types';
const headers={'Content-Type':'application/json','X-Workspace-Client':'yida'};
async function request(path:string,options:RequestInit={}){
  const response=await fetch('/api/workspace'+path,{...options,headers});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'后台保存失败');return body;
}
export const loadWorkspace=():Promise<Answer[]>=>request('');
export const saveWorkspace=(answer:Answer,expectedRevision:number,kind:string):Promise<Answer>=>request('/'+encodeURIComponent(answer.source.id),{method:'POST',body:JSON.stringify({answer,expectedRevision,kind})});
export const loadVersions=(id:string):Promise<AnswerVersion[]>=>request('/'+encodeURIComponent(id)+'/versions');
export const loadVersion=(id:string,version:number):Promise<Answer>=>request('/'+encodeURIComponent(id)+'/versions/'+version);
