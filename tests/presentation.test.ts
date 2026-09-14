import {it,expect} from 'vitest';
import {featuredAnswerIds,publicReadingAnswers,realAnswersFirst} from '../src/lib/answer-order';
import {validateArtifact} from '../src/lib/validation';
import {source,fixture} from './fixtures';
import {offlineReading} from '../src/lib/offline-reading';
it('fixes editorial order independently of source grouping and personal copies',()=>{
 const originals={source:{...source,id:'original',origin:'original' as const},version:'original'};
 const current=featuredAnswerIds.map(id=>({source:{...source,id},version:'published'}));
 expect(realAnswersFirst([originals,...[...current].reverse()]).map(a=>a.source.id)).toEqual([...featuredAnswerIds,'original']);
 const saved={...current[0],version:'saved-old'};
 expect(publicReadingAnswers(current,[saved])[0].version).toBe('published');expect(saved.version).toBe('saved-old');
});
it('validates optional article-bound presentation metadata and retains legacy support',()=>{
 const a=fixture();expect(()=>validateArtifact(a,source)).not.toThrow();a.presentation={version:1,leadBlockId:a.blocks[0].id,cue:'点击增加',nodes:[{blockId:a.blocks[0].id,label:'计数'}]};expect(()=>validateArtifact(a,source)).not.toThrow();a.presentation.leadBlockId='missing';expect(()=>validateArtifact(a,source)).toThrow('核心交互');a.presentation.leadBlockId=a.blocks[0].id;a.presentation.nodes.push(a.presentation.nodes[0]);expect(()=>validateArtifact(a,source)).toThrow('阅读节点');
});
it('offline core interaction renders once before its original paragraph and keeps navigation',()=>{
 const a=fixture();a.presentation={version:1,leadBlockId:a.blocks[0].id,cue:'点击增加',nodes:[{blockId:a.blocks[0].id,label:'计数'}]};const html=offlineReading({source,artifact:a,accent:'#123',tag:'测试',votes:0},new Map());expect(html.match(/<iframe /g)).toHaveLength(1);expect(html.indexOf('<iframe')).toBeLessThan(html.indexOf('第一段内容'));expect(html).toContain('返回核心交互');expect(html).toContain('完整原文');
});
