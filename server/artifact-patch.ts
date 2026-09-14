// Model-authored, bounded JSON patches avoid regenerating unrelated working code.
// The server still validates the complete artifact after applying every patch.
const roots=new Set(['version','answerId','explanation','blocks','bindings','scene','design','libraryReferences']);
export function applyArtifactPatches(base:unknown,patches:unknown):any{
 if(!base||!Array.isArray(patches)||!patches.length||patches.length>80||JSON.stringify(patches).length>300000)throw Error('修复补丁数量或体积无效');
 const value=structuredClone(base) as any;
 for(const p of patches){
  if(!p||!['add','replace','remove'].includes(p.op)||typeof p.path!=='string'||!p.path.startsWith('/'))throw Error('修复补丁格式无效');
  const parts=p.path.slice(1).split('/').map((s:string)=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(!roots.has(parts[0])||parts.some((s:string)=>['__proto__','constructor','prototype',''].includes(s)))throw Error('修复补丁路径不允许');
  let parent=value;for(const key of parts.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))throw Error('修复补丁父路径不存在');parent=parent[key]}
  const key=parts.at(-1)!;if(!parent||typeof parent!=='object')throw Error('修复补丁父路径不是对象');
  if(p.op!=='remove'&&!Object.hasOwn(p,'value'))throw Error('修复补丁缺少value');
  if(Array.isArray(parent)){const index=key==='-'&&p.op==='add'?parent.length:/^(0|[1-9]\d*)$/.test(key)?Number(key):-1;if(index<0||index>parent.length||(p.op!=='add'&&index===parent.length))throw Error('修复补丁数组下标无效');if(p.op==='remove')parent.splice(index,1);else if(p.op==='add')parent.splice(index,0,structuredClone(p.value));else parent[index]=structuredClone(p.value)}
  else{if(p.op!=='add'&&!Object.hasOwn(parent,key))throw Error('修复补丁 '+p.path+' 目标不存在：新增字段请使用 op=add；replace 只替换已存在字段');if(p.op==='remove')delete parent[key];else parent[key]=structuredClone(p.value)}
 }return value;
}
export const PATCH_INSTRUCTION='当前 candidate 是上一次产物。优先只返回JSON {"patches":[{"op":"replace","path":"/blocks/0/js","value":"修好的完整该字段字符串"}]}，只修改错误所需字段，避免重新输出正确代码。字段不存在必须op=add，已有字段才用op=replace；remove删除已有字段。支持数组下标，允许根字段blocks/bindings/scene/design/explanation/libraryReferences/version/answerId；不得改provenance。路径必须是candidate实际结构。若不存在可解析candidate才返回完整artifact。补丁由服务端合入后仍执行全部校验。';
