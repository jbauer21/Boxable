// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signInWithIdToken: vi.fn(), signInWithOAuth: vi.fn() }));
vi.mock('./client', () => ({ client: () => ({ auth: mocks }), callbackURL: () => location.origin + '/' }));
import { completeGoogle } from './google';
beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); history.replaceState(null, '', '/'); mocks.signInWithIdToken.mockResolvedValue({ error: null }); });
function flow(query: string, created = Date.now()) {
  sessionStorage.setItem('boxable-google-pkce', JSON.stringify({ state: 'expected', verifier: 'verifier', nonce: 'raw-nonce', created }));
  history.replaceState(null, '', '/auth/google/callback?' + query);
}
it('rejects cancellation, mismatched state, expired and missing flows without exchanging', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  for (const query of ['error=access_denied&state=expected', 'state=wrong&code=code']) {
    flow(query); await completeGoogle(); expect(location.search).toContain('google_signin_failed');
  }
  flow('state=expected&code=code', Date.now() - 700_000); await completeGoogle();
  history.replaceState(null, '', '/auth/google/callback?state=expected&code=code'); await completeGoogle();
  expect(fetcher).not.toHaveBeenCalled();
  expect(mocks.signInWithIdToken).not.toHaveBeenCalled();
});
it('exchanges once and delegates identity verification to Supabase with the original nonce', async () => {
  flow('state=expected&code=one-time-code');
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    expect(location.search).toBe('');
    return new Response(JSON.stringify({ id_token: 'google-jwt' }));
  });
  await completeGoogle(); await completeGoogle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(mocks.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-jwt', nonce: 'raw-nonce' });
  expect(location.hash).toBe('#/planner');
  expect(sessionStorage.getItem('boxable-google-pkce')).toBeNull();
});
it('preserves guest drafts on an exchange failure', async () => {
  localStorage.setItem('guest-test', 'untouched'); flow('state=expected&code=code');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }));
  await completeGoogle();
  expect(location.search).toContain('google_signin_failed');
  expect(localStorage.getItem('guest-test')).toBe('untouched');
});
