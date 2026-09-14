import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {argument} from './generation-api';
const id=argument('id','studio-3d0c8ad5-ea44-4f61-9530-f086b7135a6f');
const base=argument('base','http://127.0.0.1:4217');
const {source}=JSON.parse(await readFile('src/data/generated/'+id+'.json','utf8'));
const dir='artifacts/deepseek-evaluation/'+new Date().toISOString().replace(/[:.]/g,'-');
await mkdir(dir,{recursive:true});
const input={source,selectedParagraphIds:[],tier:'balanced',instruction:'依据这篇真实原文，重新设计沿正文展开的交互，先解释年收入，再解释逐年现金流与折现现值。初始年收入65700元、30年，原文折现率缺失，明确使用4%演示值而非当前贷款利率。允许调整收入、支出、增长、年限、折现率，提供复位，处理0%折现率和负现金流。用年末现金流、可核对的公式与逐年明细区分名义累计与现值，不能把现值解释为人的价值。至少在对应正文旁分开收入计算和折现两处表达，避免大段代码文字出现在阅读页面。保留来源和作者观点，新增假设明确标注。'};
await writeFile(dir+'/request.json',JSON.stringify(input,null,2));
const events:unknown[]=[];const started=Date.now();let artifact;
try{
 const response=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(125000)});
 if(!response.ok)throw Error('HTTP '+response.status+': '+(await response.json()).error);
 const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
 for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
  while((end=buffer.indexOf('\n\n'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of raw.split('\n'))if(line.startsWith('data: ')){const e=JSON.parse(line.slice(6));if(e.type==='result')artifact=e.artifact;else{events.push({...e,elapsedMs:Date.now()-started});console.log(e.message||e.type)}if(e.type==='error')throw Error(e.message)}}
 }
 if(!artifact)throw Error('No complete artifact returned');
 await writeFile(dir+'/candidate.json',JSON.stringify({source,artifact},null,2));
 await writeFile(dir+'/result.json',JSON.stringify({status:'structurally_valid',elapsedMs:Date.now()-started,events,provenance:artifact.provenance},null,2));console.log('Candidate: '+dir);
}catch(e){await writeFile(dir+'/result.json',JSON.stringify({status:'failed',elapsedMs:Date.now()-started,events,error:e instanceof Error?e.message:String(e)},null,2));console.log('Failed evaluation: '+dir);process.exitCode=1}
