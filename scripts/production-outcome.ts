import {ArtifactRejected} from '../server/generation';
export type ProductionOutcome='published'|'content_rejected'|'dedup_skipped'|'system_failed';
export function failureOutcome(error:unknown):ProductionOutcome{return error instanceof ArtifactRejected?'content_rejected':'system_failed'}
export function intakeOutcome(result:{deduplicated?:boolean}){return result.deduplicated?'dedup_skipped':'queued'}
