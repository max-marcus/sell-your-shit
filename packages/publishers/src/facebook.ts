import {
  facebookSecretsSchema,
  getCategory,
  CONDITION_LABELS,
  formatPrice,
  type FacebookSecrets,
} from '@sell/core';
import {
  attachBrowserGuard,
  launchPersistent,
  captureFailure,
  humanDelay,
  waitFor,
  type BrowserGuard,
  type Page,
} from './browser';
import type { Publisher, PublishContext, PublishResult } from './types';

/**
 * Facebook Marketplace publisher.
 *
 * This is the most fragile of the three: there is no personal-profile posting
 * API, Facebook actively fingerprints automation, and 2FA / security
 * checkpoints are common. Mitigations:
 *   - A persistent browser profile (data/browser-profiles/facebook) so you log
 *     in + clear checkpoints once and the session is reused.
 *   - Running with a visible browser (config.publish.headless = false) is
 *     strongly recommended, especially for the first run.
 *   - When a checkpoint appears the flow waits for you to resolve it manually.
 *
 * Field locators use Facebook's accessible labels where possible. Last
 * reviewed: 2026-06 — verify before relying on it.
 */

const CREATE_URL = 'https://www.facebook.com/marketplace/create/item';
const SELLING_URL = 'https://www.facebook.com/marketplace/you/selling';

const SEL = {
  loginEmail: '#email',
  loginPassword: '#pass',
  loginButton: 'button[name="login"], #loginbutton',
  fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
  itemLink: 'a[href*="/marketplace/item/"]',
} as const;

async function onCreateForm(page: Page): Promise<boolean> {
  const url = page.url();
  if (!url.includes('/marketplace/create')) return false;

  const fileInput = page.locator(SEL.fileInput).first();
  if ((await fileInput.count().catch(() => 0)) > 0) return true;

  return page
    .getByLabel('Title', { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
}

async function isHumanCheckpoint(page: Page): Promise<boolean> {
  const markers = [
    'Confirm you are human',
    'Confirm you\'re human',
    'Waiting for approval',
    'Check your notifications',
    'Approve from another device',
  ];
  for (const text of markers) {
    if (await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) {
      return true;
    }
  }
  const url = page.url();
  return url.includes('two_step') || url.includes('checkpoint') || url.includes('approvals');
}

/** True when past login screens but not necessarily on the create form yet. */
async function appearsLoggedIn(page: Page): Promise<boolean> {
  if (await onCreateForm(page)) return true;
  if (await isHumanCheckpoint(page)) return false;

  const url = page.url();
  if (!url.includes('facebook.com')) return false;
  if (await page.locator(SEL.loginEmail).isVisible().catch(() => false)) return false;

  const checkpointSelectors = [
    'input[autocomplete="one-time-code"]',
    'text=Enter login code',
    'text=Try another way',
  ];
  for (const sel of checkpointSelectors) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return false;
  }

  return page.locator('[role="navigation"]').first().isVisible().catch(() => false);
}

async function openCreateForm(page: Page, ctx: PublishContext, guard: BrowserGuard): Promise<void> {
  if (await onCreateForm(page)) return;
  if (await isHumanCheckpoint(page)) {
    throw new Error(
      'Facebook human verification was not completed. Confirm you are human / approve on your device, then retry.',
    );
  }
  ctx.onProgress('Opening Marketplace create form…');
  await page.goto(CREATE_URL, { waitUntil: 'domcontentloaded' });
  await humanDelay(1500, 2500);
  guard.assertOpen();
  if (await isHumanCheckpoint(page)) {
    throw new Error(
      'Facebook is showing a human verification screen. Complete it in the browser, then retry publish.',
    );
  }
  if (!(await onCreateForm(page))) {
    const createEntry = page
      .getByRole('link', { name: /Create new listing/i })
      .or(page.locator('[aria-label="Create new listing"]'))
      .first();
    if (await createEntry.isVisible().catch(() => false)) {
      ctx.onProgress('Opening "Create new listing"…');
      await createEntry.click().catch(() => undefined);
      await humanDelay(1500, 2500);
      guard.assertOpen();
    }
  }

  const reached = await waitFor(
    async () => {
      guard.assertOpen();
      if (await onCreateForm(page)) return true;
      if (page.url().includes('/marketplace/create/item')) {
        const fileInput = page.locator(SEL.fileInput).first();
        return (await fileInput.count().catch(() => 0)) > 0;
      }
      return false;
    },
    45_000,
    1500,
    guard,
  );
  if (!reached) {
    throw new Error(
      'Could not reach the Marketplace create form after login. Open facebook.com/marketplace/create/item manually, then retry.',
    );
  }
}

async function ensureLoggedIn(
  page: Page,
  secrets: FacebookSecrets,
  ctx: PublishContext,
  guard: BrowserGuard,
) {
  ctx.onProgress('Opening Facebook Marketplace…');
  await page.goto(CREATE_URL, { waitUntil: 'domcontentloaded' });
  await humanDelay();
  guard.assertOpen();

  if (await onCreateForm(page)) {
    ctx.onProgress('Already logged in to Facebook.');
    return;
  }

  const emailField = page.locator(SEL.loginEmail);
  if (await emailField.isVisible().catch(() => false)) {
    ctx.onProgress('Logging in to Facebook…');
    await emailField.fill(secrets.email);
    await page.locator(SEL.loginPassword).fill(secrets.password);
    await page.locator(SEL.loginButton).first().click().catch(() => undefined);
    await humanDelay(2000, 3500);
    guard.assertOpen();
  }

  if (!(await onCreateForm(page))) {
    ctx.onAwaitingUser?.(
      'Finish login / 2FA / human verification in the browser. The page will not refresh — take your time.',
    );
    const ok = await waitFor(
      async () => {
        guard.assertOpen();
        if (await isHumanCheckpoint(page)) {
          ctx.onAwaitingUser?.(
            'Facebook: tap "Confirm you are human" or approve the login on your phone, then wait…',
          );
          return false;
        }
        if (await onCreateForm(page)) return true;
        return appearsLoggedIn(page);
      },
      ctx.config.publish.timeoutMs,
      2000,
      guard,
    );
    if (!ok) {
      throw new Error('Facebook login/checkpoint was not completed before the timeout.');
    }
    await openCreateForm(page, ctx, guard);
  }
  ctx.onProgress('Logged in to Facebook.');
}

/** Fills a Marketplace field located by any of the given accessible labels. */
async function fillByLabel(page: Page, labels: string[], value: string): Promise<boolean> {
  for (const label of labels) {
    const loc = page.getByLabel(label, { exact: false }).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click().catch(() => undefined);
      await loc.fill(value).catch(() => undefined);
      return true;
    }
  }
  return false;
}

