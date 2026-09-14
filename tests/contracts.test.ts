import { describe,it,expect } from 'vitest';
import { validateSource,validateInput,validateArtifact,mergeArtifact } from '../src/lib/validation';
import { validMessage,frameDocument } from '../src/lib/runtime';
import { seedAnswers } from '../src/data/seeds';
import type { AnswerSource,AnswerArtifact } from '../src/lib/types';
import {source,fixture} from './fixtures';
describe('source and artifact boundaries',()=>{
  it('all twelve inputs are source articles, never prebuilt interactions',()=>{
    expect(seedAnswers).toHaveLength(12);
    seedAnswers.forEach(a=>{expect(()=>validateSource(a.source)).not.toThrow();expect(a.artifact).toBeUndefined()});
  });
  it('rejects source link injection',()=>expect(()=>validateSource({...source,sourceUrl:'javascript:alert(1)'})).toThrow());
  it('rejects non-contiguous selections',()=>expect(()=>validateInput({source,selectedParagraphIds:['p1','p3'],instruction:'修改',tier:'balanced'})).toThrow('连续'));
  it('rejects blocks anchored outside selection',()=>expect(()=>validateArtifact(fixture(),source,['p2'])).toThrow('超出'));
  it('preserves blocks outside a selected paragraph and the entire original text',()=>{
    const original=fixture();const before=JSON.stringify(source);
    const replacement=fixture('p2','block-two');replacement.bindings=[];
    const merged=mergeArtifact(original,replacement,source,['p2']);
    expect(merged.blocks[0]).toEqual(original.blocks[0]);expect(merged.blocks).toHaveLength(2);
    expect(merged.bindings).toEqual(original.bindings);expect(JSON.stringify(source)).toBe(before);
  });
  it('rejects duplicate identifiers and document boundary injection',()=>{
    const duplicate=fixture();duplicate.blocks.push(duplicate.blocks[0]);expect(()=>validateArtifact(duplicate,source)).toThrow('重复');
    const injection=fixture();injection.blocks[0].html='<img onerror="alert(1)">';expect(()=>validateArtifact(injection,source)).toThrow();
    const script=fixture();script.blocks[0].js='</script><script>alert(1)';expect(()=>validateArtifact(script,source)).toThrow();
  });
  it('rejects unauthorized scene targets and extreme heights',()=>{
    const a=fixture();a.scene[0].target='global-header';expect(()=>validateArtifact(a,source)).toThrow('镜头');
    const b=fixture();b.blocks[0].height=100000;expect(()=>validateArtifact(b,source)).toThrow('高度');
  });
});
describe('iframe boundary',()=>{
  it('checks source window, unique channel, block and message kind',()=>{
    const frame={} as Window,other={} as Window;
    const data={channel:'secret',blockId:'block',type:'binding',value:{key:'count',value:'1'}};
    expect(validMessage({source:frame,data},frame,'secret','block')).toBe(true);
    expect(validMessage({source:other,data},frame,'secret','block')).toBe(false);
    expect(validMessage({source:frame,data:{...data,channel:'other'}},frame,'secret','block')).toBe(false);
    expect(validMessage({source:frame,data:{...data,blockId:'other'}},frame,'secret','block')).toBe(false);
    expect(validMessage({source:frame,data:{...data,type:'navigate'}},frame,'secret','block')).toBe(false);
  });
  it('uses no external runtime assets or permissive networking',()=>{
    const doc=frameDocument(fixture().blocks[0],'channel','https://example.com');
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("img-src data:");
    expect(doc).not.toContain('allow-same-origin');
    expect(doc).toContain('event.source!==parent');
  });
});

describe('article composition and design continuity',()=>{
  it('accepts small inline fragments but bounds total composition',()=>{
    const a=fixture();a.blocks[0].kind='inline';a.blocks[0].height=36;
    expect(()=>validateArtifact(a,source)).not.toThrow();
    a.blocks=Array.from({length:9},(_,i)=>({...a.blocks[0],id:'b'+i}));
    expect(()=>validateArtifact(a,source)).toThrow();
  });
  it('requires the design record to describe every actual fragment exactly once',()=>{
    const a=fixture();a.design!.components[0].blockId='unknown';
    expect(()=>validateArtifact(a,source)).toThrow('设计分工');
  });
  it('limits demonstrations to controls inside a declared fragment',()=>{
    const a=fixture();a.scene=[{action:'reveal',target:'block-one',demo:{event:'click',selector:'#add'}}];
    expect(()=>validateArtifact(a,source)).not.toThrow();
    a.scene[0].target='p1';expect(()=>validateArtifact(a,source)).toThrow('操作演示');
  });
  it('keeps unselected component decisions and the overall style during partial edits',()=>{
    const current=fixture(),next=fixture('p2','block-two');next.bindings=[];
    next.design!.version='v2';next.design!.style.palette=['#f00'];
    const merged=mergeArtifact(current,next,source,['p2']);
    expect(merged.design!.style).toEqual(current.design!.style);
    expect(merged.design!.components).toEqual([...current.design!.components,...next.design!.components]);
    expect(merged.design!.version).toBe('v2');
  });
  it('rejects demo receipts from another frame',()=>{
    const frame={} as Window;
    const data={channel:'c',blockId:'b',type:'demo-result',value:{id:'d',ok:true}};
    expect(validMessage({source:frame,data},frame,'c','b')).toBe(true);
    expect(validMessage({source:{} as Window,data},frame,'c','b')).toBe(false);
  });
});
