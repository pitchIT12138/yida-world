import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'dotenv';
import {generateArtifact} from '../server/generation';
const env=parse(await readFile('.dev.vars','utf8'));
const tasks=[
 ['studio-baa43112-f206-4e48-86d1-3d1427326601','重构为更有表现力的人口结构与供养关系体验。分散在相关正文旁，用年份结构切换、生育情景选择、供养人数直接操作、生产率敏感性等不同表达帮助理解；不必沿用旧版卡片。必须覆盖三种口径，2025/2030/2035仅为离散节点。政策转移人数只作为演示，不假装精算模型。把原文四舍五入比例与复算区分，不能把60+和65+相加。原文事实与原文预测和新增情景分别标明。'],
 ['studio-3d0c8ad5-ea44-4f61-9530-f086b7135a6f','让读者操作可见的现金流与时间，不仅填表看数。先工时与工资，再逐年名义净现金流与折现后现金流对照，点击年份查看贡献，允许收入支出增长年限折现率联动与复位。收入默认65700，30年，4%明确是演示参数，支出0也是演示。收入模块变为8小时后下游立即为43800，不能失联。可在下游直接编辑年收入并同步来源模式，所有显示与计算范围一致。年末现金流公式净收入_t=(首年收入-首年支出)*(1+g)^(t-1)，PV=sum净收入_t/(1+r)^t；如果支出增长采用其他规则须展示清楚。0%、负现金流均须正确。金额不能逐位断行。原文缺失折现率不能补成当前贷款利率，现值不能称人的价值。'],
 ['story-1747681485547843585','用有氛围且读者可操作的叙事场景重构。不要只做文字切换卡。沿原文时点展示主人公看到的模糊轮廓、读者已知的身份与弹幕，两份信息如何产生相反判断。可使用代码绘制门口、楼层选择、人物剪影，让操作逐步揭示证据；文字清晰，不用生理视力模拟。所有事件与引用必须在此片段内，不能补结局，不创造玩家选择会改变原文结局的错觉。原文初见大Boss在开头已经揭示，可说明开头与正文时点区别。提供按键/触摸与重置。']
];
for(const [id,idea]of tasks){
 const dir='artifacts/release-upgrades/'+id;await mkdir(dir,{recursive:true});
 const handoff=JSON.parse(await readFile('.data/handoffs/'+id+'.json','utf8')),answer=handoff.answer;
 const input={source:answer.source,previous:{source:answer.source,artifact:answer.artifact},selectedParagraphIds:[],instruction:idea+' 已有内容核对记录：'+answer.studio.review+' 整体设计允许大胆重做，但不减少已有必要信息。提供确实能观察到变化的元素和稳定的 DOM id，便于自动验收。',tier:'balanced' as const};
 await writeFile(dir+'/request.json',JSON.stringify(input,null,2));const started=Date.now();
 try{const result=await generateArtifact(input,{...env,MAX_OUTPUT_TOKENS:'20000'},{runId:crypto.randomUUID(),signal:AbortSignal.timeout(300000),onStatus:e=>console.log(id+': '+(e.type==='status'?e.message:e.type))});await writeFile(dir+'/candidate.json',JSON.stringify({source:answer.source,artifact:result.artifact},null,2));await writeFile(dir+'/result.json',JSON.stringify({expectedRevision:handoff.expectedRevision,elapsedMs:Date.now()-started,repairs:result.repairs,provenance:result.artifact.provenance},null,2));console.log(id+': candidate ready');}
 catch(e){await writeFile(dir+'/failure.json',JSON.stringify({error:String(e),elapsedMs:Date.now()-started}));console.error(id+': '+String(e))}
}
