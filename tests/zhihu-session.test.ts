import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ZhihuSession} from '../src/lib/zhihu-session';
import {richSource} from '../src/lib/rich-source';

const id='a'.repeat(64),url='https://www.zhihu.com/answer/123';
const source=(address=url)=>richSource('<p>完整正文与末段</p>',{url:address,method:'url'});
let session:ZhihuSession,authenticated:boolean,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  session=new ZhihuSession();authenticated=false;
  fetcher=vi.fn(async(path:string,options:RequestInit={})=>{
    if(path==='/api/manual-browser'&&options.method==='POST')return Response.json({id});
    if(path.endsWith('/status'))return Response.json({authenticated});
    if(path.startsWith('/api/import/answer'))return Response.json({source:source(new URL(path,'http://fixture').searchParams.get('url')!)});
    return Response.json({ok:true});
  });vi.stubGlobal('fetch',fetcher);
});
afterEach(async()=>{await session.close();vi.unstubAllGlobals()});
const reads=()=>fetcher.mock.calls.filter(([path])=>path.startsWith('/api/import/answer'));
describe('QR login and pasted links share one session',()=>{
  it('queues a pasted link until login completes, then reads automatically in the same session',async()=>{
    const result=session.import(url);await vi.waitFor(()=>expect(session.current.phase).toBe('login'));
    expect(reads()).toHaveLength(0);authenticated=true;await session.check();
    expect(await result).toEqual(source());expect(session.current.phase).toBe('ready');
    expect(reads()[0][1].headers).toMatchObject({'X-Reader-Session':id,'X-Reader-Client':'yida'});
    expect(fetcher.mock.calls.filter(([p])=>p.endsWith('/action'))).toHaveLength(0);
  });
  it('reuses an already scanned session across successive answer links',async()=>{
    authenticated=true;await session.start();await session.import(url);await session.import('https://www.zhihu.com/answer/456');
    expect(reads()).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([p,o])=>p==='/api/manual-browser'&&o.method==='POST')).toHaveLength(1);
  });
  it('keeps the newest pasted link while login is pending',async()=>{
    const first=session.import(url).catch(e=>e.code);await vi.waitFor(()=>expect(session.current.phase).toBe('login'));
    const second=session.import('https://www.zhihu.com/answer/456');expect(await first).toBe('SUPERSEDED');
    authenticated=true;await session.check();expect((await second).id).toBe('zhihu-456');expect(reads()).toHaveLength(1);
  });
  it('waits for a final QR frame operation instead of failing the import',async()=>{
    authenticated=true;await session.start();fetcher.mockResolvedValueOnce(Response.json({code:'SESSION_BUSY'},{status:409}));
    expect(await session.import(url)).toEqual(source());expect(reads()).toHaveLength(2);
  });
  it('keeps the link across session expiry and resumes after a new scan',async()=>{
    authenticated=true;await session.start();authenticated=false;
    fetcher.mockResolvedValueOnce(Response.json({code:'SESSION_EXPIRED'},{status:410}));
    const result=session.import(url);await vi.waitFor(()=>expect(session.current.phase).toBe('login'));
    expect(session.current.pendingURL).toBe(url);authenticated=true;await session.check();expect(await result).toEqual(source());
    expect(fetcher.mock.calls.filter(([p,o])=>p==='/api/manual-browser'&&o.method==='POST')).toHaveLength(2);
  });
  it('cancels a pending import on explicit disconnect',async()=>{
    const pending=session.import(url).catch(e=>e.code);await vi.waitFor(()=>expect(session.current.phase).toBe('login'));
    await session.close();expect(await pending).toBe('CANCELLED');expect(session.current.phase).toBe('disconnected');
    expect(reads()).toHaveLength(0);expect(fetcher.mock.calls.some(([,o])=>o.method==='DELETE')).toBe(true);
  });
});
