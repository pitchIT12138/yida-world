import {mkdir,writeFile}from 'node:fs/promises';
import {seedAnswers}from '../src/data/seeds';
import {argument,requestGeneration}from './generation-api';
const ids=['hnsw','camera','ledger','mars','knowledge-1523701957479239680'];
const records:any[]=[];
for(const id of ids){
  const source=seedAnswers.find(x=>x.source.id===id)!.source;
  let current;
  for(const phase of ['generate','modify']){
    if(phase==='modify'&&!current){records.push({id,phase,status:'skipped',reason:'首次生成失败'});continue}
    const started=Date.now();
    try{
      current=await requestGeneration(argument('base','http://127.0.0.1:5173'),{source,current,selectedParagraphIds:[],instruction:phase==='generate'?'读懂这篇文章，用代码创造适合它的紧凑交互。':'保留文章观点，换一种更直接操作对象的表达方式。',tier:'balanced'});
      records.push({id,phase,status:'structurally_valid',elapsedMs:Date.now()-started,runId:current.provenance.runId,usage:current.provenance.usage,model:current.provenance.model});
      await mkdir('artifacts/benchmark-candidates',{recursive:true});
      await writeFile('artifacts/benchmark-candidates/'+id+'-'+phase+'.json',JSON.stringify({source,artifact:current},null,2));
    }catch(e){records.push({id,phase,status:'failed',elapsedMs:Date.now()-started,error:e instanceof Error?e.message:'failed'})}
    // Avoid exhausting the default per-minute limit during a deliberate batch.
    await new Promise(r=>setTimeout(r,16000));
  }
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/benchmark.json',JSON.stringify({createdAt:new Date().toISOString(),scope:'真实服务端调用与结构校验；浏览器运行、表达质量和价格需要另行验收',records},null,2));
console.log('已保存 artifacts/benchmark.json；未将结构检查冒充运行质量评测。');
