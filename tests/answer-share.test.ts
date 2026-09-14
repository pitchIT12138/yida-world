import {describe,it,expect} from 'vitest';
import {answerShare,shareOnly,isHTMLSource} from '../src/lib/answer-share';

const url='https://www.zhihu.com/question/2079351385255163833/answer/2079743429878216427';
const title='如何看待普京说乌克兰的40天攻势只让俄罗斯损失1％的gdp？';
const caption=title+' - 豆丁的回答 - 知乎';
describe('per-answer share input',()=>{
  it('recognizes the exact shared answer, including Markdown-wrapped links',()=>{
    for(const text of [caption+'\n'+url,caption+'\n['+url+']('+url+')'])expect(shareOnly(text)).toEqual({id:'2079743429878216427',url,title,author:'豆丁'});
  });
  it('accepts bare URLs and exact string IDs and removes tracking query parameters',()=>{
    expect(answerShare(url+'?utm_source=copy_link')).toEqual({id:'2079743429878216427',url});
    expect(shareOnly('2079743429878216427')?.id).toBe('2079743429878216427');
  });
  it('does not mistake answer content containing a citation for a share card',()=>{
    expect(shareOnly('这是回答正文。\n作者：豆丁\n链接：'+url)).toBeUndefined();
    expect(shareOnly('<p>'+caption+'</p><p>'+url+'</p>')).toBeUndefined();
  });
  it('rejects ambiguous or spoofed targets',()=>{
    expect(answerShare(url+'\nhttps://www.zhihu.com/answer/123')).toBeUndefined();
    expect(answerShare('https://www.zhihu.com.evil.test/answer/123')).toBeUndefined();
    expect(answerShare('https://www.zhihu.com/question/123')).toBeUndefined();
  });
  it('recognizes copied HTML source separately from plain answer text',()=>{
    expect(isHTMLSource('<!doctype html><html><body>内容</body></html>')).toBe(true);
    expect(isHTMLSource('<p>正文<img src="https://picx.zhimg.com/a.png"></p>')).toBe(true);
    expect(isHTMLSource('下面是示例 <p>普通文本</p>')).toBe(false);
  });
});
