import {parseModelJSON} from '../src/lib/validation';
// Recover only a missing array closer before an object closer or the next object property. Strings (including
// generated code) are copied byte-for-byte. Truncation, missing values and quotes fail.
export function modelJSON(text:string):{value:any;normalizations:string[]}{
 try{return {value:parseModelJSON(text),normalizations:[]}}catch(original){
  let input=text.trim().replace(/^```json\s*/,'').replace(/```$/,'').trim(),out='',quoted=false,escaped=false;const stack:string[]=[],normalizations:string[]=[];
  for(let i=0;i<input.length;i++){const ch=input[i];if(quoted){out+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue}
   if(ch==='"'){quoted=true;out+=ch;continue}
   // A completed object in an array followed by an object property cannot be valid
   // JSON until the array closes. Insert only that delimiter, never edit strings.
   if(ch===','&&stack.at(-1)==='['&&/[}\]]$/.test(out.trimEnd())&&/^\s*"(?:[^"\\]|\\.)*"\s*:/.test(input.slice(i+1))){stack.pop();out+=']';normalizations.push('补全 JSON 数组闭合标记（下一对象字段之前），位置 '+i);if(normalizations.length>8)throw original}
   if(ch==='{'||ch==='[')stack.push(ch);
   if(ch==='}'||ch===']'){
    if(ch==='}'&&stack.at(-1)==='['&&/[}\]]$/.test(out.trimEnd())){stack.pop();out+=']';normalizations.push('补全 JSON 数组闭合标记，位置 '+i);if(normalizations.length>8)throw original}
    if(stack.pop()!==(ch==='}'?'{':'['))throw original;
   }out+=ch;
  }
  if(quoted||stack.length||!normalizations.length)throw original;
  try{return {value:JSON.parse(out),normalizations}}catch{throw original}
 }
}
