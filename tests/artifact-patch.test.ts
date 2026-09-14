import {describe,it,expect} from 'vitest';
import {applyArtifactPatches} from '../server/artifact-patch';
import {fixture,source} from './fixtures';
import {validateArtifact} from '../src/lib/validation';
describe('bounded model repair patches',()=>{
 it('replaces only the requested code and preserves input',()=>{const a=fixture(),before=structuredClone(a);const b=applyArtifactPatches(a,[{op:'replace',path:'/blocks/0/js',value:'document.body.textContent="fixed";'}]);expect(a).toEqual(before);expect(b.blocks[0].html).toBe(a.blocks[0].html);expect(b.blocks[0].js).toContain('fixed');validateArtifact(b,source)});
 it('supports array append, targeted step replacement and removal',()=>{const a=fixture();const b=applyArtifactPatches(a,[{op:'add',path:'/scene/-',value:{action:'focus',target:'p1'}},{op:'replace',path:'/scene/0/target',value:'p1'},{op:'remove',path:'/scene/1'}]);expect(b.scene).toHaveLength(a.scene.length);validateArtifact(b,source)});
 it.each(['/provenance/model','/blocks/0/__proto__/polluted','/blocks/999/js','/blocks/0/html/child'])('rejects unauthorized or invalid path %s',path=>{expect(()=>applyArtifactPatches(fixture(),[{op:'replace',path,value:'x'}])).toThrow()});
 it('does not bypass complete artifact validation',()=>{const b=applyArtifactPatches(fixture(),[{op:'replace',path:'/answerId',value:'another-source'}]);expect(()=>validateArtifact(b,source)).toThrow()});
});
