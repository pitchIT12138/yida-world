// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,unmount,tick} from 'svelte';
import {webcrypto} from 'node:crypto';
import {zhihuSession} from '../src/lib/zhihu-session';
import Composer from '../src/components/Composer.svelte';
import {base64ToBytes} from '../src/lib/archive';
import {plainSource} from '../src/lib/rich-source';

let target:HTMLDivElement,component:ReturnType<typeof mount>;
const png=base64ToBytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=');
const add=vi.fn();
beforeEach(()=>{
  vi.stubGlobal('crypto',webcrypto);
  URL.createObjectURL=vi.fn(()=>'blob:fixture-image');URL.revokeObjectURL=vi.fn();
  target=document.createElement('div');document.body.append(target);add.mockClear();
  component=mount(Composer,{target,props:{onadd:add,onclose:()=>{},onimport:async()=>{}}});
});
afterEach(async()=>{await unmount(component);await zhihuSession.close();target.remove();vi.unstubAllGlobals()});
async function paste(html:string,text='正文'){
  const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:(type:string)=>type==='text/html'?html:text}});
  target.querySelector('textarea')!.dispatchEvent(event);await tick();
}
function button(text:string){const el=[...target.querySelectorAll('button')].find(b=>b.textContent?.includes(text));if(!el)throw new Error('Missing button '+text);return el}
describe('single page import interaction (simulated DOM)',()=>{
  it('imports plain text with the network unavailable and no login step',async()=>{
    const fetcher=vi.fn(()=>Promise.reject(new Error('offline')));vi.stubGlobal('fetch',fetcher);
    await paste('', '第一段完整正文。\n\n第二段是末尾。');
    expect(target.querySelector('.import-preview')?.textContent).toContain('第二段是末尾');
    expect(target.querySelector('.manual-browser')).toBeNull();button('加入本页').click();
    expect(add).toHaveBeenCalledOnce();expect(fetcher).not.toHaveBeenCalled();
  });
  it('attaches a share link after pasting the body without replacing the body or reading the site',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await paste('<p>已经粘贴的原文</p>');
    const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=> '问题 - 小明的回答 - 知乎\nhttps://www.zhihu.com/answer/456'}});
    target.querySelector('[aria-label="知乎回答链接或 ID"]')!.dispatchEvent(event);await tick();button('加入本页').click();
    const saved=add.mock.calls[0][0].source;expect(saved.id).toBe('zhihu-456');expect(saved.sourceUrl).toBe('https://www.zhihu.com/answer/456');expect(saved.title).toBe('问题');expect(saved.author).toBe('小明');expect(saved.paragraphs[0].text).toBe('已经粘贴的原文');expect(fetcher).not.toHaveBeenCalled();
  });

  it('records pasted share metadata without network access or treating it as the body',async()=>{
    const url='https://www.zhihu.com/question/2079351385255163833/answer/2079743429878216427';
    const title='如何看待普京说乌克兰的40天攻势只让俄罗斯损失1％的gdp？';
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'页面正在校验'}),{status:422}));vi.stubGlobal('fetch',fetcher);
    await paste('',title+' - 豆丁的回答 - 知乎\n['+url+']('+url+')');
    expect(target.querySelector('[role=status]')?.textContent).toContain('出处已记录');
    expect(fetcher).not.toHaveBeenCalled();
    expect(button('加入本页').disabled).toBe(true);expect(add).not.toHaveBeenCalled();
    expect(target.querySelector<HTMLInputElement>('[aria-label="回答标题"]')?.value).toBe(title);
    expect(target.querySelector<HTMLInputElement>('[aria-label="原作者"]')?.value).toBe('豆丁');
    await paste('', '<p>后来补充的完整正文</p><img src="https://picx.zhimg.com/a.png">');
    expect(target.querySelector('.import-preview img')).not.toBeNull();button('加入本页').click();
    expect(add.mock.calls[0][0].source.title).toBe(title);expect(add.mock.calls[0][0].source.sourceUrl).toBe(url);
    expect(add.mock.calls[0][0].source.paragraphs[0].text).toBe('后来补充的完整正文');
  });
  it('lets the reader fill a missing image using an original local file',async()=>{
    await paste('<p>图片上文</p><img alt="待补全原图"><p>图片下文</p>');
    expect(target.querySelector('.missing-media')?.textContent).toContain('原文未提供地址');
    target.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();await tick();expect(button('下载完整离线包').disabled).toBe(true);
    const input=target.querySelector<HTMLInputElement>('.source-tools input[type=file]')!;
    Object.defineProperty(input,'files',{value:[{size:png.length,type:'image/png',arrayBuffer:async()=>png.buffer}]});
    button('补充本地原文件').click();input.dispatchEvent(new Event('change',{bubbles:true}));
    await vi.waitFor(()=>expect(button('下载完整离线包').disabled).toBe(false));
    expect(target.querySelector('.import-preview img')?.getAttribute('src')).toBe('blob:fixture-image');
    button('加入本页').click();expect(add.mock.calls[0][0].assets[0].url).toMatch(/^urn:yida:media:/);
  });
  it('reopens a saved source and allows withdrawing full-text confirmation',async()=>{
    await unmount(component);
    const source=plainSource('待重新核对的回答');source.imported!.completeness='confirmed';
    component=mount(Composer,{target,props:{initial:{source,votes:0,accent:'#658896',tag:'原文'},onadd:add,onclose:()=>{},onimport:async()=>{}}});
    await tick();
    const checkbox=target.querySelector<HTMLInputElement>('input[type=checkbox]')!;expect(checkbox.checked).toBe(true);
    checkbox.click();await tick();expect(button('下载完整离线包').disabled).toBe(true);
    button('保存修改').click();expect(add.mock.calls[0][0].source.imported.completeness).toBe('unverified');
  });
  it('pastes rich text, previews images and saves original structures after confirmation',async()=>{
    await paste('<h2>正文小标题</h2><p>原文<strong>重点</strong></p><figure><img src="https://picx.zhimg.com/test.png" alt="原图"><figcaption>图注</figcaption></figure><p>作者：原作者</p><p>链接：https://www.zhihu.com/question/1/answer/123</p>');
    expect(target.querySelector('.import-preview img')?.getAttribute('src')).toBe('https://picx.zhimg.com/test.png');
    expect(target.querySelector<HTMLInputElement>('[aria-label="原作者"]')?.value).toBe('原作者');
    expect(button('下载完整离线包').disabled).toBe(true);
    const checkbox=target.querySelector<HTMLInputElement>('input[type=checkbox]')!;checkbox.click();await tick();
    expect(button('下载完整离线包').disabled).toBe(true);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png,{headers:{'content-type':'image/png'}})));
    button('保存全部原媒体').click();
    await vi.waitFor(()=>expect(button('下载完整离线包').disabled).toBe(false));
    expect(target.querySelector('.import-preview img')?.getAttribute('src')).toBe('blob:fixture-image');
    button('加入本页').click();await tick();
    expect(add).toHaveBeenCalledTimes(1);const saved=add.mock.calls[0][0];
    expect(saved.source.imported.completeness).toBe('confirmed');expect(saved.source.paragraphs.map((p:{html:string})=>p.html).join('')).toContain('<strong>重点</strong>');expect(saved.assets).toHaveLength(1);
  });
  it('keeps a failed link and allows pasting its full text with associated source',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'请复制全文'}),{status:422})));
    const input=target.querySelector<HTMLInputElement>('[aria-label="知乎回答链接或 ID"]')!;input.value='https://www.zhihu.com/answer/456';input.dispatchEvent(new Event('input',{bubbles:true}));await tick();
    button('读取链接').click();await vi.waitFor(()=>expect(target.querySelector('[role=alert]')?.textContent).toContain('请复制全文'));
    expect(input.value).toBe('https://www.zhihu.com/answer/456');
    await paste('<p>这是完整短回答</p>');button('加入本页').click();await tick();
    expect(add.mock.calls[0][0].source.sourceUrl).toBe('https://www.zhihu.com/answer/456');
  });
  it('asks which answer to import when a pasted page contains several answers',async()=>{
    await paste(['111','222'].map(id=>`<div class="AnswerItem" name="${id}"><div class="AuthorInfo-name">作者${id}</div><div class="RichContent-inner"><p>正文${id}</p></div><a href="/answer/${id}">来源</a></div>`).join(''));
    expect(target.querySelector('[aria-label="选择要导入的回答"]')).not.toBeNull();
    button('作者222').click();await tick();button('加入本页').click();
    expect(add.mock.calls[0][0].source.id).toBe('zhihu-222');
    expect(JSON.stringify(add.mock.calls[0][0])).not.toContain('正文111');
  });
});
