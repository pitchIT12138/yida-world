import {afterEach,describe,it,expect,vi} from 'vitest';
import {callModel,profile} from '../server/model';
const env={BALANCED_API_BASE:'https://example.com',BALANCED_API_KEY:'test-key',BALANCED_MODEL:'test-model'};
afterEach(()=>vi.unstubAllGlobals());
describe('explicit model reasoning budget',()=>{
 it('sends reasoning effort only when configured for the compatible protocol',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}]})));vi.stubGlobal('fetch',fetcher);
  await callModel(profile({...env,BALANCED_REASONING_EFFORT:'none'},'balanced')!,'system','input',new AbortController().signal,12000);
  expect(JSON.parse((fetcher.mock.calls[0] as any)[1].body).reasoning_effort).toBe('none');
  expect(profile(env,'balanced')?.reasoningEffort).toBeUndefined();
  expect(profile({...env,BALANCED_REASONING_EFFORT:'none',BALANCED_PROVIDER:'anthropic'},'balanced')?.reasoningEffort).toBeUndefined();
 });
 it('reports provider token truncation instead of accepting incomplete or blank code',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:''},finish_reason:'length'}]}))));
  await expect(callModel(profile(env,'balanced')!,'system','input',new AbortController().signal,12000)).rejects.toThrow('token 上限');
 });
});
