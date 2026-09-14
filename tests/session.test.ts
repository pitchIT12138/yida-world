import { describe,expect,it } from 'vitest';
import { mergeSavedAnswers } from '../src/lib/answers';
import { validateArtifact } from '../src/lib/validation';
import { fixture,source } from './fixtures';
import type {Answer} from '../src/lib/types';
const answer=(artifact?:ReturnType<typeof fixture>):Answer=>({source,artifact,votes:0,accent:'#aaa',tag:'test'});
describe('Codex session artifacts',()=>{
  it('accepts explicit session provenance and keeps API tiers distinct',()=>{
    const a=fixture();a.provenance.method='codex';a.provenance.tier='session';
    expect(validateArtifact(a,source)).toBe(a);
    a.provenance.method='api';
    expect(()=>validateArtifact(a,source)).toThrow();
  });
  it('adds new default artifacts to old source-only browser saves',async()=>{
    const a=fixture();
    expect((await mergeSavedAnswers([answer(a)],[answer()]))[0].artifact).toEqual(a);
  });
  it('retains local modifications and personal articles when defaults change',async()=>{
    const local=fixture();local.explanation='local edit';
    const personal={...answer(),source:{...source,id:'personal-extra'}};
    const result=await mergeSavedAnswers([answer(fixture())],[answer(local),personal]);
    expect(result[0].artifact?.explanation).toBe('local edit');expect(result[1]).toEqual(personal);
  });
});

it('upgrades only an exact historical default, preserving edits with the same run id',async()=>{
  const old=fixture(),next=fixture();next.explanation='new baseline';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(old)));
  const history={[old.provenance.runId]:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
  expect((await mergeSavedAnswers([answer(next)],[answer(old)],history))[0].artifact).toEqual(next);
  old.blocks[0].css+='button{color:red}';
  expect((await mergeSavedAnswers([answer(next)],[answer(old)],history))[0].artifact).toEqual(old);
});
