import type { DrawerDocument } from './document';
export interface Draft { document:DrawerDocument; photo:File|null; id:string|null; revision:number; photoPath:string|null; dirty?:boolean; photoChanged?:boolean; }
function database():Promise<IDBDatabase> { return new Promise((resolve,reject)=>{
 const request=indexedDB.open('boxable-drafts',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
}); }
export async function readDraft(key:string):Promise<Draft|undefined> {
 const db=await database();try{return await new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function writeDraft(key:string,value:Draft|null) {
 const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');if(value)tx.objectStore('drafts').put(value,key);else tx.objectStore('drafts').delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
