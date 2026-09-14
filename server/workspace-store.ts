import type {Answer,AnswerVersion} from '../src/lib/types';
export class WorkspaceConflict extends Error {constructor(){super('回答已在另一个窗口更新，请重新打开后继续编辑。')}}
export interface WorkspaceStore {
  list():Promise<Answer[]>;
  save(answer:Answer,expectedRevision:number,kind:string):Promise<Answer>;
  versions(id:string):Promise<AnswerVersion[]>;
  version(id:string,version:number):Promise<Answer|undefined>;
}
