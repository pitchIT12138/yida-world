import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'dotenv';
import {generateArtifact,ArtifactRejected} from '../server/generation';
import {reviewCandidate,ReviewUnavailable} from './release-review';
import {plainSource,richSource} from '../src/lib/rich-source';
import {fromContent} from '../src/data/seeds';
import {digest} from '../server/cloud';
import {sourceMedia,assetFromBytes,validateAssets,assetMatchesSource} from '../src/lib/archive';
import {boundedBytes} from '../server/imports';
import {failureOutcome,intakeOutcome} from './production-outcome';
const env={...await readFile('.dev.vars','utf8').then(parse).catch(()=>({})),...process.env};
const base=env.RELEASE_URL?.replace(/\/$/,'');if(!base||!env.RUNNER_TOKEN)throw Error('需要 RELEASE_URL 和 RUNNER_TOKEN');
async function api(path:string,value:unknown){const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+env.RUNNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok)throw Error(d.error||'发布接口失败');return d}
async function official(path:string){if(!env.ZHIHU_ACCESS_SECRET)throw Error('未配置知乎 Access Secret');const r=await fetch('https://developer.zhihu.com'+path,{headers:{Authorization:'Bearer '+env.ZHIHU_ACCESS_SECRET,'X-Request-Timestamp':String(Math.floor(Date.now()/1000))},signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||data.Code!==0)throw Error('知乎接口失败：'+String(data.Message||r.status));return data.Data}
async function media(source:any){const assets=[];let total=0;for(const url of sourceMedia(source)){const u=new URL(url);if(u.protocol!=='https:'||!/(^|\.)zhimg\.com$/.test(u.hostname))throw Error('正文媒体需人工核对：'+url);const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('正文媒体读取失败：'+r.status);const bytes=await boundedBytes(r,20_000_000);total+=bytes.length;if(total>100_000_000)throw Error('正文媒体超出100MB');const asset=await assetFromBytes(url,bytes,r.headers.get('content-type')||'');if(!assetMatchesSource(source,asset))throw Error('正文媒体类型不匹配');assets.push(asset)}return validateAssets(assets)}
const dir='artifacts/pipeline/'+new Date().toISOString().replace(/[:.]/g,'-');await mkdir(dir,{recursive:true});const events:any[]=[];
try{
 if(env.ZHIHU_ACCESS_SECRET){const data=await official('/api/v1/content/hot_list?Limit=20');await api('/api/admin/discover',{items:data.Items.map((x:any)=>({title:x.Title,summary:x.Summary,url:x.Url}))});events.push({discussions:data.Items.length})}else events.push({discussions:'未配置 Access Secret，未同步热榜'});
 // Explicitly choose from official lists. Never turn their summaries into source bodies.
 const kind=process.env.CONTENT_KIND==='knowledge'?'knowledge':'story';const list=await (await fetch('https://api.zhihu.com/km-indep-home/hackathon/v2/'+kind+'/list')).json();if(!Array.isArray(list))throw Error('官方内容列表无效');
 const selected=process.env.WORK_ID?list.filter(x=>String(x.work_id)===process.env.WORK_ID):list.slice(0,1);
 for(const item of selected){const id=String(item.work_id);if(!/^\d{1,30}$/.test(id))continue;const url='https://api.zhihu.com/km-indep-home/hackathon/v2/'+kind+'/'+id;const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('官方正文读取失败');const raw=await response.json();if(typeof raw.content!=='string'||raw.content.length<100)throw Error('接口未提供可用正文');
  const answer={source:fromContent(raw,kind)};if(!answer)throw Error('正文转换失败');
  // fromContent is a legacy excerpt adapter. Preserve every returned paragraph for new production.
  const parsed=(/<(?:p|img|div|figure|table|h[1-6])\b/i.test(raw.content)?richSource:plainSource)(raw.content,{title:raw.chapter_name||item.title,author:raw.author_name||'作者未提供',method:'official'});
  answer.source.sourceUrl=url;answer.source.paragraphs=parsed.paragraphs.map((p:any,i:number)=>({...p,id:answer.source.id+'-p'+i}));answer.source.imported={method:'official',completeness:'partial',notes:['仅包含活动接口本次返回正文，不代表整部作品。']};answer.source.excerpt=true;answer.source.bodyScope='活动接口返回的章节／片段';
  // Retrieval time is snapshot metadata, not part of semantic source identity.
  const input={source:answer.source,assets:await media(answer.source),raw,fetchedAt:new Date().toISOString(),instruction:'基于本次返回的正文，设计鲜明、可操作、沿正文展开的交互。保持来源和片段范围，不补写未提供的情节。'};
  const intake=await api('/api/admin/jobs',input);events.push({...intake,outcome:intakeOutcome(intake)});
 }
 const ownUrls=(env.ZHIHU_OWN_CONTENT_URLS||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,6);
 for(const url of ownUrls){const data=await official('/api/v1/user/content_detail?ContentUrl='+encodeURIComponent(url));const source=richSource(data.Body,{title:data.Title,author:env.ZHIHU_OWNER_NAME||'作者未提供',method:'official',url:data.Url});source.id='own-'+(await digest(data.Url)).slice(0,40);source.sourceUrl=data.Url;source.imported={method:'official',completeness:'confirmed',notes:['Access Secret 所属账号本人作品正文']};source.bodyScope='本人作品接口返回正文';events.push(await api('/api/admin/jobs',{source,raw:data,assets:await media(source),fetchedAt:new Date().toISOString(),instruction:'根据正文设计有表现力的互动解读。'}))}
 for(let n=0;n<6;n++){
  const claimed=await api('/api/admin/jobs/claim',{});if(!claimed.job)break;const {job,input}=claimed;const jobDir=dir+'/'+job.id;await mkdir(jobDir,{recursive:true});await writeFile(jobDir+'/source.json',JSON.stringify(input,null,2));
  try{
   let repairs=job.repairs,prior:any,message='';
   const consumeRepair=async()=>{await api('/api/admin/jobs/'+job.id+'/repair',{lease:job.lease});repairs++};
   for(;;){
    const attemptDir=jobDir+'/attempt-'+repairs;await mkdir(attemptDir,{recursive:true});let call=0;
    const generated=await generateArtifact({source:input.source,selectedParagraphIds:[],tier:'balanced',instruction:input.instruction,...(prior?{repair:{ticket:'internal-server',candidate:prior,message}}:{})},env,{runId:job.id,repairs,signal:AbortSignal.timeout(300000),onRepair:consumeRepair,onOutput:async(text,usage,stage)=>{await writeFile(attemptDir+'/model-'+(++call)+'.json',JSON.stringify({stage,text,usage},null,2))}});
    repairs=generated.repairs;prior=generated.artifact;
    const answer={source:input.source,artifact:prior,assets:input.assets||[]};await writeFile(attemptDir+'/candidate.json',JSON.stringify(answer,null,2));
    try{const evidence=await reviewCandidate(input.source,prior,answer.assets,env,attemptDir);await writeFile(attemptDir+'/evidence.json',JSON.stringify(evidence,null,2));if(evidence.content.verdict!=='pass')throw new ArtifactRejected(evidence.content.findings.join('\n'),prior);events.push({...await api('/api/admin/jobs/'+job.id+'/complete',{lease:job.lease,answer,evidence}),outcome:'published'});break;}
    catch(e){message=String(e);const review=await readFile(attemptDir+'/content-review.json','utf8').catch(()=>'');message+='\n独立评审核对（也可能包含需核实的测试预期，须依据原文和公式判断）：'+review;await writeFile(attemptDir+'/failure.json',JSON.stringify({error:message}));if(!(e instanceof ArtifactRejected)||repairs>=2)throw e;await consumeRepair();}
   }
  }
  catch(e){const outcome=failureOutcome(e);const failure={error:String(e),outcome,...(e instanceof ArtifactRejected?{candidate:e.candidate}:{})};await writeFile(jobDir+'/failure.json',JSON.stringify(failure));await api('/api/admin/jobs/'+job.id+'/fail',{lease:job.lease,...failure});events.push({id:job.id,error:String(e),outcome});if(outcome==='system_failed')process.exitCode=1}
 }

}catch(e){events.push({outcome:'system_failed',error:String(e)});process.exitCode=1}finally{await writeFile(dir+'/run.json',JSON.stringify({createdAt:new Date().toISOString(),events},null,2));console.log(JSON.stringify(events));if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,'## 内容生产结果\n\n'+events.map(e=>'- '+(e.outcome||'来源同步')+': '+(e.id||e.discussions||'')+(e.error?' — '+e.error.slice(0,600):'')).join('\n'))}
