function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{const r=indexedDB.open('yida-world-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('local');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
}
export async function readLocal<T>(key:string, fallback:T):Promise<T>{
  try{const d=await db();return await new Promise<T>((resolve,reject)=>{const t=d.transaction('local');const r=t.objectStore('local').get(key);r.onsuccess=()=>resolve(r.result??fallback);r.onerror=()=>reject(r.error);t.oncomplete=()=>d.close()})}catch{return fallback}
}
export async function writeLocal(key:string,value:unknown):Promise<void>{
  const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('local','readwrite');t.objectStore('local').put(value,key);t.oncomplete=()=>{d.close();resolve()};t.onerror=()=>{d.close();reject(t.error)}});
}
export function downloadJSON(value:unknown,name:string){
  const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
