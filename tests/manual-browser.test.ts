import {afterEach,describe,it,expect,vi} from 'vitest';
import app from '../server/app';
import {manualURL,validateManualAction,isManualResource} from '../src/lib/manual-browser';
import {richSource} from '../src/lib/rich-source';
const env={COLLECTOR_URL:'https://reader.example.test',COLLECTOR_TOKEN:'fixture-private-server-credential'};
const id='a'.repeat(64),url='https://www.zhihu.com/answer/123';
const headers={'X-Reader-Client':'yida','X-Reader-Session':id,'Content-Type':'application/json'};
afterEach(()=>vi.unstubAllGlobals());
describe('manual browser actions and capability proxy',()=>{
  it('loads the observed normal login CAPTCHA resources without opening arbitrary destinations',()=>{
    for(const u of ['https://cstaticdun.126.net/load.min.js','https://c.dun.163.com/api/v3/getconf','https://necaptcha.nosdn.127.net/image.png','https://necaptcha-nosdn.126.net/image.png','https://ir-sdk.dun.163.com/script.js','https://cstaticdun1.126.net/backup.js','https://picx.zhimg.com/a.jpg'])expect(isManualResource(u)).toBe(true);
    for(const u of ['https://cstaticdun.126.net.evil.test/load.min.js','https://127.0.0.1/a','http://c.dun.163.com/a','https://mail.163.com/','https://user:pass@www.zhihu.com/'])expect(isManualResource(u)).toBe(false);
  });
  it('allows only known Zhihu navigation and bounded human input',()=>{
    expect(manualURL(url)).toBe(url);expect(manualURL('https://www.zhihu.com/signin')).toContain('/signin');
    for(const a of [{type:'navigate',url:'https://evil.test/'},{type:'evaluate',code:'alert(1)'},{type:'click',x:1280,y:1},{type:'click',x:0,y:NaN},{type:'text',text:'x'.repeat(2001)},{type:'drag',points:[{x:1,y:1}]},{type:'key',key:'Meta+L'},{type:'pointer',phase:'evaluate',x:1,y:2}])expect(()=>validateManualAction(a)).toThrow();
    expect(validateManualAction({type:'click',x:5,y:10,extra:'ignored'})).toEqual({type:'click',x:5,y:10});
  });
  it('requires same origin and the custom client header before contacting the reader',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    expect((await app.request('http://app.test/api/manual-browser',{method:'POST',body:'{}'},env)).status).toBe(403);
    expect((await app.request('http://app.test/api/manual-browser',{method:'DELETE',headers:{...headers,Origin:'https://evil.test'}},env)).status).toBe(403);
    expect((await app.request('http://app.test/api/manual-browser/screen',{headers:{'X-Reader-Client':'yida'}},env)).status).toBe(410);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps the upstream credential and cookies out of created session responses',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id,width:1280,height:800,token:env.COLLECTOR_TOKEN,cookies:'do-not-forward'}),{headers:{'Set-Cookie':'upstream=private'}}));vi.stubGlobal('fetch',fetcher);
    const response=await app.request('http://app.test/api/manual-browser',{method:'POST',headers,body:JSON.stringify({url})},env);
    expect(response.status).toBe(201);expect(await response.json()).toEqual({id,width:1280,height:800});expect(response.headers.get('set-cookie')).toBeNull();
    expect(fetcher.mock.calls[0][0].href).toBe('https://reader.example.test/sessions');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer '+env.COLLECTOR_TOKEN);
  });
  it('proxies only validated image frames with no caching',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})));
    const response=await app.request('http://app.test/api/manual-browser/screen',{headers},env);
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('image/jpeg');expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([255,216,255,217]));
  });
  it('preserves expired-session errors and rejects partial capture results',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'SESSION_EXPIRED',error:'窗口已过期'}),{status:410})));
    expect((await app.request('http://app.test/api/manual-browser/capture',{method:'POST',headers},env)).status).toBe(410);
    const source=richSource('<p>未展开的摘要</p>',{url,method:'url'});source.imported!.completeness='partial';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({source}))));
    expect((await app.request('http://app.test/api/manual-browser/capture',{method:'POST',headers},env)).status).toBe(502);
  });
  it('rejects arbitrary scripts and oversized input without invoking the reader',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const body of [{type:'evaluate',code:'document.cookie'},{type:'text',text:'x'.repeat(16001)}])expect((await app.request('http://app.test/api/manual-browser/action',{method:'POST',headers,body:JSON.stringify(body)},env)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
