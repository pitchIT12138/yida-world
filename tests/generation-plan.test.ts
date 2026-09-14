import {describe,it,expect} from 'vitest';
import {validatePlan,presentationDefaults,normalizePlanEnvelope} from '../server/generation-plan';
import {applyArtifactPatches} from '../server/artifact-patch';
import {ArtifactRejected} from '../server/generation';
import {failureOutcome,intakeOutcome} from '../scripts/production-outcome';
import {fixture,source} from './fixtures';
const contract={blockId:'block-one',controls:[{selector:'#add',action:'click',effect:'增加'}],reads:[],writes:['count'],feedback:'计数从0增加'};
describe('composed generation contract',()=>{
 it('checks the source anchors and rejects undeclared shared state before generating code',()=>{const a=fixture();const plan={format:'interaction-plan-v1',artifact:a,contracts:[contract]};expect(validatePlan(plan,source,[],a.provenance).artifact.blocks[0].js).toBe('');expect(()=>validatePlan({...plan,contracts:[{...contract,writes:['not-declared']}]},source,[],a.provenance)).toThrow('binding ID');a.blocks[0].afterParagraphId='wrong';expect(()=>validatePlan(plan,source,[],a.provenance)).toThrow('超出了');});
 it('only supplies absent display metadata, leaving invalid values and all authored code for validation',()=>{const a:any=fixture(),js=a.blocks[0].js;delete a.blocks[0].height;expect(presentationDefaults(a)).toEqual(['blocks[0] (block-one).height: omitted → 480']);expect(a.blocks[0].js).toBe(js);a.blocks[0].height=-10;expect(presentationDefaults(a)).toEqual([]);expect(a.blocks[0].height).toBe(-10)});
 it('explains add versus replace with a concrete missing field path',()=>{expect(()=>applyArtifactPatches({blocks:[{}]},[{op:'replace',path:'/blocks/0/height',value:480}])).toThrow('/blocks/0/height');expect(applyArtifactPatches({blocks:[{}]},[{op:'add',path:'/blocks/0/height',value:480}]).blocks[0].height).toBe(480)});
 it('does not hide infrastructure failure or make a duplicate consume new work',()=>{expect(failureOutcome(new ArtifactRejected('内容错误'))).toBe('content_rejected');expect(failureOutcome(new Error('浏览器无法启动'))).toBe('system_failed');expect(intakeOutcome({deduplicated:true})).toBe('dedup_skipped')});
});

it('normalizes one misplaced contract envelope without changing or resolving conflicting content',()=>{const artifact:any=fixture();artifact.contracts=[contract];const value:any={format:'interaction-plan-v1',artifact};expect(normalizePlanEnvelope(value)).toHaveLength(1);expect(value.contracts).toEqual([contract]);expect(value.artifact.contracts).toBeUndefined();expect(validatePlan(value,source,[],artifact.provenance).contracts).toEqual([contract]);value.artifact.contracts=['conflict'];expect(normalizePlanEnvelope(value)).toEqual([]);expect(value.artifact.contracts).toEqual(['conflict'])});
