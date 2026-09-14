import { callbackURL, client } from './client';

const key = 'boxable-google-pkce';
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

export async function startGoogle() {
  if (import.meta.env.VITE_GOOGLE_AUTH_BACKEND !== 'true') {
    const { error } = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackURL(), scopes: 'openid email profile' } });
    if (error) throw error;
    return;
  }
  const state = random(), verifier = random(), nonce = random();
  const response = await fetch('/api/auth/google/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, challenge: base64url(await hash(verifier)), nonce: Array.from(await hash(nonce), b => b.toString(16).padStart(2, '0')).join('') }),
  });
  if (!response.ok) throw new Error('Google sign-in is not available yet');
  const { url } = await response.json();
  if (new URL(url).origin !== 'https://accounts.google.com') throw new Error('Invalid sign-in URL');
  sessionStorage.setItem(key, JSON.stringify({ state, verifier, nonce, created: Date.now() }));
  location.assign(url);
}

export async function completeGoogle() {
  if (location.pathname !== '/auth/google/callback') return;
  const params = new URLSearchParams(location.search);
  // Remove authorization codes before rendering the application or third-party assets.
  history.replaceState(null, '', '/');
  const stored = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  try {
    const flow = stored ? JSON.parse(stored) : null;
    if (params.has('error') || !flow || flow.state !== params.get('state') || !params.get('code') || Date.now() - flow.created > 600_000) throw new Error('Expired sign-in');
    const response = await fetch('/api/auth/google/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: params.get('code'), verifier: flow.verifier }),
    });
    if (!response.ok) throw new Error('Sign-in failed');
    const { id_token } = await response.json();
    const { error } = await client().auth.signInWithIdToken({ provider: 'google', token: id_token, nonce: flow.nonce });
    if (error) throw error;
    history.replaceState(null, '', '/#/planner');
  } catch {
    history.replaceState(null, '', '/?error_description=google_signin_failed#/account');
  }
}
