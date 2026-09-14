import catalog from '../src/data/baselines/catalog.json';
import type {DesignBaseline,GenerationInput} from '../src/lib/types';
export function selectBaseline(input:GenerationInput,sourceHash:string):DesignBaseline|undefined{
  if(input.current?.design)return input.current.design;
  if(input.previous?.artifact.design)return input.previous.artifact.design;
  const entry=(catalog as Record<string,{sourceHash:string;design:DesignBaseline}>)[input.source.id];
  return entry?.sourceHash===sourceHash?entry.design:undefined;
}
