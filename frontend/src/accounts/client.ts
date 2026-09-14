import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: typeof location === 'undefined' || location.pathname !== '/auth/google/callback', persistSession: true, autoRefreshToken: true },
}) : null;
export function client() {
  if (!supabase) throw new Error('Account storage is not connected yet. Add the Supabase environment settings and restart Boxable.');
  return supabase;
}
export const callbackURL = () => `${location.origin}/`;
export const PHOTO_LIMIT = 10 * 1024 * 1024;
export function validatePhoto(file: Blob) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (file.size > PHOTO_LIMIT) throw new Error('Choose a photo smaller than 10 MB.');
}
