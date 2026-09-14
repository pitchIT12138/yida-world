import {afterEach,describe,it,expect,vi} from 'vitest';
import {strFromU8,unzipSync,zipSync,strToU8} from 'fflate';
import {answerAddress,parseAnswerHTML,richSource,sanitizeRichHTML,plainSource} from '../src/lib/rich-source';
import {validateSource,validateInput} from '../src/lib/validation';
import {assetFromBytes,base64ToBytes,createArchive,readArchive,missingMedia,collectMedia,unresolvedSourceNotes,canArchiveCompletely,assetMatchesSource} from '../src/lib/archive';
import app from '../server/app';
import type {Answer} from '../src/lib/types';

const url='https://picx.zhimg.com/example.png';
const png=base64ToBytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=');
const body='<h2>原文标题</h2><p>第一段<strong>重点</strong></p><blockquote><p>引用</p></blockquote><ul><li>一个</li><li>两个</li></ul><pre><code>if (a &lt; b) {\n  run();\n}</code></pre><table><tbody><tr><th>名称</th><td>数值</td></tr></tbody></table><figure><img src="'+url+'" alt="原图"><figcaption>图片说明</figcaption></figure><math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
function answer():Answer {const source=richSource(body,{title:'完整回答',author:'原作者',method:'clipboard'});source.imported!.completeness='confirmed';return{source,votes:0,accent:'#658896',tag:'测试'}}
afterEach(()=>vi.unstubAllGlobals());
describe('full source import',()=>{
  it('keeps rich content and its order without executable page code',()=>{
    const source=validateSource(richSource(body+'<script>alert(1)</script>',{method:'file'}));
    expect(source.paragraphs).toHaveLength(8);
    const html=source.paragraphs.map(p=>p.html).join('');expect(html).toContain('<table>');expect(html).toContain('<math>');expect(html).toContain('图片说明');expect(html).not.toContain('<script');
    expect(source.paragraphs[4].text).toContain('  run();');
  });
  it('rejects unsafe URLs and neutralizes nested markup and event handlers',()=>{
    const html=sanitizeRichHTML('<img src="javascript:evil()" onerror="evil()"><a href="javascript:evil()">link</a><svg onload="x"><script>evil()</script></svg>');
    expect(html).not.toMatch(/javascript:|onerror|onload|<script|<svg/);
    expect(()=>validateSource({...answer().source,paragraphs:[{id:'p',text:'text',html:'<img src=x onerror=evil()>'}]})).toThrow();
  });
  it('preserves long text and more than 60 paragraphs without truncation',()=>{
    const text=Array.from({length:150},(_,i)=>i+' '+ '长文'.repeat(100)).join('\n');
    const s=validateSource(plainSource(text));expect(s.paragraphs).toHaveLength(150);expect(s.paragraphs.at(-1)?.text).toBe('149 '+'长文'.repeat(100));
    expect(validateInput({source:s,instruction:'读取全文',selectedParagraphIds:[],tier:'balanced'}).source).toBe(s);
  });
  it('preserves long answer IDs as strings and rejects spoofed origins',()=>{
    expect(answerAddress('https://www.zhihu.com/question/123/answer/2079922322484499105?share=1')?.id).toBe('2079922322484499105');
    expect(answerAddress('https://www.zhihu.com.evil.test/answer/123')).toBeUndefined();expect(answerAddress('https://user@www.zhihu.com/answer/123')).toBeUndefined();
  });
  it('separates answers and preserves original image URLs rather than thumbnails',()=>{
    const html='<html><body><header>账号通知</header>'+['1','2079922322484499105'].map(id=>`<div class="AnswerItem" name="${id}" data-zop='{"itemId":"${id}","title":"题目","authorName":"作者${id}"}'><div class="RichContent-inner"><p>正文${id}</p><img src="https://picx.zhimg.com/thumb.jpg" data-original="${url}"></div><a href="/question/123/answer/${id}">发布时间</a></div>`).join('')+'</body></html>';
    const sources=parseAnswerHTML(html);expect(sources).toHaveLength(2);sources.forEach(s=>validateSource(s));expect(sources[1].id).toBe('zhihu-2079922322484499105');expect(JSON.stringify(sources)).not.toContain('账号通知');expect(JSON.stringify(sources)).not.toContain('thumb.jpg');
  });
  it('reads clipboard attribution from either end and does not claim full content',()=>{
    for(const text of ['<p>正文</p><p>作者：原作者</p><p>链接：https://www.zhihu.com/question/1/answer/123</p>','<p>作者：原作者</p><p>链接：https://www.zhihu.com/question/1/answer/123</p><p>正文</p>']){
      const s=parseAnswerHTML(text,'clipboard')[0];expect(s.author).toBe('原作者');expect(s.id).toBe('zhihu-123');expect(s.imported?.completeness).toBe('unverified');
    }
    expect(()=>parseAnswerHTML('<html><body>登录知乎</body></html>')).toThrow();
  });
  it('keeps inline raster images and does not confuse a lazy SVG placeholder with missing authored graphics',()=>{
    const inline='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=';
    const s=validateSource(richSource('<p>文字</p><img src="'+inline+'"><img src="data:image/svg+xml;utf8,&lt;svg>&lt;/svg>" data-original="'+url+'"><svg class="ZDI"><path d="M0 0"></path></svg>',{method:'file'}));
    expect(s.paragraphs.map(p=>p.html).join('')).toContain(inline);expect(s.imported?.notes).toEqual([]);
  });
});
describe('offline archive',()=>{
  it('fills an image without a URL and preserves its position in a portable archive',async()=>{
    const source=richSource('<p>上文</p><img alt="完整原图"><p>下文</p>',{method:'clipboard'});source.imported!.completeness='confirmed';validateSource(source);
    const a:Answer={source,votes:0,accent:'#658896',tag:'测试'},[slot]=missingMedia(a);
    expect(slot).toMatch(/^urn:yida:media:/);expect(canArchiveCompletely(a)).toBe(false);
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const pending=await collectMedia(a,new AbortController().signal,()=>{});expect(fetcher).not.toHaveBeenCalled();expect(pending.failures[0].message).toContain('本地原文件');
    a.assets=[await assetFromBytes(slot,png,'image/png')];expect(canArchiveCompletely(a)).toBe(true);
    const zip=await createArchive(a),restored=await readArchive(zip),html=strFromU8(unzipSync(zip)['index.html']);
    expect(restored.source).toEqual(source);expect(restored.assets).toEqual(a.assets);expect(html).toContain('src="media/');expect(html).not.toContain('src="urn:');expect(html.indexOf('上文')).toBeLessThan(html.indexOf('<img'));expect(html.indexOf('<img')).toBeLessThan(html.indexOf('下文'));
  });
  it('does not silently discard an iframe with no usable URL and label the result complete',()=>{
    const source=richSource('<p>正文</p><iframe src="javascript:alert(1)"></iframe>',{method:'file'});source.imported!.completeness='confirmed';
    expect(canArchiveCompletely({source,votes:0,accent:'#658896',tag:'测试'})).toBe(false);expect(source.imported!.notes).toHaveLength(1);
  });
  it('restores embedded audio to an offline player while preserving its original link and source fingerprint',async()=>{
    const embed='https://example.org/player?id=42&mode=audio';
    const source=richSource('<p>上文</p><iframe src="'+embed+'" title="原音频"></iframe><p>下文</p>',{method:'clipboard'});source.imported!.completeness='confirmed';
    const a:Answer={source,votes:0,accent:'#658896',tag:'测试'};
    expect(canArchiveCompletely(a)).toBe(false);
    // Valid 10 ms mono PCM WAVE, generated solely as a deterministic media fixture.
    const wav=new Uint8Array(204),view=new DataView(wav.buffer);
    for(const [offset,text]of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as const)wav.set(new TextEncoder().encode(text),offset);
    view.setUint32(4,196,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,160,true);
    a.assets=[await assetFromBytes(embed,wav,'audio/wav')];
    expect(unresolvedSourceNotes(a)).toEqual([]);expect(canArchiveCompletely(a)).toBe(true);
    const zip=await createArchive(a),restored=await readArchive(zip),html=strFromU8(unzipSync(zip)['index.html']);
    expect(restored.source).toEqual(source);expect(restored.assets).toEqual(a.assets);
    expect(html).toMatch(/<audio controls preload="none" src="media\/[a-f0-9]+\.wav"><\/audio>/);
    expect(html).toContain('href="https://example.org/player?id=42&amp;mode=audio"');expect(html.indexOf('上文')).toBeLessThan(html.indexOf('<audio'));expect(html.indexOf('<audio')).toBeLessThan(html.indexOf('下文'));
  });
  it('does not treat a poster image as the complete embedded video or clear other missing content',async()=>{
    const embed='https://example.org/player';
    const source=richSource('<iframe src="'+embed+'"></iframe><canvas>原图表</canvas>',{method:'file'});source.imported!.completeness='confirmed';
    const a:Answer={source,votes:0,accent:'#658896',tag:'测试',assets:[await assetFromBytes(embed,png,'image/png')]};
    expect(assetMatchesSource(source,a.assets![0])).toBe(false);expect(missingMedia(a)).toEqual([embed]);expect(unresolvedSourceNotes(a)).toHaveLength(2);await expect(createArchive(a)).rejects.toThrow('媒体');
  });
  it('keeps already downloaded media when cancellation interrupts a later file',async()=>{
    const a=answer(),second='https://picx.zhimg.com/second.png';
    a.source.paragraphs.push({id:'second',text:'图片',html:sanitizeRichHTML('<img src="'+second+'">')});
    const controller=new AbortController();
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(png)).mockImplementationOnce(()=>{controller.abort();return Promise.reject(new DOMException('cancelled','AbortError'))});
    vi.stubGlobal('fetch',fetcher);
    const result=await collectMedia(a,controller.signal,()=>{});
    expect(result.cancelled).toBe(true);expect(result.assets).toHaveLength(1);expect(result.assets[0].url).toBe(url);
    expect(missingMedia({...a,assets:result.assets})).toEqual([second]);
  });
  it('round trips original text, structures, image bytes and attribution',async()=>{
    const a=answer();a.assets=[await assetFromBytes(url,png,'image/png')];const zip=await createArchive(a),restored=await readArchive(zip);
    expect(restored.source).toEqual(a.source);expect(restored.assets).toEqual(a.assets);
    const html=strFromU8(unzipSync(zip)['index.html']);expect(html).toContain('src="media/');expect(html).not.toContain('src="https://');expect(html).toContain('图片说明');
  });
  it('refuses to label missing pictures or unchecked text as a complete archive',async()=>{
    const a=answer();expect(missingMedia(a)).toEqual([url]);await expect(createArchive(a)).rejects.toThrow('媒体');
    a.assets=[await assetFromBytes(url,png,'image/png')];a.source.imported!.completeness='unverified';await expect(createArchive(a)).rejects.toThrow('核对全文');
  });
  it('detects corrupt image bytes and missing archive media',async()=>{
    const a=answer();a.assets=[await assetFromBytes(url,png,'image/png')];const zip=unzipSync(await createArchive(a));const path=Object.keys(zip).find(k=>k.startsWith('media/'))!;delete zip[path];await expect(readArchive(zipSync(zip))).rejects.toThrow('缺少');
    a.assets[0].sha256='0'.repeat(64);await expect(createArchive(a)).rejects.toThrow('校验');
  });
  it('rejects traversal archive names before restoring anything',async()=>{
    await expect(readArchive(zipSync({'../answer.json':strToU8('{}')}))).rejects.toThrow('路径');
  });
});
describe('bounded remote import',()=>{
  it('blocks SSRF and cross-host redirects without fetching the destination',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}}));vi.stubGlobal('fetch',fetcher);
    const blocked=await app.request('http://local.test/api/import/media?url='+encodeURIComponent('https://localhost/a.png'),{},{});expect(blocked.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
    const redirected=await app.request('http://local.test/api/import/media?url='+encodeURIComponent(url),{},{});expect(redirected.status).toBe(422);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('checks actual media bytes and rejects HTML disguised as images',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('<script>oops</script>',{headers:{'content-type':'image/png'}})).mockResolvedValueOnce(new Response(png));vi.stubGlobal('fetch',fetcher);
    const endpoint='http://local.test/api/import/media?url='+encodeURIComponent(url);
    expect((await app.request(endpoint,{},{})).status).toBe(422);
    const ok=await app.request(endpoint,{},{});expect(ok.headers.get('content-type')).toBe('image/png');expect(new Uint8Array(await ok.arrayBuffer())).toEqual(png);
  });
  it('reports login blocks instead of importing an error page',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('登录知乎',{status:403})));
    const r=await app.request('http://local.test/api/import/answer?url=123',{},{});expect(r.status).toBe(422);expect((await r.json()).code).toBe('SOURCE_UNAVAILABLE');
  });
  it('accepts long imported sources at the transport layer without slicing them',async()=>{
    const source=plainSource('完整'.repeat(100000));
    const r=await app.request('http://local.test/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,instruction:'读取全文',selectedParagraphIds:[],tier:'balanced'})},{});
    expect(r.status).toBe(503);expect(await r.text()).toContain('尚未连接模型');
  });
});
