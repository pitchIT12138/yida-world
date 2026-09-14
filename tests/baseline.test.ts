import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {selectBaseline} from '../server/baseline';
import {validateArtifact} from '../src/lib/validation';
import {fixture,source} from './fixtures';
import type {AnswerArtifact,AnswerSource,GenerationInput} from '../src/lib/types';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const catalog=JSON.parse(readFileSync('src/data/baselines/catalog.json','utf8'));
const generated=readdirSync('src/data/generated').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync('src/data/generated/'+f,'utf8')) as {source:AnswerSource;artifact:AnswerArtifact});
describe('saved design baselines',()=>{
  it('keeps the initial reading index synchronized without embedding saved image bytes',()=>{
    const files=readdirSync('src/data/generated').filter(f=>f.endsWith('.json'));
    expect(readdirSync('src/data/curated-index').filter(f=>f.endsWith('.json')).sort()).toEqual(files.sort());
    for(const file of files){
      const full=JSON.parse(readFileSync('src/data/generated/'+file,'utf8'));
      const index=JSON.parse(readFileSync('src/data/curated-index/'+file,'utf8'));
      expect(index).toEqual({source:full.source,artifact:full.artifact,hasSavedMedia:!!full.assets?.length});
      expect(index.assets).toBeUndefined();
    }
  });
  it('matches each frozen article, component code and archived snapshot',()=>{
    expect(generated).toHaveLength(Object.keys(catalog).length);
    expect(generated.length).toBeGreaterThanOrEqual(17);
    for(const item of generated){
      validateArtifact(item.artifact,item.source);
      const entry=catalog[item.source.id];
      expect(entry.sourceHash).toBe(sha(item.source));
      expect(entry.design).toEqual(item.artifact.design);
      for(const b of item.artifact.blocks)expect(entry.codeHashes[b.id]).toBe(sha({html:b.html,css:b.css,js:b.js}));
      const archive=JSON.parse(readFileSync('artifacts/baseline-history/'+entry.historyFile,'utf8'));
      expect(archive.design).toEqual(entry.design);expect(archive.codeHashes).toEqual(entry.codeHashes);
    }
  });
  it('uses a frozen baseline only for the exact original text',()=>{
    const item=generated[0];
    const input:GenerationInput={source:item.source,selectedParagraphIds:[],instruction:'加工',tier:'balanced'};
    expect(selectBaseline(input,sha(item.source))).toEqual(item.artifact.design);
    expect(selectBaseline(input,'different-source')).toBeUndefined();
  });
  it('continues the current author revision before consulting the default',()=>{
    const current=fixture();current.design!.version='author-revision';
    expect(selectBaseline({source,current,selectedParagraphIds:[],instruction:'修改',tier:'balanced'},'hash')).toBe(current.design);
  });
});
