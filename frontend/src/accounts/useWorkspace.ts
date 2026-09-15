import { useCallback, useEffect, useRef, useState } from 'react';
import { newDocument, parseDocument, type DrawerDocument } from './document';
import { readDraft, writeDraft, type Draft } from './drafts';
import { cleanup, ConflictError, getDrawer, photoFile, saveDrawer, type DrawerRow } from './repository';

export function useWorkspace(userId:string|null){
 const key=userId?`user:${userId}`:'guest';
 const [draft,setDraft]=useState<Draft>({document:newDocument(),photo:null,id:userId?crypto.randomUUID():null,revision:0,photoPath:null,dirty:false});
 const [importing,setImporting]=useState(false),[importedSaved,setImportedSaved]=useState(false);
 const [ready,setReady]=useState(false),[status,setStatus]=useState(''),[conflict,setConflict]=useState(false),[retry,setRetry]=useState(0);
 const latest=useRef(draft);latest.current=draft;
 const paused=useRef(false),pendingSave=useRef<Promise<boolean>|null>(null);
 const alive=useRef(true),saving=useRef(false),photoSaved=useRef<File|null>(null),generation=useRef(0),localWrites=useRef(Promise.resolve()),importGuest=useRef(false);
 const persist=useCallback((value:Draft)=>{localWrites.current=localWrites.current.catch(()=>{}).then(()=>writeDraft(key,value));return localWrites.current;},[key]);
 useEffect(()=>{
  alive.current=true;let cancelled=false;
  void (async()=>{try{
   let restored=await readDraft(key);
   if(userId){const guest=await readDraft('guest');if(guest&&(guest.pendingAccountSave||sessionStorage.getItem('boxable-import-guest')==='yes')){restored={...guest,pendingAccountSave:false,id:null,revision:0,photoPath:null,dirty:true,photoChanged:!!guest.photo};importGuest.current=true;setImporting(true);}}
   if(restored&&!cancelled){if(userId&&!restored.id)restored.id=crypto.randomUUID();restored.document=parseDocument(restored.document);photoSaved.current=restored.photoPath?restored.photo:null;setDraft(restored);}
  }catch{if(alive.current)setStatus('The local recovery draft could not be read. Your cloud drawers are still available.');}finally{if(!cancelled)setReady(true);}})();
  if(userId)void cleanup(userId).catch(()=>{});
  return()=>{cancelled=true;alive.current=false;};
 },[key,userId]);
 useEffect(()=>{if(ready)void persist(draft).catch(()=>{if(alive.current)setStatus('Local recovery is unavailable. Keep this tab open until your drawer is saved.');});},[draft,ready,persist]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(latest.current.dirty){event.preventDefault();event.returnValue='';}};
  const online=()=>setRetry(v=>v+1);
  window.addEventListener('beforeunload',warn);window.addEventListener('online',online);
  return()=>{window.removeEventListener('beforeunload',warn);window.removeEventListener('online',online);};
 },[]);
 const saveCurrent=useCallback(():Promise<boolean>=>{
  if(pendingSave.current)return pendingSave.current;
  if(!ready||!userId||conflict||paused.current)return Promise.resolve(false);
  const current=latest.current,token=generation.current;
  if(!current.dirty&&current.revision>0)return Promise.resolve(true);
  saving.current=true;
  const id=current.id??crypto.randomUUID();
  setStatus('Saving…');
  const task=(async()=>{
   try{
    const row=await saveDrawer(userId,id,current.revision,current.document,current.photo,current.photoPath,!!current.photoChanged);
    if(!alive.current||token!==generation.current)return false;
    photoSaved.current=current.photo;
    const unchanged=latest.current.document===current.document&&latest.current.photo===current.photo;
    const next={...latest.current,id:row.id,revision:row.revision,photoPath:row.photo_path,photoChanged:latest.current.photo!==current.photo,dirty:!unchanged};
    latest.current=next;setDraft(next);setStatus(unchanged?'Saved':'Unsaved changes');
    if(importGuest.current){await persist(next);await writeDraft('guest',null);sessionStorage.removeItem('boxable-import-guest');importGuest.current=false;setImporting(false);setImportedSaved(true);}
    return true;
   }catch(error){if(alive.current&&token===generation.current){setConflict(error instanceof ConflictError);setStatus(error instanceof Error?error.message:'Could not save. Your changes are still in this tab.');}return false;}
  })();
  pendingSave.current=task.finally(()=>{saving.current=false;pendingSave.current=null;});
  return pendingSave.current;
 },[ready,userId,conflict,persist]);
 useEffect(()=>{
  if(!ready||!userId||!draft.dirty||conflict)return;
  if(!saving.current)setStatus('Unsaved changes');
  const timer=setTimeout(()=>{void saveCurrent();},1000);
  return()=>clearTimeout(timer);
 },[draft,ready,userId,conflict,retry,saveCurrent]);
 const save=async()=>{
  // Join an autosave already in progress, then flush any newer edits.
  do {if(!await saveCurrent())return false;} while(latest.current.dirty);
  return true;
 };
 const change=useCallback((update:(document:DrawerDocument)=>DrawerDocument,photo?:File|null)=>{setDraft(old=>{const document=update(old.document);const nextPhoto=photo===undefined?old.photo:photo;if(nextPhoto===old.photo&&JSON.stringify(document)===JSON.stringify(old.document))return old;return {...old,document,photo:nextPhoto,photoChanged:old.photoChanged||nextPhoto!==old.photo,dirty:true};});},[]);
 const canLeave=()=>!saving.current&&(!latest.current.dirty||window.confirm('This drawer has unsaved changes. Leave and discard those changes?'));
 const fresh=()=>{if(!canLeave())return false;generation.current++;photoSaved.current=null;setDraft({document:newDocument(),photo:null,id:userId?crypto.randomUUID():null,revision:0,photoPath:null,dirty:!!userId});setConflict(false);setStatus('');return true;};
 const open=async(row:Pick<DrawerRow,'id'>)=>{if(!canLeave())return false;const token=++generation.current,snapshot=latest.current;setStatus('Opening…');try{
  const loaded=await getDrawer(row.id);const photo=loaded.photo_path?await photoFile(loaded.photo_path):null;
  if(!alive.current||token!==generation.current)return false;
  if(latest.current.document!==snapshot.document||latest.current.photo!==snapshot.photo){setStatus('Your current drawer changed while opening. Please try again.');return false;}
  photoSaved.current=photo;setDraft({document:loaded.document,photo,id:loaded.id,revision:loaded.revision,photoPath:loaded.photo_path,dirty:false});setConflict(false);setStatus('Saved');return true;
 }catch{setStatus('Could not open this drawer or its photo. Try again.');return false;}};
 const beforeAuth=async(saveRequested=false)=>{const next=saveRequested?{...latest.current,pendingAccountSave:true}:latest.current;await persist(next);latest.current=next;setDraft(next);if(!userId&&(latest.current.dirty||latest.current.document.drawer.widthMm>0)){sessionStorage.setItem('boxable-import-guest','yes');}};
 const forget=async()=>{if(!canLeave())return false;paused.current=true;generation.current++;await localWrites.current.catch(()=>{});await writeDraft(key,null);return true;};
 const discard=()=>{generation.current++;photoSaved.current=null;setConflict(false);setStatus('');setDraft({document:newDocument(),photo:null,id:userId?crypto.randomUUID():null,revision:0,photoPath:null,dirty:false});};
 const saveCopy=()=>{if(saving.current)return;generation.current++;photoSaved.current=null;setConflict(false);setDraft(old=>({...old,id:crypto.randomUUID(),revision:0,photoPath:null,dirty:true,photoChanged:!!old.photo,document:{...old.document,name:old.document.name.slice(0,73)+' (copy)'}}));};
 return {draft,ready,importing,importedSaved,status,conflict,save,change,fresh,open,beforeAuth,forget,saveCopy,discard,resume:()=>{paused.current=false;setRetry(v=>v+1);},retry:()=>setRetry(v=>v+1)};
}
