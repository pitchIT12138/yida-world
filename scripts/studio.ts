import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {previewCleanup,cleanedRecord,type CleanupPlan} from '../studio/cleanup';
import {StudioStore} from '../studio/store';
import type {StudioAnswer} from '../studio/types';
import {selectInteractions,validateLibraryReferences} from '../src/lib/interaction-library';
import {publicCandidate} from '../server/curation';
import {verifyInteractive,type InteractionCheck} from '../studio/verify';
import {argument} from './generation-api';
const command=process.argv[2],id=argument('id'),db=new StudioStore(argument('db','.data/studio.sqlite'));
try{
 const list=await db.list() as StudioAnswer[];
 if(command==='seed'){
 for(const file of (await readdir('src/data/generated')).filter(f=>f.endsWith('.json'))){const item=JSON.parse(await readFile('src/data/generated/'+file,'utf8'));if(list.some(a=>a.source.id===item.source.id)){console.log('保留已有记录：'+item.source.id);continue}const record={...item,votes:0,accent:'#477866',tag:'精选回答',workspace:{revision:0,idea:'',selectedParagraphIds:[],updatedAt:''},studio:{notes:[],feedback:'',tags:[],status:'accepted'}} as StudioAnswer;if(process.argv.includes('--apply'))await db.saveRecord(record,0,'seed');console.log((process.argv.includes('--apply')?'已导入：':'预览导入：')+record.source.id)}
 }else if(command==='list'){console.log(JSON.stringify(list.map(a=>({id:a.source.id,title:a.source.title,status:a.studio.status,revision:a.workspace?.revision})),null,2))}
 else{
 const a=list.find(a=>a.source.id===id);if(!a)throw Error('回答不存在，先运行 npm run studio -- list');
 if(command==='clean'){
 const plan=JSON.parse(await readFile(argument('file'),'utf8')) as CleanupPlan;const diff=previewCleanup(a,plan);
 if(!process.argv.includes('--apply'))console.log(JSON.stringify(diff,null,2));
 else{const dir='.data/cleaning/'+id;await mkdir(dir,{recursive:true});await writeFile(dir+'/'+plan.expectedRevision+'.json',JSON.stringify({before:a,plan,diff},null,2),{flag:'wx'});await db.saveRecord(cleanedRecord(a,plan),plan.expectedRevision,'clean');console.log('清洗已保存，原文与差异留存：'+dir)}
 }else if(command==='export'){
 const versions=await db.versions(id);const history=await Promise.all(versions.map(v=>db.version(id,v.id)));
 const output=argument('out','.data/handoffs/'+id+'.json');await mkdir('.data/handoffs',{recursive:true});
 await writeFile(output,JSON.stringify({answer:a,expectedRevision:a.workspace!.revision,history,interactionLibrary:selectInteractions([a.source.title,a.workspace?.idea,a.studio.feedback,...a.studio.tags,...a.studio.notes.map(n=>n.text),...a.source.paragraphs.map(p=>p.text)].join(' ')),instructions:'先阅读当前原文、备注和历史，再复用或改编组件；不要沿用示例事实。输出 AnswerArtifact，记录 libraryReferences；通过 record-session --source 本文件记录真实会话来源。'},null,2));console.log(output);
 }else if(command==='import'){
 const input=JSON.parse(await readFile(argument('file'),'utf8'));if(Number(argument('revision'))!==a.workspace!.revision)throw Error('请提供导出时的 --revision，后台已变化时重新导出');
 if(input.source&&JSON.stringify(input.source)!==JSON.stringify(a.source))throw Error('候选原文与当前原文不一致');
 a.artifact=input.artifact;validateLibraryReferences(a.artifact!);a.reference=undefined;a.studio.status='candidate';a.studio.review=undefined;await db.saveRecord(a,a.workspace!.revision,'generation');console.log('候选已写回，请在工作台刷新预览');
 }else if(command==='accept'){
 const candidate=publicCandidate(a);const review=argument('review');if(!review.trim())throw Error('必须提供 --review 实际内容检查说明');
 const checks=JSON.parse(await readFile(argument('checks'),'utf8')) as InteractionCheck[];
 const evidence=await verifyInteractive(candidate.artifact,checks,candidate.assets,argument('evidence-dir','artifacts/reviews/'+candidate.artifact.provenance.runId));const artifactHash=createHash('sha256').update(JSON.stringify(candidate.artifact)).digest('hex');
 await mkdir('artifacts/reviews',{recursive:true});await mkdir('src/data/generated',{recursive:true});
 await writeFile('artifacts/reviews/'+candidate.artifact.provenance.runId+'.json',JSON.stringify({...evidence,artifactHash,runId:candidate.artifact.provenance.runId,review},null,2));
 // Recheck revision after browser work to avoid publishing a superseded draft.
 const latest=(await db.list()).find(x=>x.source.id===id);if(latest?.workspace?.revision!==a.workspace?.revision)throw Error('验收期间回答有变化，请重新验收');
 await writeFile('src/data/generated/'+id+'.json',JSON.stringify(candidate,null,2));a.studio.status='accepted';a.studio.review=review;await db.saveRecord(a,a.workspace!.revision,'accept');console.log('已加入产品精选；请运行 npm run baselines');
 }else throw Error('支持 list / export --id / import --id --file --revision / accept --id --checks --review');
 }
}finally{db.close()}
