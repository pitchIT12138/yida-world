import type {AnswerSource} from './types';
// Preserve order within each group; only the explicitly fictional examples move back.
export function realAnswersFirst<T extends {source:AnswerSource}>(answers:T[]):T[]{
 return [...answers].sort((a,b)=>Number(a.source.origin==='original')-Number(b.source.origin==='original'));
}
