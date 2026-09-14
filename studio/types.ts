import type {Answer} from '../src/lib/types';
export type Note={id:string;paragraphId:string;quote:string;text:string};
export type StudioAnswer=Answer & {studio:{notes:Note[];feedback:string;tags:string[];status:'draft'|'candidate'|'accepted';review?:string}};
export function status(a:StudioAnswer){return a.reference?'待更新':a.studio.status==='accepted'?'已精选':a.artifact?'待验收':'待加工'}
