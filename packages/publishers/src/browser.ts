import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

/** Thrown when the user closes the automation browser before the flow finishes. */
export class BrowserClosedError extends Error {
  constructor() {
    super('Browser was closed before publishing finished.');
    this.name = 'BrowserClosedError';
  }
}

export interface BrowserGuard {
  assertOpen(): void;
  dispose(): void;
}

/** Fails fast when the Playwright context or page is closed (e.g. user quit the window). */
export function attachBrowserGuard(context: BrowserContext, page: Page): BrowserGuard {
  let closed = false;
  const markClosed = () => {
    closed = true;
  };
  context.on('close', markClosed);
  page.on('close', markClosed);
  return {
    assertOpen() {
      if (closed || page.isClosed()) throw new BrowserClosedError();
    },
    dispose() {
      context.off('close', markClosed);
      page.off('close', markClosed);
    },
  };
}

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

export interface LaunchOptions {
  profileDir: string;
  headless: boolean;
  slowMoMs: number;
  /** Use a phone-sized viewport + mobile UA (helps with OfferUp's mobile-first flow). */
  mobile?: boolean;
}

/**
 * Launches a persistent Chromium context. The profile directory keeps cookies
 * and login state between runs so the user only has to complete 2FA once.
 */
export async function launchPersistent(opts: LaunchOptions): Promise<BrowserContext> {
  mkdirSync(opts.profileDir, { recursive: true });
  return chromium.launchPersistentContext(opts.profileDir, {
    headless: opts.headless,
    slowMo: opts.slowMoMs,
    viewport: opts.mobile ? { width: 414, height: 896 } : { width: 1366, height: 900 },
    userAgent: opts.mobile ? MOBILE_UA : DESKTOP_UA,
    deviceScaleFactor: opts.mobile ? 3 : 1,
    isMobile: Boolean(opts.mobile),
    hasTouch: Boolean(opts.mobile),
    locale: 'en-US',
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
}

/** Writes a screenshot + HTML snapshot for debugging. Returns the PNG path. */
export async function captureFailure(
  page: Page,
  debugDir: string,
  name: string,
): Promise<string | undefined> {
  try {
    mkdirSync(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(debugDir, `${name}-${stamp}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => undefined);
    try {
      writeFileSync(`${base}.html`, await page.content());
    } catch {
      // ignore
    }
    return `${base}.png`;
  } catch {
    return undefined;
  }
}

/** Random pause to look a little less robotic between actions. */
export function humanDelay(min = 350, max = 1100): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clicks the first locator from a list of candidates that becomes visible. */
export async function clickFirst(
  page: Page,
  selectors: string[],
  timeoutMs = 15000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => undefined);
        return true;
      }
    }
    await page.waitForTimeout(250);
  }
  return false;
}

/** Fills the first matching, visible locator. Returns whether it succeeded. */
export async function fillFirst(
  page: Page,
  selectors: string[],
  value: string,
  timeoutMs = 15000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill(value).catch(() => undefined);
        return true;
      }
    }
    await page.waitForTimeout(250);
  }
  return false;
}

/** Polls until the predicate is true or the timeout elapses. */
export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs: number,
  pollMs = 1000,
  guard?: BrowserGuard,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    guard?.assertOpen();
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

export type { BrowserContext, Locator, Page };
