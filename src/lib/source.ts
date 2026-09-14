import type { AnswerSource } from './types';
import { validateSource } from './validation';

export function previewSource(id:string, title:string, body:string, author:string, imported?:AnswerSource):AnswerSource {
  const source:AnswerSource=imported
    ? {...imported,id,paragraphs:imported.paragraphs.map((p,i)=>({...p,id:id+'-p'+i}))}
    : {id,title:title.trim(),author:author.trim()||'我',bio:'我的回答',avatar:(author.trim()||'我').slice(0,1),origin:'personal',
      paragraphs:body.trim().split(/\n\s*\n|\n/).map(x=>x.trim()).filter(Boolean).map((text,i)=>({id:id+'-p'+i,text}))};
  return validateSource(source);
}
