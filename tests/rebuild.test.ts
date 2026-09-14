import {describe,it,expect} from 'vitest';
import {plainSource,richSource} from '../src/lib/rich-source';
import {validateArtifact} from '../src/lib/validation';
import {previewCleanup,cleanedRecord,type CleanupPlan} from '../studio/cleanup';
import {frameDocument} from '../src/lib/runtime';
import {blockMediaReady} from '../src/lib/block-media';
import type {StudioAnswer} from '../studio/types';
import type {AnswerArtifact,SourceAsset} from '../src/lib/types';
import birthday from '../src/data/generated/birthday.json';
function setup(){
 const source=richSource('<p>正文论点</p><p><img src="https://example.com/a.png"></p><p><img src="https://example.com/b.png"></p>',{method:'clipboard'});
 const a=structuredClone(birthday.artifact) as AnswerArtifact;a.answerId=source.id;a.blocks=[{id:'compare',afterParagraphId:source.paragraphs[2].id,title:'比较',html:'<img data-source-image="https://example.com/a.png"><img data-source-image="https://example.com/b.png">',css:'',js:'',height:200,mediaUrls:['https://example.com/a.png','https://example.com/b.png'],replaceParagraphIds:source.paragraphs.slice(1).map(p=>p.id)}];a.bindings=[];a.scene=[];a.design=undefined;a.libraryReferences=[];return {source,a};
}
describe('原文图片进入统一 Runtime',()=>{
 it('原文引用通过，文字替代、跨文引用和重复占用被拒绝',()=>{const {source,a}=setup();expect(()=>validateArtifact(a,source)).not.toThrow();a.blocks[0].replaceParagraphIds!.push(source.paragraphs[0].id);expect(()=>validateArtifact(a,source)).toThrow('纯图片');a.blocks[0].replaceParagraphIds=source.paragraphs.slice(1).map(p=>p.id);a.blocks[0].mediaUrls!.push('https://other.test/x.png');expect(()=>validateArtifact(a,source)).toThrow('本篇原媒体')});
 it('只注入声明图片，不放开联网；缺失图片保留显式失败信号',()=>{const {a}=setup(),b=a.blocks[0];expect(blockMediaReady(b)).toBe(false);const asset={url:b.mediaUrls![0],mime:'image/png',sha256:'a'.repeat(64),data:'AQ=='} as SourceAsset;const doc=frameDocument(b,'channel','http://local',[asset]);expect(doc).toContain('src="data:image/png;base64,AQ=="');expect(doc).toContain("connect-src 'none'");expect(doc).not.toContain('src="https://example.com');expect(frameDocument(b,'channel','http://local')).toContain('data-missing-image="true"')});
 it('声明未被实际图片使用时不可折叠原图',()=>{const {source,a}=setup();a.blocks[0].html='<div>没有图片的控件</div>';expect(()=>validateArtifact(a,source)).toThrow('实际图片引用');});
 it('24个片段和48步兼容，无需旧产物迁移',()=>{const {source,a}=setup();const base={...a.blocks[0],html:'<p>旧产物</p>',mediaUrls:undefined,replaceParagraphIds:undefined};a.blocks=Array.from({length:24},(_,i)=>({...base,id:'b'+i}));a.scene=Array.from({length:48},()=>({action:'reveal',target:'b0'}));expect(()=>validateArtifact(a,source)).not.toThrow();a.blocks.push({...base,id:'extra'});expect(()=>validateArtifact(a,source)).toThrow('1–24')});
});
describe('可复查清洗与段落备注',()=>{
 it('保留原记录、迁移可精确定位的备注，并拒绝过期计划',()=>{const source=plainSource('重复作者\n第一句。第二句。');const current={source,votes:0,accent:'',tag:'',workspace:{revision:3,idea:'private',selectedParagraphIds:[source.paragraphs[1].id],updatedAt:''},studio:{notes:[{id:'n',paragraphId:source.paragraphs[1].id,quote:'第二句。',text:'保留这个说明'}],feedback:'',tags:[],status:'draft'}} as StudioAnswer;
 const plan:CleanupPlan={id:source.id,expectedRevision:3,source:{...source,paragraphs:[{id:'split-a',text:'第一句。'},{id:'split-b',text:'第二句。'}]},changes:[{paragraphId:source.paragraphs[0].id,reason:'重复作者',replacementIds:[]},{paragraphId:source.paragraphs[1].id,reason:'拆段',replacementIds:['split-a','split-b']}]};
 expect(previewCleanup(current,plan).changes).toHaveLength(2);const next=cleanedRecord(current,plan);expect(next.studio.notes[0].paragraphId).toBe('split-b');expect(current.source.paragraphs[0].text).toBe('重复作者');expect(next.workspace?.selectedParagraphIds).toEqual(['split-a','split-b']);plan.expectedRevision=2;expect(()=>cleanedRecord(current,plan)).toThrow('过期');
 });
 it('删除有备注的界面段落时保留失效备注，不默默移到正文',()=>{const source=plainSource('作者\n正文');const current={source,votes:0,accent:'',tag:'',workspace:{revision:1,idea:'',selectedParagraphIds:[],updatedAt:''},studio:{notes:[{id:'n',paragraphId:source.paragraphs[0].id,quote:'作者',text:'备注'}],feedback:'',tags:[],status:'draft'}} as StudioAnswer;const plan:CleanupPlan={id:source.id,expectedRevision:1,source:{...source,paragraphs:source.paragraphs.slice(1)},changes:[{paragraphId:source.paragraphs[0].id,reason:'重复作者',replacementIds:[]}]};expect(cleanedRecord(current,plan).studio.notes).toEqual(current.studio.notes)});
});
