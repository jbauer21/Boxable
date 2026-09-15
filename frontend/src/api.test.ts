import { afterEach, expect, it, vi } from 'vitest';
import { download3mf } from './api';

afterEach(() => vi.restoreAllMocks());

it.each([502, 503, 504])('explains generation server failures (%s) without exposing proxy HTML', async (status) => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status }));
  await expect(download3mf([])).rejects.toThrow(`The generation server became unavailable or timed out (${status})`);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('preserves validation errors', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Invalid dimensions', { status: 422 }));
  await expect(download3mf([])).rejects.toThrow('Invalid dimensions');
});

it('returns the generated archive', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('archive', { headers: { 'Content-Type': 'model/3mf' } }));
  const result = await download3mf([]);
  expect(result.type).toBe('model/3mf');
  expect(await result.text()).toBe('archive');
});
