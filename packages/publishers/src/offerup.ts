import { offerupSecretsSchema } from '@sell/core';
import {
  attachBrowserGuard,
  launchPersistent,
  captureFailure,
  clickFirst,
  fillFirst,
  humanDelay,
  waitFor,
  type BrowserGuard,
  type Page,
} from './browser';
import type { Publisher, PublishContext, PublishResult } from './types';

/**
 * OfferUp publisher.
 *
 * OfferUp's help docs state personal sellers can only post via the mobile app —
 * not through offerup.com in a desktop/mobile browser. Debug logs confirmed
 * /post/ redirects to /login even with an active session. This publisher
 * verifies the session is alive, then throws a clear error telling you to post
 * in the app and paste the URL in the UI.
 */

const SEL = {
  homeUrl: 'https://offerup.com/',
  loginUrl: 'https://offerup.com/login/',
  header: '[data-testid="Header"]',
  emailInput: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'],
  passwordInput: ['input[type="password"]', 'input[name="password"]'],
  loginSubmit: ['button:has-text("Log in")', 'button:has-text("Sign in")', 'button[type="submit"]'],
  continueEmail: ['button:has-text("Continue")', 'button:has-text("Next")'],
  otpMarker: ['input[autocomplete="one-time-code"]', 'text=verification code', 'text=enter the code'],
} as const;

const APP_ONLY_MSG =
  'OfferUp personal accounts cannot create listings on the website (mobile app only). ' +
  'Post the item in the OfferUp app, then paste the listing URL in the Publish panel on this page.';

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await humanDelay(800, 1500);
}

async function hasLoginForm(page: Page): Promise<boolean> {
  for (const sel of SEL.emailInput) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return true;
  }
  for (const sel of SEL.passwordInput) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return true;
  }
  return false;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  if (!(await page.locator(SEL.header).isVisible().catch(() => false))) return false;
  return !(await hasLoginForm(page));
}

async function ensureLoggedIn(
  page: Page,
  secrets: ReturnType<typeof offerupSecretsSchema.parse>,
  ctx: PublishContext,
  guard: BrowserGuard,
): Promise<void> {
  ctx.onProgress('Checking OfferUp session…');
  await page.goto(SEL.homeUrl, { waitUntil: 'domcontentloaded' });
  await settle(page);
  guard.assertOpen();

  if (await isLoggedIn(page)) {
    ctx.onProgress('Already logged in to OfferUp.');
    return;
  }

  if (!(await hasLoginForm(page))) {
    ctx.onProgress('OfferUp session detected — waiting for the page to finish loading…');
    const ready = await waitFor(() => isLoggedIn(page), 15000, 500, guard);
    if (ready) {
      ctx.onProgress('Already logged in to OfferUp.');
      return;
    }
  }

  ctx.onProgress('Logging in to OfferUp…');
  if (!page.url().includes('/login')) {
    await page.goto(SEL.loginUrl, { waitUntil: 'domcontentloaded' });
    await settle(page);
  }
  guard.assertOpen();

  if (await isLoggedIn(page)) {
    ctx.onProgress('Already logged in to OfferUp.');
    return;
  }

  await fillFirst(page, [...SEL.emailInput], secrets.email, 15000);
  await clickFirst(page, [...SEL.continueEmail], 4000).catch(() => undefined);
  await humanDelay();
  guard.assertOpen();
  await fillFirst(page, [...SEL.passwordInput], secrets.password, 15000);
  await clickFirst(page, [...SEL.loginSubmit], 8000);
  await humanDelay(1500, 2500);
  guard.assertOpen();

  for (const marker of SEL.otpMarker) {
    if (await page.locator(marker).first().isVisible().catch(() => false)) {
      ctx.onAwaitingUser?.(
        'OfferUp wants a verification code. Enter it in the browser — the page will not refresh.',
      );
      break;
    }
  }

  const ok = await waitFor(() => isLoggedIn(page), ctx.config.publish.timeoutMs, 2000, guard);
  if (!ok) {
    throw new Error('OfferUp login did not complete (verification not finished or credentials rejected).');
  }
  ctx.onProgress('Logged in to OfferUp.');
}

export const offerupPublisher: Publisher = {
  platform: 'offerup',

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const secrets = offerupSecretsSchema.parse(ctx.secrets);
    const context = await launchPersistent({
      profileDir: ctx.profileDir,
      headless: ctx.config.publish.headless,
      slowMoMs: ctx.config.publish.slowMoMs,
      mobile: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const guard = attachBrowserGuard(context, page);
    page.setDefaultTimeout(ctx.config.publish.timeoutMs);

    try {
      await ensureLoggedIn(page, secrets, ctx, guard);
      ctx.onProgress(APP_ONLY_MSG);
      throw new Error(APP_ONLY_MSG);
    } catch (err) {
      if ((err as Error).message === APP_ONLY_MSG) throw err;
      const shot = await captureFailure(page, ctx.debugDir, 'offerup');
      const suffix = shot ? ` (screenshot: ${shot})` : '';
      throw new Error(`${(err as Error).message}${suffix}`);
    } finally {
      guard.dispose();
      await context.close().catch(() => undefined);
    }
  },
};
