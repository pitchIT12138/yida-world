import {readFile,readdir,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateArtifact,validateSource} from '../src/lib/validation';
const catalog:Record<string,unknown>={};
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
await mkdir('docs/baselines',{recursive:true});await mkdir('artifacts/baseline-history',{recursive:true});
await mkdir('src/data/curated-index',{recursive:true});
for(const file of (await readdir('src/data/generated')).filter(f=>f.endsWith('.json'))){
  const {source,artifact,assets}=JSON.parse(await readFile('src/data/generated/'+file,'utf8'));
  validateSource(source);validateArtifact(artifact,source);
  await writeFile('src/data/curated-index/'+file,JSON.stringify({source,artifact,hasSavedMedia:!!assets?.length}));
  if(!artifact.design)continue;
  const codeHashes=Object.fromEntries(artifact.blocks.map((b:any)=>[b.id,sha({html:b.html,css:b.css,js:b.js})]));
  const snapshot={sourceHash:sha(source),design:artifact.design,codeHashes};
  const identity=sha(snapshot),historyFile=source.id+'-'+identity.slice(0,16)+'.json';
  try{await access('artifacts/baseline-history/'+historyFile)}catch{await writeFile('artifacts/baseline-history/'+historyFile,JSON.stringify({...snapshot,recordedFrom:artifact.provenance},null,2))}
  catalog[source.id]={...snapshot,artifactRunId:artifact.provenance.runId,historyFile};
  const d=artifact.design;
  const lines=['# '+source.title,'','基线版本：'+d.version,'','## 整篇表达','',d.intent,'',d.readingFlow,'','作者语气：'+d.voice,'','## 风格约定','',
    '- 配色：'+d.style.palette.join('、'),'- 字体：'+d.style.typography,'- 材质与留白：'+d.style.surface,'- 动作：'+d.style.motion,'','## 设计决策',''];
  for(const decision of d.decisions)lines.push('### '+decision.title,'',decision.reason,'','取舍：'+decision.tradeoff,'');
  lines.push('## 片段分工','');
  for(const component of d.components){const b=artifact.blocks.find((b:any)=>b.id===component.blockId);lines.push('### '+b.title,'','- 稳定 ID：'+b.id,'- 位置：'+b.afterParagraphId,'- 形式：'+b.kind,'','表达任务：'+component.purpose,'','放在这里的理由：'+component.whyHere,'','操作与反馈：'+component.interaction,'','实现约定：'+component.implementation,'','验收：','',...component.checks.map((c:string)=>'- '+c),'','代码指纹：'+codeHashes[b.id],'')}
  lines.push('## 延续与修订','','未来模型读取该基线和当前产物。用户的新意图优先；局部修改保留其他片段与整篇风格。改变约定时提升版本并说明取舍。重新验收和运行 npm run baselines 后，历史快照追加保存，已有快照不覆盖。','');
  await writeFile('docs/baselines/'+source.id+'.md',lines.join('\n'));
}
await writeFile('src/data/baselines/catalog.json',JSON.stringify(catalog,null,2));
console.log('已沉淀 '+Object.keys(catalog).length+' 篇基线，包含组件代码指纹和不可覆盖的历史快照。');
