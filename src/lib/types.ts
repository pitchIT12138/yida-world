export type ModelTier = 'balanced' | 'frontier';
export type Paragraph = { id: string; text: string; html?: string };
export type ImportRecord = { method: 'clipboard'|'file'|'url'|'official'; completeness: 'unverified'|'confirmed'|'partial'; notes: string[] };
export type SourceAsset = { url: string; mime: string; data: string; sha256: string };
export type AnswerSource = {
  id: string; title: string; author: string; bio: string; avatar: string;
  paragraphs: Paragraph[]; origin: 'original' | 'knowledge' | 'story' | 'personal' | 'zhihu';
  sourceUrl?: string; workId?: string; sourceAuthor?: string; excerpt?: boolean;
  imported?: ImportRecord;
  fetchedAt?:string; publishedAt?:string; bodyScope?:string;
};
export type SceneStep = {
  action: 'focus' | 'highlight' | 'annotate' | 'reveal' | 'compare' | 'restore';
  target: string; text?: string; title?: string;
  demo?: { event:'click'|'input'; selector:string; value?:string };
};
export type DesignBaseline = {
  version:string; intent:string; readingFlow:string; voice:string;
  style:{palette:string[];typography:string;surface:string;motion:string};
  decisions:{title:string;reason:string;tradeoff:string}[];
  components:{blockId:string;purpose:string;whyHere:string;interaction:string;implementation:string;checks:string[]}[];
};
export type DemoCommand = NonNullable<SceneStep['demo']> & {id:string};
export type InteractiveBlock = {
  mediaUrls?: string[];
  replaceParagraphIds?: string[];
  id: string; afterParagraphId: string; title: string;
  html: string; css: string; js: string; height: number; kind?:'inline'|'figure'|'experience'|'aside';
};
export type TextBinding = { id: string; paragraphId: string; label: string; initial: string; hidden?:boolean };
export type AnswerArtifact = {
  presentation?: {version:1; leadBlockId:string; cue:string; nodes:{blockId:string;label:string}[]};
  libraryReferences?: import('./interaction-library').LibraryReference[];
  version: 1; answerId: string; explanation: string; blocks: InteractiveBlock[];
  bindings: TextBinding[]; scene: SceneStep[]; design?:DesignBaseline;
  provenance: { method: 'api' | 'codex'; runId: string; sourceHash: string; model: string; tier: ModelTier | 'session'; createdAt: string; prompt: string; reasoningEffort?:'none'|'low'|'high'|'max'; baselineVersion?:string;baselineHash?:string;normalizations?:string[]; repairCount?:number; elapsedMs?: number; usage?: Record<string, number> };
};
export type AnswerWorkspace = { revision:number; idea:string; selectedParagraphIds:string[]; updatedAt:string; lastError?:string };
export type AnswerVersion = { id:number; kind:string; createdAt:string; instruction:string; title:string };
export type Answer = { source: AnswerSource; artifact?: AnswerArtifact; assets?: SourceAsset[]; votes: number; accent: string; tag: string; workspace?:AnswerWorkspace; reference?:{source:AnswerSource;artifact:AnswerArtifact} };
export type GenerationInput = {
  source: AnswerSource; current?: AnswerArtifact; previous?:{source:AnswerSource;artifact:AnswerArtifact}; selectedParagraphIds: string[];
  instruction: string; tier: ModelTier; repair?: { message: string; candidate: AnswerArtifact; ticket: string };
};
export type GenerationEvent =
  | { type: 'status'; stage: string; message: string; elapsedMs?:number }
  | { type: 'result'; artifact: AnswerArtifact; repairTicket?: string }
  | { type: 'error'; message: string; code: string };
export type GenerationSnapshot = {runId:string;requestId:string;startedAt:number;updatedAt:number;deadlineAt:number;event:GenerationEvent};
export type PublicConfig = { authRequired?:boolean; loginConfigured?:boolean; user?:{id:string;name:string;avatar:string}|null; workspaceEnabled?:boolean; generationEnabled: boolean; tiers: ModelTier[]; timeoutMs: number; reason?: string };
export type ContentSummary = { work_id: string; title: string; description?: string; labels?: string[] };
export type ContentDetail = { work_id: string; chapter_name: string; author_name?: string; introduction?: string; content: string };
