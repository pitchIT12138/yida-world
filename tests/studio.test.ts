import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {StudioStore} from '../studio/store';
import {studioAPI} from '../studio/api';
import {plainSource} from '../src/lib/rich-source';
import type {StudioAnswer} from '../studio/types';
import {interactionLibrary,selectInteractions,validateLibraryReferences} from '../src/lib/interaction-library';
import {mergeCurated} from '../src/lib/curated';
import {publicCandidate} from '../server/curation';
import birthday from '../src/data/generated/birthday.json';
import type {Answer} from '../src/lib/types';
function record():StudioAnswer{return {source:plainSource('第一段原文。\n\n第二段原文。',{title:'工作台案例'}),votes:0,accent:'#444',tag:'素材',workspace:{revision:0,idea:'PRIVATE_NOTE',selectedParagraphIds:[],updatedAt:''},studio:{notes:[],feedback:'PRIVATE_FEEDBACK',tags:['比较'],status:'draft'}}}
describe('内部工作台',()=>{
 it('新增精选无需预置种子即可进入产品，且不重复',()=>{const a=structuredClone(birthday) as any;const added=mergeCurated([], [a]);expect(added).toHaveLength(1);expect(added[0].artifact!.blocks.length).toBeGreaterThan(0);expect(mergeCurated(added,[a])).toHaveLength(1)});
 it('重启恢复、历史、过期写入拒绝和独立数据库',async()=>{const dir=await mkdtemp(tmpdir()+'/studio-');let db=new StudioStore(dir+'/a.sqlite');const other=new StudioStore(dir+'/b.sqlite');try{let a=record();a.studio.notes=[{id:'n',paragraphId:a.source.paragraphs[0].id,quote:a.source.paragraphs[0].text,text:'保留备注'}];a=await db.saveRecord(a,0,'import');expect(await other.list()).toHaveLength(0);await expect(db.saveRecord(a,0,'draft')).rejects.toThrow('另一个窗口');a.workspace!.idea='changed';await db.saveRecord(a,1,'draft');db.close();db=new StudioStore(dir+'/a.sqlite');expect((await db.list())[0].workspace?.idea).toBe('changed');expect((await db.version(a.source.id,1) as StudioAnswer).studio.notes[0].text).toBe('保留备注')}finally{db.close();other.close();await rm(dir,{recursive:true,force:true})}});
 it('改原文保留旧产物及失效备注',async()=>{const dir=await mkdtemp(tmpdir()+'/studio-');const db=new StudioStore(dir+'/a.sqlite');try{let a={...structuredClone(birthday),votes:0,accent:'#444',tag:'案例',workspace:{revision:0,idea:'想法',selectedParagraphIds:[],updatedAt:''},studio:{notes:[{id:'n',paragraphId:'birthday-p0',quote:birthday.source.paragraphs[0].text,text:'备注'}],feedback:'',tags:[],status:'candidate'}} as StudioAnswer;a=await db.saveRecord(a,0,'generation');a.source.paragraphs[0].text+=' 修改原文';a=await db.saveRecord(a,1,'source');expect(a.artifact).toBeUndefined();expect(a.reference?.artifact.answerId).toBe('birthday');expect(a.studio.notes[0].quote).not.toBe(a.source.paragraphs[0].text)}finally{db.close();await rm(dir,{recursive:true,force:true})}});
 it('内部接口需要同源头且不能由页面提交精选产物',async()=>{const dir=await mkdtemp(tmpdir()+'/studio-api-');const db=new StudioStore(dir+'/a.sqlite');try{const api=studioAPI(db);expect((await api.request('http://local/')).status).toBe(403);const a=record();const response=await api.request('http://local/'+a.source.id,{method:'POST',headers:{'X-Studio-Client':'yida-studio','Content-Type':'application/json'},body:JSON.stringify({answer:a,expectedRevision:0,kind:'import'})});expect(response.status).toBe(200);expect((await response.json()).studio.status).toBe('draft')}finally{db.close();await rm(dir,{recursive:true,force:true})}});
 it('匹配只选相关项、最多三个、直接复用必须代码一致',()=>{expect(selectInteractions('无关的叙事')).toHaveLength(0);expect(selectInteractions('比较').length).toBeGreaterThan(0);const a=structuredClone(birthday) as unknown as Answer;Object.assign(a.artifact!.blocks.find(b=>b.id==='birthday-compare')!,{html:interactionLibrary[0].blocks[0].html,css:interactionLibrary[0].blocks[0].css,js:interactionLibrary[0].blocks[0].js});a.artifact!.libraryReferences=[{id:interactionLibrary[0].id,version:'1',mode:'reuse',changes:'直接复用',blockIds:['birthday-compare']}];expect(()=>validateLibraryReferences(a.artifact!)).not.toThrow();a.artifact!.blocks.find(b=>b.id==='birthday-compare')!.js+='\n// change';expect(()=>validateLibraryReferences(a.artifact!)).toThrow('代码不一致');a.artifact!.libraryReferences[0].mode='adapt';expect(()=>validateLibraryReferences(a.artifact!)).not.toThrow()});
 it('发布白名单排除备注并拒绝错配来源',()=>{const a={...structuredClone(birthday),studio:{notes:'PRIVATE_NOTE'},workspace:{idea:'PRIVATE_NOTE'},votes:0,accent:'',tag:''} as unknown as Answer;a.artifact!.provenance.prompt='PRIVATE_NOTE';expect(JSON.stringify(publicCandidate(a))).not.toContain('PRIVATE_NOTE');a.source.title='改动';expect(()=>publicCandidate(a)).toThrow('原文指纹')});
});

