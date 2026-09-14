import superseded from '../data/baselines/superseded.json';
import type { Answer } from './types';
export async function mergeSavedAnswers(defaults:Answer[],local:Answer[],history:Record<string,string>=superseded):Promise<Answer[]> {
  const saved=new Map(local.map(a=>[a.source.id,a]));
  const result=await Promise.all(defaults.map(async base=>{
    const previous=saved.get(base.source.id);
    if(!previous)return base;
    if(previous.workspace)return previous;
    if(JSON.stringify(previous.source)!==JSON.stringify(base.source))return previous;
    if(previous.artifact){
      const expected=history[previous.artifact.provenance.runId];
      if(!expected||!base.artifact)return previous;
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(previous.artifact)));
      const actual=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==expected)return previous;
    }
    return {...previous,artifact:base.artifact};
  }));
  return [...result,...local.filter(a=>!defaults.some(b=>b.source.id===a.source.id))];
}
