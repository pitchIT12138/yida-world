import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'acorn';
import { seedAnswers } from '../src/data/seeds';
import { validateArtifact } from '../src/lib/validation';
import { argument } from './generation-api';
import { DESIGN_POLICY_VERSION } from '../src/lib/design-policy';
const file=argument('file');
if(!file)throw new Error('请传入当前会话实际创作的 JSON 文件 --file');
const raw=JSON.parse(await readFile(file,'utf8'));
const envelope=argument('source')?JSON.parse(await readFile(argument('source'),'utf8')):undefined;
const source=envelope?(envelope.answer?.source||envelope.source||envelope):seedAnswers.find(a=>a.source.id===raw.answerId)?.source;
if(!source)throw new Error('原文不存在');
const artifact={...raw,provenance:{method:'codex',tier:'session',model:'Codex 当前会话（未记录具体模型 ID）',
  runId:'codex-'+randomUUID(),sourceHash:createHash('sha256').update(JSON.stringify(source)).digest('hex'),
  createdAt:new Date().toISOString(),baselineVersion:DESIGN_POLICY_VERSION,prompt:argument('instruction')||'用户要求：先使用自己作为 Agent 进行默认生成。读取此文章，视觉与交互只使用 HTML/CSS/JS/SVG/Canvas；不使用外部素材，保持原文，先编排整篇阅读路线，再让不同片段自然融入正文；记录每处风格、位置理由、实现及验收约定，以逐步讲解和真实操作展示设计。'}};
validateArtifact(artifact,source);
for(const block of artifact.blocks)parse(block.js,{ecmaVersion:2022,sourceType:'script'});
await mkdir('artifacts/candidates',{recursive:true});
const output='artifacts/candidates/'+source.id+'.json';
await writeFile(output,JSON.stringify({source,artifact},null,2));
console.log(output);