/** Opens a combobox by label and clicks the option whose text matches. */
async function selectByLabel(page: Page, label: string, optionText: string): Promise<boolean> {
  const combo = page.getByLabel(label, { exact: false }).first();
  if (!(await combo.isVisible().catch(() => false))) return false;
  await combo.click().catch(() => undefined);
  await humanDelay(300, 700);
  const option = page.getByRole('option', { name: optionText, exact: false }).first();
  if (await option.isVisible().catch(() => false)) {
    await option.click().catch(() => undefined);
    return true;
  }
  // Close the dropdown if we couldn't find the option.
  await page.keyboard.press('Escape').catch(() => undefined);
  return false;
}

export const facebookPublisher: Publisher = {
  platform: 'facebook',

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const secrets = facebookSecretsSchema.parse(ctx.secrets);
    const context = await launchPersistent({
      profileDir: ctx.profileDir,
      headless: ctx.config.publish.headless,
      slowMoMs: ctx.config.publish.slowMoMs,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const guard = attachBrowserGuard(context, page);
    page.setDefaultTimeout(ctx.config.publish.timeoutMs);

    let stepNo = 0;
    const step = async (label: string): Promise<void> => {
      stepNo += 1;
      ctx.onProgress(label);
      if (ctx.captureSteps) {
        const slug = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
        const png = await captureFailure(
          page,
          ctx.debugDir,
          `facebook-step-${String(stepNo).padStart(2, '0')}-${slug}`,
        );
        if (png) ctx.onArtifact?.(label, png);
      }
    };

    try {
      await ensureLoggedIn(page, secrets, ctx, guard);
      await step('logged-in / create form reached');

      if (ctx.photoPaths.length > 0) {
        ctx.onProgress(`Uploading ${ctx.photoPaths.length} photo(s)…`);
        const fileInput = page.locator(SEL.fileInput).first();
        await fileInput.waitFor({ state: 'attached' });
        await fileInput.setInputFiles(ctx.photoPaths);
        await humanDelay(1500, 3000);
        await step('photos uploaded');
      }

      ctx.onProgress('Filling the listing details…');
      const filledTitle = await fillByLabel(page, ['Title'], ctx.item.title);
      const filledPrice = await fillByLabel(
        page,
        ['Price'],
        String(Math.round(ctx.item.priceCents / 100)),
      );

      const setCategory = await selectByLabel(page, 'Category', getCategory(ctx.item.category).facebook);
      const setCondition = await selectByLabel(page, 'Condition', CONDITION_LABELS[ctx.item.condition]);

      const filledDesc = await fillByLabel(page, ['Description'], ctx.item.description || ctx.item.title);
      ctx.onProgress(`Price set to ${formatPrice(ctx.item.priceCents)}.`);
      ctx.onProgress(
        `Fields — title:${filledTitle} price:${filledPrice} category:${setCategory} condition:${setCondition} description:${filledDesc}`,
      );
      await step('details filled');

      if (ctx.dryRun) {
        ctx.onProgress('Dry run complete — stopping before Publish. No listing was created.');
        return { url: page.url() };
      }

      // Marketplace create is a two-pane flow: "Next" then "Publish".
      const next = page.getByRole('button', { name: 'Next', exact: false }).first();
      if (await next.isVisible().catch(() => false)) {
        await next.click().catch(() => undefined);
        await humanDelay(1000, 2000);
      }

      ctx.onProgress('Publishing…');
      const publish = page.getByRole('button', { name: 'Publish', exact: false }).first();
      await publish.click();
      await humanDelay(3000, 5000);

      // Facebook doesn't surface the listing URL on publish, so read it off the
      // "Your listings" page (newest first).
      ctx.onProgress('Locating the published listing URL…');
      await page.goto(SELLING_URL, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await humanDelay(1500, 2500);
      let url = SELLING_URL;
      let externalId: string | undefined;
      const link = page.locator(SEL.itemLink).first();
      if (await link.isVisible().catch(() => false)) {
        const href = await link.getAttribute('href');
        if (href) {
          url = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
          externalId = url.match(/\/marketplace\/item\/(\d+)/)?.[1];
        }
      }

      ctx.onProgress('Facebook Marketplace listing submitted.');
      return { url, externalId };
    } catch (err) {
      const shot = await captureFailure(page, ctx.debugDir, 'facebook');
      const suffix = shot ? ` (screenshot: ${shot})` : '';
      throw new Error(`${(err as Error).message}${suffix}`);
    } finally {
      guard.dispose();
      await context.close().catch(() => undefined);
    }
  },
};

/** URL of the Marketplace item-create form. Exported for the dev harness. */
export const FACEBOOK_CREATE_URL = CREATE_URL;

export interface FacebookDiagnostics {
  url: string;
  loggedIn: boolean;
  humanCheckpoint: boolean;
  onCreateForm: boolean;
  /** Whether each expected field is currently detectable on the page. */
  fields: {
    title: boolean;
    price: boolean;
    description: boolean;
    category: boolean;
    condition: boolean;
    photoInput: boolean;
  };
}

/**
 * Reports what the Facebook publisher would "see" on the current page, using
 * the same detection helpers the real flow relies on. Call after navigating to
 * the create form so selector drift shows up immediately.
 */
export async function facebookDiagnostics(page: Page): Promise<FacebookDiagnostics> {
  const visible = (loc: ReturnType<Page['getByLabel']>) =>
    loc.first().isVisible().catch(() => false);
  return {
    url: page.url(),
    loggedIn: await appearsLoggedIn(page),
    humanCheckpoint: await isHumanCheckpoint(page),
    onCreateForm: await onCreateForm(page),
    fields: {
      title: await visible(page.getByLabel('Title', { exact: false })),
      price: await visible(page.getByLabel('Price', { exact: false })),
      description: await visible(page.getByLabel('Description', { exact: false })),
      category: await visible(page.getByLabel('Category', { exact: false })),
      condition: await visible(page.getByLabel('Condition', { exact: false })),
      photoInput: (await page.locator(SEL.fileInput).count().catch(() => 0)) > 0,
    },
  };
}
