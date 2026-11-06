import { describe, expect, it, vi } from 'vitest';
import worker from '../../worker/bridge';
const request = (path = '/', cookie = '') => new Request('https://mabear-storybook.ilya-baimetov.workers.dev' + path, {headers:{cookie}});
describe('private visual edition bridge', () => {
  it('does not serve confidential assets without a session', async () => {
    const assets = vi.fn();
    const res = await worker.fetch(request('/assets/character.glb'), {ASSETS:{fetch:assets},STORY_SERVICE:{fetch:async()=>new Response(null,{status:302,headers:{location:'/login'}})}});
    expect(res.status).toBe(302); expect(assets).not.toHaveBeenCalled(); expect(res.headers.get('location')).toBe('/login');
  });
  it('fails closed if the auth service is unavailable', async () => {
    const assets=vi.fn(); const res=await worker.fetch(request(),{ASSETS:{fetch:assets},STORY_SERVICE:{fetch:async()=>{throw new Error('unavailable');}}});
    expect(res.status).toBe(503);expect(assets).not.toHaveBeenCalled();
  });
  it('forwards the session only to the existing service and then serves its own assets', async () => {
    const probe=vi.fn(async(req:Request)=>{expect(req.method).toBe('HEAD');expect(req.headers.get('cookie')).toBe('mb_session=test');expect(new URL(req.url).pathname).toBe('/');return new Response(null,{status:200});});
    const assets=vi.fn(async()=>new Response('storybook edition'));
    const res=await worker.fetch(request('/assets/app.js','mb_session=test'),{ASSETS:{fetch:assets},STORY_SERVICE:{fetch:probe}});
    expect(await res.text()).toBe('storybook edition');expect(assets).toHaveBeenCalledOnce();expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('preserves the protected director response and login cookie',async()=>{
    const res=await worker.fetch(request('/api/direct'),{ASSETS:{fetch:vi.fn()},STORY_SERVICE:{fetch:async()=>new Response('unauthorized',{status:401})}});expect(res.status).toBe(401);
    const login=await worker.fetch(request('/login'),{ASSETS:{fetch:vi.fn()},STORY_SERVICE:{fetch:async()=>new Response(null,{status:303,headers:{'set-cookie':'mb_session=test; HttpOnly; Secure; SameSite=Lax','location':'/'}})}});
    expect(login.status).toBe(303);expect(login.headers.get('set-cookie')).toContain('HttpOnly');expect(login.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

it('supports a real login/session/logout cycle through the shared auth implementation', async () => {
  const { default: original } = await import('../../worker/index');
  const originalEnv = { DEMO_PASSWORD: 'bridge-test-only', SESSION_SECRET: 'test-only-key', ASSETS: { fetch: async () => new Response('original app') } };
  const assets = vi.fn(async () => new Response('new visual edition'));
  const env = { ASSETS: { fetch: assets }, STORY_SERVICE: { fetch: (req: Request) => original.fetch(req, originalEnv) } };
  const login = await worker.fetch(new Request('https://mabear-storybook.ilya-baimetov.workers.dev/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'bridge-test-only' }),
  }), env);
  expect(login.status).toBe(200);
  const header = login.headers.get('set-cookie')!;
  expect(header).toContain('HttpOnly'); expect(header).toContain('Secure'); expect(header).not.toContain('Domain=');
  const cookie = header.split(';')[0];
  const app = await worker.fetch(request('/', cookie), env);
  expect(await app.text()).toBe('new visual edition');
  expect(assets).toHaveBeenCalledOnce();
  const denied = await worker.fetch(request('/assets/nature/Pine_1.gltf', 'mb_session=invalid'), env);
  expect(denied.status).toBe(302); expect(assets).toHaveBeenCalledOnce();
  const logout = await worker.fetch(request('/logout', cookie), env);
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
});
