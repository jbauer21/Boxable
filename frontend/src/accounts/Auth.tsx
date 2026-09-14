import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { callbackURL, client, supabase } from './client';
import { startGoogle } from './google';
export function useAccount(){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(!!supabase),[recovery,setRecovery]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{if(!active)return;setUser(session?.user?.email_confirmed_at?session.user:null);setLoading(false);if(event==='PASSWORD_RECOVERY')setRecovery(true);});
  void supabase.auth.getSession().then(({data,error})=>{if(!active)return;if(error)setError('Your sign-in could not be restored. Please sign in again.');setUser(data.session?.user?.email_confirmed_at?data.session.user:null);setLoading(false);}).catch(()=>{if(active){setError('Your sign-in could not be restored. Please sign in again.');setLoading(false);}});
  const params=new URLSearchParams(location.search);if(params.has('error_description'))setError('That sign-in link has expired or was cancelled. Please try again.');
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 return {user,loading,recovery,setRecovery,error};
}
export function Auth({onClose,onBeforeAuth,recovery=false,onRecovered}:{onClose:()=>void;onBeforeAuth:()=>Promise<void>;recovery?:boolean;onRecovered:()=>void}){
 const [mode,setMode]=useState<'login'|'register'|'forgot'|'verify'|'reset'>(recovery?'reset':'login');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(recovery)setMode('reset');},[recovery]);
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();}catch{setMessage('Unable to complete this request. Check your details and connection, then try again. Confirmation and recovery emails may take a few minutes.');}finally{setPassword('');setBusy(false);}};
 const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
  await onBeforeAuth();const auth=client().auth;
  if(mode==='register'){
   const {error}=await auth.signUp({email:email.trim(),password,options:{data:{display_name:name.trim()},emailRedirectTo:callbackURL()}});if(error)throw error;setMode('verify');setMessage('Check your inbox for a confirmation link. If you already have an account, sign in or reset your password.');
  }else if(mode==='login'){
   const {error}=await auth.signInWithPassword({email:email.trim(),password});
   if(error){
    if(error.code==='email_not_confirmed'||/not confirmed/i.test(error.message)){setMode('verify');setMessage('Confirm your email before opening saved drawers. Your guest work stays in this browser until then.');return;}
    throw error;
   }
   onClose();
  }else if(mode==='forgot'){
   const {error}=await auth.resetPasswordForEmail(email.trim(),{redirectTo:callbackURL()});if(error)throw error;setMessage('If this address has an account, a password reset link will arrive shortly.');
  }else if(mode==='verify'){
   const {error}=await auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:callbackURL()}});if(error)throw error;setMessage('If confirmation is needed, a new link will arrive shortly.');
  }else{
   const {error}=await auth.updateUser({password});if(error)throw error;onRecovered();onClose();
  }
 });};
 const title=mode==='register'?'A home for your drawers.':mode==='forgot'?'Forgot your password?':mode==='verify'?'Check your inbox.':mode==='reset'?'Choose a new password.':'Welcome home.';
 return <section className="account-panel" aria-labelledby="auth-title"><p className="account-eyebrow">YOUR BOXABLE ACCOUNT</p><h1 id="auth-title">{title}</h1><p>Keep your drawers, photos, and plans together. Just for you.</p>
 {!supabase&&<p role="status" className="account-notice">Account storage is not connected yet. You can still try the planner and export your layout.</p>}
 <form onSubmit={submit}>
 {mode==='register'&&<label>Your name<input autoComplete="name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} pattern={".*\\S.*"}/></label>}
 {mode!=='reset'&&<label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {['login','register','reset'].includes(mode)&&<><label>Password<input type={show?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="password-help"/></label><label className="account-checkbox"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Show password</label><small id="password-help">{mode==='login'?'Use your Boxable password.':'At least 15 characters. A memorable passphrase works well.'}</small></>}
 <button className="btn" disabled={busy||!supabase}>{busy?'One moment…':mode==='register'?'Create account':mode==='forgot'?'Send reset link':mode==='verify'?'Resend confirmation':mode==='reset'?'Update password':'Sign in'}</button>
 </form><p role="status" aria-live="polite">{message}</p>
 {['login','register'].includes(mode)&&<><div className="account-divider">or</div><button className="account-google" disabled={busy||!supabase} onClick={()=>void run(async()=>{await onBeforeAuth();await startGoogle();})}>Continue with Google <span aria-hidden="true">↗</span></button></>}
 {mode!=='reset'&&<div className="account-links"><button onClick={()=>{setMode(mode==='register'?'login':'register');setMessage('');setPassword('');}}>{mode==='register'?'Already have an account? Sign in':'Create an account'}</button><button onClick={()=>{setMode('forgot');setMessage('');setPassword('');}}>Forgot password</button><button onClick={()=>{setMode('verify');setMessage('');}}>Verify email</button>{mode!=='login'&&<button onClick={()=>{setMode('login');setMessage('');}}>Back to sign in</button>}</div>}
 <button className="ghost-link" onClick={onClose}>Back to Boxable</button></section>;
}
