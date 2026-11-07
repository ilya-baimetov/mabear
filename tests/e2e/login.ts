import {expect, test, type BrowserContext, type Page} from '@playwright/test';
import {E2E_PASSWORD} from '../../playwright.config';

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;
const sessions = new Map<string, Cookies>();

/** Share one test-only login per worker; each test still gets an isolated page.
 * Repeated fresh contexts must not become 20 login attempts from one IP.
 * Authentication rejection itself is tested before this helper is called.
 */
export async function login(page: Page): Promise<void> {
  const origin = new URL(String(test.info().project.use.baseURL)).origin;
  const cached = sessions.get(origin);
  if (cached) {
    await page.context().addCookies(cached);
    return;
  }
  const response = await page.request.post('/login', {form: {password: E2E_PASSWORD}, maxRedirects: 0});
  expect([200, 302, 303], 'test login status').toContain(response.status());
  const cookies = await page.context().cookies(origin);
  expect(cookies.length, 'authenticated test session').toBeGreaterThan(0);
  sessions.set(origin, cookies);
}
