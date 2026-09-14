import {afterEach,describe,it,expect,vi} from 'vitest';
import app from '../server/app';
import {richSource} from '../src/lib/rich-source';

const url='https://www.zhihu.com/question/2079351385255163833/answer/2079743429878216427';
const challenge='<html><meta id="zh-zse-ck" content="fixture"><script src="https://static.zhihu.com/zse-ck/fixture.js"></script></html>';
const env={COLLECTOR_URL:'https://reader.example.test',COLLECTOR_TOKEN:'fixture-server-only-key'};
afterEach(()=>vi.unstubAllGlobals());
describe('share link rendered import routing',()=>{
  it('distinguishes a JS challenge from a missing login or a real answer',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(challenge,{status:403})));
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(url),{},{});
    expect(response.status).toBe(422);expect((await response.json()).code).toBe('PAGE_CHECK_REQUIRED');
  });
  it('passes only the requested canonical answer and a server credential to the renderer',async()=>{
    const source=richSource('<p>真正的回答正文</p><img src="https://picx.zhimg.com/original.png">',{url,author:'豆丁',method:'url'});
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(challenge,{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({source})));vi.stubGlobal('fetch',fetcher);
    const share='问题标题 - 豆丁的回答 - 知乎\n'+url;
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(share),{},env),body=await response.text();
    expect(response.status).toBe(200);expect(JSON.parse(body).source).toEqual(source);expect(body).not.toContain(env.COLLECTOR_TOKEN);
    expect(fetcher.mock.calls[1][0].href).toBe('https://reader.example.test/answer?url='+encodeURIComponent(url));
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer '+env.COLLECTOR_TOKEN);
  });
  it('rejects a rendered answer belonging to another ID',async()=>{
    const source=richSource('<p>另一篇回答</p>',{url:'https://www.zhihu.com/answer/123',method:'url'});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(challenge,{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({source}))));
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(url),{},env);
    expect(response.status).toBe(422);expect((await response.json()).code).toBe('READER_FAILED');
  });
  it('follows a same-answer canonical redirect without following a foreign destination',async()=>{
    const html='<div class="AnswerItem" name="2079743429878216427"><div class="RichContent-inner"><p>原文</p></div><a href="'+url+'">来源</a></div>';
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:url}})).mockResolvedValueOnce(new Response(html));vi.stubGlobal('fetch',fetcher);
    expect((await app.request('http://app.test/api/import/answer?url=2079743429878216427',{},{})).status).toBe(200);
    fetcher.mockReset().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://evil.test/answer/2079743429878216427'}}));
    expect((await app.request('http://app.test/api/import/answer?url=2079743429878216427',{},{})).status).toBe(422);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('authenticated link import',()=>{
  const session='d'.repeat(64),headers={'X-Reader-Client':'yida','X-Reader-Session':session};
  it('reads through the QR session and never tries anonymous HTTP first',async()=>{
    const source=richSource('<p>扫码后的完整正文</p>',{url,method:'url'});
    const fetcher=vi.fn().mockResolvedValue(Response.json({source}));vi.stubGlobal('fetch',fetcher);
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(url),{headers},env);
    expect(response.status).toBe(200);expect((await response.json()).source).toEqual(source);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0].pathname).toBe('/sessions/'+session+'/answer');
  });
  it('preserves expired session errors so the queued link can resume after scanning',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({code:'SESSION_EXPIRED',error:'已过期'},{status:410})));
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(url),{headers},env);
    expect(response.status).toBe(410);expect((await response.json()).code).toBe('SESSION_EXPIRED');
  });
  it('rejects malformed sessions without requesting another browser',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const response=await app.request('http://app.test/api/import/answer?url='+encodeURIComponent(url),{headers:{...headers,'X-Reader-Session':'invalid'}},env);
    expect(response.status).toBe(410);expect(fetcher).not.toHaveBeenCalled();
  });
});
