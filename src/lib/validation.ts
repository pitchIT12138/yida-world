import type { AnswerArtifact, AnswerSource, GenerationInput } from './types';
import { sanitizeRichHTML, MAX_SOURCE_HTML, mediaURLs, richText } from './rich-source';
import {blockImageReferences} from './block-media';
const identifier = /^[a-zA-Z0-9_-]{1,80}$/;
const isId = (value:unknown):value is string => typeof value==='string' && identifier.test(value);
function fail(message: string): never { throw new Error(message); }
function str(v: unknown, max: number, label: string, empty = false): asserts v is string {
  if (typeof v !== 'string' || (!empty && !v.trim()) || v.length > max) fail(label + '格式或长度不正确');
}
export function validateSource(v: unknown): AnswerSource {
  if (!v || typeof v !== 'object') fail('缺少原文');
  const s = v as AnswerSource;
  if (!isId(s.id)) fail('回答 ID 无效');
  str(s.title, 160, '标题'); str(s.author, 80, '作者'); str(s.bio, 200, '简介', true);
  str(s.avatar, 20, '头像文字');
  for(const key of ['fetchedAt','publishedAt'] as const)if(s[key]!==undefined&&(!Number.isFinite(Date.parse(s[key]!))||s[key]!.length>40))fail('来源时间无效');
  if(s.bodyScope!==undefined)str(s.bodyScope,300,'正文范围');
  if(s.sourceUrl){try{if(new URL(s.sourceUrl).protocol!=='https:')fail('来源链接必须为 HTTPS')}catch{fail('来源链接无效')}}
  if (!['original','knowledge','story','personal','zhihu'].includes(s.origin)) fail('来源无效');
  if(s.imported){
    if(!['clipboard','file','url','official'].includes(s.imported.method)||!['unverified','confirmed','partial'].includes(s.imported.completeness))fail('导入记录无效');
    if(!Array.isArray(s.imported.notes)||s.imported.notes.length>30)fail('导入提示无效');
    for(const note of s.imported.notes)str(note,500,'导入提示');
  }
  const maxParagraphs=s.imported?10000:60;
  if (!Array.isArray(s.paragraphs) || !s.paragraphs.length || s.paragraphs.length > maxParagraphs) fail('请提供 1–'+maxParagraphs+' 个段落，内容没有截断');
  const ids = new Set<string>();
  for (const p of s.paragraphs) {
    if (!p || !isId(p.id) || ids.has(p.id)) fail('段落 ID 无效或重复');
    ids.add(p.id); str(p.text, s.imported?1_000_000:8000, '段落');
    if(p.html!==undefined){str(p.html,MAX_SOURCE_HTML,'富文本');if(sanitizeRichHTML(p.html)!==p.html)fail('富文本包含未允许的内容，请重新通过正文导入');}
  }
  if (s.paragraphs.reduce((n,p) => n + p.text.length,0) > (s.imported?1_000_000:18000)) fail(s.imported?'原文超过 100 万字，内容没有截断':'原文请控制在 18,000 字以内');
  if(s.paragraphs.reduce((n,p)=>n+(p.html?.length||0),0)>MAX_SOURCE_HTML)fail('富文本原文超过 4 MB，内容没有截断');
  return s;
}
export function validateInput(v: unknown): GenerationInput {
  if (!v || typeof v !== 'object') fail('请求格式不正确');
  const r = v as GenerationInput;
  validateSource(r.source);
  str(r.instruction, 2000, '修改要求');
  if (!['balanced','frontier'].includes(r.tier)) fail('模型档位不存在');
  if (!Array.isArray(r.selectedParagraphIds) || r.selectedParagraphIds.some(id => !r.source.paragraphs.some(p => p.id === id))) fail('选区不属于当前回答');
  const indices = [...new Set(r.selectedParagraphIds.map(id => r.source.paragraphs.findIndex(p => p.id === id)))].sort((a,b)=>a-b);
  if (indices.some((n,i)=>i > 0 && n !== indices[i-1]+1)) fail('请选择连续段落');
  if (r.current) validateArtifact(r.current, r.source);
  if(r.previous){validateSource(r.previous.source);validateArtifact(r.previous.artifact,r.previous.source);if(r.previous.source.id!==r.source.id)fail('历史参考不属于当前回答')}
  return r;
}
export function validateArtifact(v: unknown, source: AnswerSource, selected: string[] = []): AnswerArtifact {
  if (!v || typeof v !== 'object') fail('模型没有返回有效结果');
  const a = v as AnswerArtifact;
  if (a.version !== 1 || a.answerId !== source.id) fail('结果与当前回答不匹配');
  str(a.explanation, 2000, '加工说明');
  if (!Array.isArray(a.blocks) || !a.blocks.length || a.blocks.length > 24) fail('每篇回答应有 1–24 个表达片段');
  const anchors = new Set(selected.length ? selected : source.paragraphs.map(p => p.id));
  const ids = new Set<string>();
  const replaced = new Set<string>();
  const sourceImages = new Set(source.paragraphs.flatMap(p=>p.html?mediaURLs(p.html):[]));
  for (const b of a.blocks) {
    if (!b || !isId(b.id) || ids.has(b.id)) fail('交互块 ID 无效或重复');
    if(b.mediaUrls!==undefined&&(!Array.isArray(b.mediaUrls)||b.mediaUrls.length>24||b.mediaUrls.some(u=>typeof u!=='string'||!sourceImages.has(u))))fail('交互图片必须引用本篇原媒体');
    str(b.html,80000,'HTML');
    const imageRefs=blockImageReferences(b.html);
    if(imageRefs.some(url=>!b.mediaUrls?.includes(url))||b.mediaUrls?.some(url=>!imageRefs.includes(url)))fail('交互图片声明必须与实际图片引用一致');
    if(b.replaceParagraphIds!==undefined){
      if(!Array.isArray(b.replaceParagraphIds)||!b.mediaUrls?.length||b.replaceParagraphIds.length>24)fail('替代媒体段落格式无效');
      for(const id of b.replaceParagraphIds){
        const p=source.paragraphs.find(p=>p.id===id);
        if(!p?.html||!anchors.has(id)||replaced.has(id)||!/<img\b/.test(p.html)||richText(p.html).replace(/\[图片[^\]]*\]/g,'').trim()||mediaURLs(p.html).some(u=>!b.mediaUrls!.includes(u)))fail('只能折叠本篇独占的纯图片段落');
        replaced.add(id);
      }
    }

    if (!b || !isId(b.id) || ids.has(b.id)) fail('交互块 ID 无效或重复');
    ids.add(b.id);
    if (!anchors.has(b.afterParagraphId)) fail('交互块超出了选定段落');
    str(b.title, 120, '交互标题'); str(b.html, 80000, 'HTML'); str(b.css, 60000, 'CSS', true); str(b.js, 100000, 'JavaScript', true);
    if (/<\s*(script|iframe|object|embed|base|meta|link)\b/i.test(b.html) || /\son[a-z]+\s*=/i.test(b.html)) fail('HTML 中包含未允许的脚本或嵌入标签');
    if (/javascript\s*:/i.test(b.html) || /<\/script/i.test(b.js) || /<\/style/i.test(b.css)) fail('代码中包含无效的文档边界');
    if(b.kind!==undefined&&!['inline','figure','experience','aside'].includes(b.kind))fail('表达片段布局无效');
    if (!Number.isFinite(b.height) || b.height < 36 || b.height > 1000) fail('表达片段高度应在 36–1000 之间');
  }
  if (!Array.isArray(a.bindings) || a.bindings.length > 12) fail('正文联动格式无效');
  const bindingIds = new Set<string>();
  for (const b of a.bindings) {
    if (!b || !isId(b.id) || bindingIds.has(b.id) || !anchors.has(b.paragraphId)) fail('正文联动超出范围');
    bindingIds.add(b.id); str(b.label, 80, '联动标签'); str(b.initial, 160, '联动初始值',true);
    if(b.hidden!==undefined&&typeof b.hidden!=='boolean')fail('正文联动显示设置无效');
  }
  if (!Array.isArray(a.scene) || a.scene.length > 48) fail('变化演示格式无效');
  const targets = new Set([...anchors, ...ids]);
  for (const s of a.scene) {
    if (!['focus','highlight','annotate','reveal','compare','restore'].includes(s.action) || !targets.has(s.target)) fail('演示镜头超出当前回答');
    if(s.text !== undefined) str(s.text,200,'镜头说明',true);
    if(s.title!==undefined)str(s.title,80,'讲解标题');
    if(s.demo){
      if(!ids.has(s.target)||!['click','input'].includes(s.demo.event))fail('操作演示 target='+s.target+' selector='+s.demo.selector+' 无效：有 demo 的步骤必须 target 为本次 blocks 中的块ID，不能是段落ID；selector 必须在该块HTML内。允许块ID：'+[...ids].join(','));
      str(s.demo.selector,160,'演示选择器');
      if(s.demo.value!==undefined)str(s.demo.value,160,'演示输入',true);
    }
  }
  if(a.design){
    const d=a.design;str(d.version,80,'设计基线版本');str(d.intent,500,'表达目标');str(d.readingFlow,1000,'阅读路线');str(d.voice,300,'作者语气');
    if(!d.style||!Array.isArray(d.style.palette)||d.style.palette.length>8)fail('设计风格无效');
    d.style.palette.forEach(v=>str(v,80,'颜色约定'));
    for(const key of ['typography','surface','motion'] as const)str(d.style[key],500,'风格约定');
    if(!Array.isArray(d.decisions)||d.decisions.length>8||!Array.isArray(d.components)||d.components.length!==a.blocks.length)fail('设计分工必须覆盖每个表达片段');
    d.decisions.forEach(x=>{str(x.title,120,'设计决策');str(x.reason,600,'设计理由');str(x.tradeoff,600,'设计取舍')});
    const described=new Set<string>();
    d.components.forEach(x=>{
      if(!ids.has(x.blockId)||described.has(x.blockId))fail('设计分工与程序不一致');described.add(x.blockId);
      for(const key of ['purpose','whyHere','interaction','implementation'] as const)str(x[key],700,'组件设计');
      if(!Array.isArray(x.checks)||x.checks.length>8)fail('验收标准无效');x.checks.forEach(v=>str(v,300,'验收标准'));
    });
  }
  if (!a.provenance || !['api','codex'].includes(a.provenance.method)) fail('缺少 Agent 加工记录');
  str(a.provenance.runId, 100, '生成任务 ID');
  if (!isId(a.provenance.runId)) fail('生成任务 ID 无效');
  str(a.provenance.sourceHash, 100, '原文指纹');
  if(a.provenance.method==='codex' ? a.provenance.tier!=='session' : !['balanced','frontier'].includes(a.provenance.tier))fail('生成档位无效');
  str(a.provenance.model, 120, '模型记录'); str(a.provenance.prompt, 4000, '提示记录');
  str(a.provenance.createdAt, 80, '生成时间');
  if(!Number.isFinite(Date.parse(a.provenance.createdAt)))fail('生成时间无效');
  if(JSON.stringify(a).length > 260000) fail('单篇结果过大，请缩小交互范围');
  return a;
}
export function mergeArtifact(current: AnswerArtifact | undefined, next: AnswerArtifact, source: AnswerSource, selected: string[]): AnswerArtifact {
  validateArtifact(next, source, selected);
  if (!current || !selected.length) return next;
  const chosen = new Set(selected);
  const retainedBlocks = current.blocks.filter(b => !chosen.has(b.afterParagraphId));
  const retainedIds = new Set(retainedBlocks.map(b=>b.id));
  if(next.blocks.some(b=>retainedIds.has(b.id))) fail('新交互块与未选中的交互块 ID 冲突');
  const retainedBindings = current.bindings.filter(b=>!chosen.has(b.paragraphId));
  if(next.bindings.some(b=>retainedBindings.some(x=>x.id===b.id))) fail('正文联动 ID 与未选区冲突');
  const design=next.design?{...(current.design||next.design),version:next.design.version,components:[...(current.design?.components.filter(c=>retainedIds.has(c.blockId))||[]),...next.design.components]}:undefined;
  if(design&&retainedBlocks.some(b=>!design.components.some(c=>c.blockId===b.id)))fail('局部修改缺少保留片段的设计记录');
  const libraryReferences=[...(current.libraryReferences||[]).map(r=>({...r,blockIds:r.blockIds.filter(id=>retainedIds.has(id))})).filter(r=>r.blockIds.length),...(next.libraryReferences||[])];
  return validateArtifact({...next,design,...(libraryReferences.length?{libraryReferences}:{}),blocks:[...retainedBlocks,...next.blocks],bindings:[...retainedBindings,...next.bindings]}, source);
}
export function parseModelJSON(text: string): unknown {
  const fence=String.fromCharCode(96).repeat(3);
  let clean=text.trim();
  if(clean.startsWith(fence)) clean=clean.slice(fence.length).replace(/^json\s*/,'').trim();
  if(clean.endsWith(fence)) clean=clean.slice(0,-fence.length).trim();
  try { return JSON.parse(clean); } catch { fail('模型返回的 JSON 不完整'); }
}
