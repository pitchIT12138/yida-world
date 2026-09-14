import type {Answer,AnswerSource,AnswerArtifact,SourceAsset} from './types';
import {validateSource,validateArtifact} from './validation';
export type CuratedEnvelope={source:AnswerSource;artifact:AnswerArtifact;assets?:SourceAsset[]};
export function mergeCurated(seeds:Answer[],curated:CuratedEnvelope[]):Answer[]{
 const result=structuredClone(seeds);
 for(const item of curated){validateSource(item.source);const artifact=validateArtifact(item.artifact,item.source);const answer=result.find(a=>a.source.id===item.source.id);
 if(!answer)result.push({source:item.source,artifact,assets:item.assets,votes:0,accent:'#477866',tag:'精选回答'});
 else {answer.source=item.source;answer.artifact=artifact;answer.assets=item.assets}}
 return result;
}
