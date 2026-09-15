import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import { Landing } from './pages/Landing';
import { PrintMarkers } from './pages/PrintMarkers';
import { Step1Measure } from './steps/Step1Measure';
import { Place } from './place/Place';
import type { Layout } from './place/model';
import { fitGrid } from './lib/gridLayout';
import type { DrawerState, ItemGroup } from './lib/state';
import { Auth, useAccount } from './accounts/Auth';
import { client } from './accounts/client';
import { Library } from './accounts/Library';
import { useWorkspace } from './accounts/useWorkspace';
import './accounts/accounts.css';
type Page='home'|'wizard'|'markers'|'drawers'|'auth';
function readPage():Page {return ({'/planner':'wizard','/markers':'markers','/drawers':'drawers','/account':'auth'} as Record<string,Page>)[location.hash.slice(1)]??'home';}
export default function App(){
 const account=useAccount();
 if(account.loading)return <main className="account-panel" role="status">Opening Boxable…</main>;
 return <Workspace key={account.user?.id??'guest'} user={account.user} recovery={account.recovery} onRecovered={()=>account.setRecovery(false)} authError={account.error}/>;
}
function Workspace({user,recovery,onRecovered,authError}:{user:User|null;recovery:boolean;onRecovered:()=>void;authError:string}){
 const [page,setPage]=useState<Page>(readPage),[notice,setNotice]=useState(''),[photoURL,setPhotoURL]=useState('');
 const workspace=useWorkspace(user?.id??null);
 const {draft,change}=workspace;const doc=draft.document;
 useEffect(()=>{const sync=()=>setPage(readPage());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 const navigate=useCallback((next:Page)=>{location.hash={home:'/',wizard:'/planner',markers:'/markers',drawers:'/drawers',auth:'/account'}[next];setPage(next);window.scrollTo(0,0);},[]);
 useEffect(()=>{if(recovery)navigate('auth');else if(user&&(page==='auth'||location.search.includes('code=')))navigate('drawers');},[user,recovery,navigate,page]);
 useEffect(()=>{if(!draft.photo){setPhotoURL('');return;}const url=URL.createObjectURL(draft.photo);setPhotoURL(url);return()=>URL.revokeObjectURL(url);},[draft.photo]);
 const drawer=useMemo<DrawerState>(()=>({...doc.drawer,photoFile:draft.photo,photoUrl:photoURL||null}),[doc.drawer,draft.photo,photoURL]);
 const setDrawer=useCallback((action:SetStateAction<DrawerState>)=>{
  const next=typeof action==='function'?action(drawer):action;
  const {photoFile,photoUrl,...measurements}=next;
  if(photoUrl&&photoUrl!==drawer.photoUrl)URL.revokeObjectURL(photoUrl);
  change(old=>({...old,drawer:measurements,usableHeightMm:next.depthMm!==old.drawer.depthMm?Math.max(20,Math.min(500,next.depthMm)):old.usableHeightMm}),photoFile);
 },[drawer,change]);
 const setGroups=useCallback((groups:ItemGroup[])=>change(old=>({...old,groups})),[change]);
 const setLayout=useCallback((action:SetStateAction<Layout>)=>change(old=>({...old,layout:typeof action==='function'?action(old.layout):action})),[change]);
 const setHeight=useCallback((usableHeightMm:number)=>change(old=>({...old,usableHeightMm})),[change]);
 const grid=useMemo(()=>fitGrid(drawer.widthMm,drawer.heightMm),[drawer.widthMm,drawer.heightMm]);
 const start=()=>{if(workspace.fresh())navigate('wizard');else setNotice('Wait for saving to finish before opening another drawer.');};
 const saveDrawer=async()=>{if(!user){await workspace.beforeAuth();navigate('auth');return;}if(await workspace.save())navigate('drawers');};
 const signOut=async()=>{try{if(!await workspace.forget()){setNotice('Wait for saving to finish before signing out.');return;}const {error}=await client().auth.signOut();if(error)throw error;navigate('home');}catch{workspace.resume();setNotice('Sign-out failed. Please try again.');}};
 if(!workspace.ready)return <main className="account-panel" role="status">Restoring your workspace…</main>;
 return <><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>
 <header className="topbar place-header-compact no-print"><a className="brand" href="#/">boxable<span aria-hidden="true">✳</span></a><nav className="account-nav" aria-label="Main navigation"><button className="ghost-link" onClick={()=>navigate('markers')}>Print markers</button><button className="ghost-link" onClick={()=>navigate(user?'drawers':'auth')}>My drawers</button>{user?<button className="ghost-link" onClick={()=>void signOut()}>Sign out</button>:<button className="ghost-link" onClick={()=>navigate('auth')}>Sign in</button>}<button className="btn" onClick={()=>navigate('wizard')}>{page==='wizard'?'Your drawer':'Start my drawer'} ↗</button></nav></header>
 <main id="main" tabIndex={-1}>{(notice||authError)&&<p role="alert" className="account-notice">{notice||authError}</p>}
 {page==='home'&&<Landing onStart={()=>navigate('wizard')}/>}
 {page==='markers'&&<PrintMarkers onBack={()=>navigate('wizard')}/>}
 {(page==='auth'||page==='drawers'&&!user)&&<Auth recovery={recovery} onRecovered={onRecovered} onBeforeAuth={workspace.beforeAuth} onClose={()=>navigate('wizard')}/>}
 {page==='drawers'&&user&&<Library user={user} currentId={draft.id} currentDirty={!!draft.dirty} currentRevision={draft.revision} onNew={start} onDeleted={id=>{if(id===draft.id)workspace.discard();}} onOpen={async row=>{if(await workspace.open(row))navigate('wizard');else setNotice('Could not switch drawers. Finish saving or retry opening the drawer.');}}/>}
 {page==='wizard'&&<div className="place-app-shell">
 <div className="place-workspace-title"><div><h1>Your drawer, your way.</h1><p>Everything in your house has a home. Add, arrange, make it yours.</p></div><nav className="place-workspace-nav" aria-label="Drawer planning steps"><button aria-current={doc.step===1?'step':undefined} onClick={()=>change(old=>({...old,step:1}))}>01 · Measure</button><span aria-hidden="true">/</span><button disabled={!grid.cols||!grid.rows} aria-current={doc.step===2?'step':undefined} onClick={()=>change(old=>({...old,step:2}))}>02 · Place</button></nav></div>
 {doc.step===1&&<div className="place-measure-wrap"><Step1Measure key={draft.id??'new'} drawer={drawer} onChange={setDrawer} onContinue={()=>change(old=>({...old,step:2}))}/></div>}
 <div hidden={doc.step!==2}><Place onSave={saveDrawer} drawerName={doc.name} onRename={name=>change(old=>({...old,name}))} key={draft.id??'new'} drawer={drawer} groups={doc.groups} onChange={setGroups} onMeasure={()=>change(old=>({...old,step:1}))} layout={doc.layout} setLayout={setLayout} usableHeightMm={doc.usableHeightMm} setUsableHeightMm={setHeight}/></div><div className="drawer-save-status"><span role="status" aria-live="polite">{user?workspace.status||'Ready':workspace.status||'Guest drawer · Sign in to save across devices'}</span>{!user&&<button className="btn" onClick={()=>navigate('auth')}>Save to my account</button>}{user&&draft.dirty&&<button className="place-button" onClick={workspace.retry}>Retry save</button>}{workspace.conflict&&<><button className="place-button" onClick={workspace.saveCopy}>Save as new drawer</button><button className="place-button" onClick={()=>{if(draft.id)void workspace.open({id:draft.id});}}>Reload saved drawer</button></>}</div></div>}
 </main><footer className="site-footer no-print"><a href="#/" className="brand">boxable<span aria-hidden="true">✳</span></a><p>Everything in your house has a home.</p><span>Made for your everyday.</span></footer></>;
}
