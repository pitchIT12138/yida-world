import type {AnswerSource} from './types';
export const featuredAnswerIds=[
 'studio-eefcec7e-a1e9-45f9-81e3-4d3228feb20c',
 'studio-baa43112-f206-4e48-86d1-3d1427326601',
 'studio-3d0c8ad5-ea44-4f61-9530-f086b7135a6f',
 'studio-ca582c0a-44f3-40e0-8f77-7860e45d4aed',
 'studio-53d8ab39-7517-4a98-bc62-ede592b2c041',
 'story-1747681485547843585','knowledge-1523701957479239680'
];
// Editorial order is data, independent of the interaction renderer.
export function realAnswersFirst<T extends {source:AnswerSource}>(answers:T[]):T[]{
 const rank=(a:T)=>{const i=featuredAnswerIds.indexOf(a.source.id);return i>=0?i:a.source.origin==='original'?100:50};
 return [...answers].sort((a,b)=>rank(a)-rank(b));
}
export function publicReadingAnswers<T extends {source:AnswerSource}>(defaults:T[],published:T[]):T[]{
 return realAnswersFirst([...defaults,...published.filter(a=>!defaults.some(b=>b.source.id===a.source.id))]);
}
