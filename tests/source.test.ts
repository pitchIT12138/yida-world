import { describe, expect, it } from 'vitest';
import { previewSource } from '../src/lib/source';
import { validateArtifact, validateSource } from '../src/lib/validation';
import { source as testSource, fixture } from './fixtures';
import { seedAnswers } from '../src/data/seeds';

describe('source preview',()=>{
  it('rejects absent IDs and paths in imported generation records',()=>{
    expect(()=>validateSource({...testSource,id:undefined})).toThrow();
    const artifact=fixture();
    artifact.provenance.runId='../../outside';
    expect(()=>validateArtifact(artifact,testSource)).toThrow();
  });
  it('keeps merged official paragraphs and author attribution when saving a preview',()=>{
    const source=seedAnswers.find(a=>a.source.origin==='story')!.source;
    expect(source.paragraphs).toHaveLength(60);
    expect(source.paragraphs[59].text).toContain('\n');
    const preview=previewSource('mine-imported','ignored','ignored','ignored',source);
    expect(preview.paragraphs.map(p=>p.text)).toEqual(source.paragraphs.map(p=>p.text));
    expect(preview.sourceAuthor).toBe(source.sourceAuthor);
    expect(preview.sourceUrl).toBe(source.sourceUrl);
    expect(preview.paragraphs.every(p=>p.id.startsWith('mine-imported-p'))).toBe(true);
  });
  it('still rejects an oversized original answer and creates stable paragraph IDs',()=>{
    expect(()=>previewSource('mine-test','title',Array(61).fill('line').join('\n'),'me')).toThrow();
    const preview=previewSource('mine-test',' title ','first\n\nsecond',' me ');
    expect(preview.paragraphs).toEqual([{id:'mine-test-p0',text:'first'},{id:'mine-test-p1',text:'second'}]);
    expect(preview.origin).toBe('personal');
  });
});