describe('作者头像输入兼容',()=>{
 it.each(['  知乎作者','\n\t作者','   ','','😀作者'])('作者 %j 可以导入保存',async(author)=>{
  const dir=await mkdtemp(tmpdir()+'/studio-avatar-');const db=new StudioStore(dir+'/a.sqlite');
  try{const a=record();a.source=plainSource('正文内容',{title:'作者兼容',author});const saved=await db.saveRecord(a,0,'import');expect(saved.source.avatar.trim()).not.toBe('');if(author==='😀作者')expect(saved.source.avatar).toBe('😀')}finally{db.close();await rm(dir,{recursive:true,force:true})}
 });
 it('旧失败草稿直接重试即可修复空白头像',async()=>{const dir=await mkdtemp(tmpdir()+'/studio-avatar-');const db=new StudioStore(dir+'/a.sqlite');try{const a=record();a.source.author='作者';a.source.avatar=' ';const api=studioAPI(db);const response=await api.request('http://local/'+a.source.id,{method:'POST',headers:{'X-Studio-Client':'yida-studio','Content-Type':'application/json'},body:JSON.stringify({answer:a,expectedRevision:0,kind:'draft'})});expect(response.status).toBe(200);expect((await response.json()).source.avatar).toBe('作')}finally{db.close();await rm(dir,{recursive:true,force:true})}});
});

describe('富文本导入与保存使用一致的规范格式',()=>{
 it.each(['<div>普通正文</div>','<section>正文</section>','<div>第一行<br>第二行</div>','<div><span>文字</span><div>下一段</div></div>','<table><tr><td>表格内容</td></tr></table>','<p><svg><foreignObject><div>嵌套正文</div></foreignObject></svg>后续文字</p>'])('清洗与分段后可直接校验：%s',async html=>{
  const {richSource,sanitizeRichHTML}=await import('../src/lib/rich-source');const {validateSource}=await import('../src/lib/validation');const source=richSource(html,{method:'clipboard'});expect(()=>validateSource(source)).not.toThrow();for(const p of source.paragraphs)expect(sanitizeRichHTML(p.html!)).toBe(p.html);
 });
 it('重试旧草稿规范非法嵌套，保留文字和备注，移除可执行内容',async()=>{const dir=await mkdtemp(tmpdir()+'/studio-rich-');const db=new StudioStore(dir+'/a.sqlite');try{const a=record();a.source.paragraphs[0].html='<p><div>第一段原文。</div></p><script>alert(1)</script>';a.studio.notes=[{id:'note',paragraphId:a.source.paragraphs[0].id,quote:a.source.paragraphs[0].text,text:'保留我的想法'}];const saved=await db.saveRecord(a,0,'draft');expect(saved.source.paragraphs[0].text).toBe(a.source.paragraphs[0].text);expect(saved.source.paragraphs[0].html).not.toContain('<script');expect(saved.studio.notes[0].text).toBe('保留我的想法');const {validateSource}=await import('../src/lib/validation');expect(()=>validateSource(saved.source)).not.toThrow()}finally{db.close();await rm(dir,{recursive:true,force:true})}});
});
