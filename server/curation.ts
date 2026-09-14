import type {Answer} from '../src/lib/types';
import {validateSource,validateArtifact} from '../src/lib/validation';
import {validateLibraryReferences} from '../src/lib/interaction-library';
import {createHash} from 'node:crypto';
export function publicCandidate(item:Answer){
 validateSource(item.source);if(!item.artifact)throw Error('没有可验收产物');validateArtifact(item.artifact,item.source);validateLibraryReferences(item.artifact);
 if(/test|fixture|mock/i.test(item.artifact.provenance.model+' '+item.artifact.provenance.runId))throw Error('测试数据不得加入精选');
 if(createHash('sha256').update(JSON.stringify(item.source)).digest('hex')!==item.artifact.provenance.sourceHash)throw Error('原文指纹不一致');
 return {source:item.source,assets:item.assets,artifact:{...item.artifact,provenance:{...item.artifact.provenance,prompt:'按作者要求加工；内部备注留存在本地工作台。'}}};
}
