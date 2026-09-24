import {
  craigslistSecretsSchema,
  getCategory,
  formatPrice,
  type CraigslistSecrets,
} from '@sell/core';
import {
  attachBrowserGuard,
  launchPersistent,
  captureFailure,
  clickFirst,
  humanDelay,
  type BrowserGuard,
  type Page,
} from './browser';
import type { Publisher, PublishContext, PublishResult } from './types';

/**
 * Craigslist publisher.
 *
 * Craigslist has no posting API, so this drives the multi-step "create a
 * posting" web flow with Playwright. Of the three platforms this is the most
 * stable, but the markup still changes occasionally — every selector the flow
 * depends on is collected in SEL below so fixes are one-liners. On any failure
 * a screenshot + HTML dump is written to data/debug.
 *
 * Last reviewed against the flow: 2026-06. Verify before trusting in anger.
 */

const SEL = {
  loginUrl: 'https://accounts.craigslist.org/login',
  loginEmail: '#inputEmailHandle',
  loginPassword: '#inputPassword',
  loginSubmit: 'button#login',

  postUrl: (area: string) => `https://post.craigslist.org/c/${area}`,

  continueButtons: [
    'button[name="go"]',
    'button.bigbutton',
    'button:has-text("continue")',
    'button:has-text("done")',
    'input[type="submit"][value*="continue" i]',
  ],

  forSaleByOwner: [
    'label:has-text("for sale by owner")',
    'input[name="id"][value="fso"]',
  ],

  title: '#PostingTitle, input[name="PostingTitle"]',
  // Craigslist dropped id="price" — name-based selector is the stable one now.
  price: 'input[name="price"], #price',
  postal: '#postal_code, #postal, input[name="postal"]',
  body: '#PostingBody, textarea[name="PostingBody"]',

  classicUploaderLink: 'text=Use classic image uploader',
  fileInput: 'input[type="file"]',
  doneWithImages: ['button:has-text("done with images")'],

  publish: ['button:has-text("publish")', 'button[name="go"]'],

  postingLink: 'a[href*=".craigslist.org/"][href$=".html"]',
} as const;

async function ensureLoggedIn(
  page: Page,
  secrets: CraigslistSecrets,
  ctx: PublishContext,
  guard: BrowserGuard,
) {
  ctx.onProgress('Checking Craigslist session…');
  await page.goto(SEL.loginUrl, { waitUntil: 'domcontentloaded' });
  guard.assertOpen();
  const emailField = page.locator(SEL.loginEmail);
  if (!(await emailField.isVisible().catch(() => false))) {
    ctx.onProgress('Already logged in to Craigslist.');
    return;
  }
  ctx.onProgress('Logging in to Craigslist…');
  await emailField.fill(secrets.email);
  await page.locator(SEL.loginPassword).fill(secrets.password);
  await page.locator(SEL.loginSubmit).click();
  await page.waitForLoadState('domcontentloaded');
  await humanDelay();
  guard.assertOpen();
  if (await page.locator(SEL.loginEmail).isVisible().catch(() => false)) {
    throw new Error(
      'Craigslist login failed (still on login page — check credentials or solve any captcha in the visible browser).',
    );
  }
}

async function clickContinue(page: Page, guard: BrowserGuard): Promise<void> {
  guard.assertOpen();
  const clicked = await clickFirst(page, [...SEL.continueButtons], 20000);
  if (!clicked) throw new Error('Could not find a "continue" button on the current Craigslist step.');
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await humanDelay();
  guard.assertOpen();
}

/** Craigslist inserts a map / geoverify step that redirects away from the edit form. */
async function isGeoVerifyStep(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('geoverify') || url.includes('s=geoverify')) return true;
  return page
    .getByText(/pin.*location|confirm.*location|drag.*pin|map location/i)
    .first()
    .isVisible()
    .catch(() => false);
}

async function editFormVisible(page: Page): Promise<boolean> {
  return page.locator(SEL.title).isVisible().catch(() => false);
}

/**
 * Waits for the user to confirm the map pin, or clicks continue when the form
 * is ready. Debug logs showed the flow stalling on `s=geoverify` while trying
 * to fill #price — we must finish this step before touching the edit fields.
 */
async function completeGeoVerifyIfNeeded(
  page: Page,
  ctx: PublishContext,
  guard: BrowserGuard,
): Promise<void> {
  if (!(await isGeoVerifyStep(page))) return;

  ctx.onAwaitingUser?.(
    'Craigslist wants you to confirm the map location. Adjust the pin if needed, then click "continue" in the browser.',
  );

  const deadline = Date.now() + ctx.config.publish.timeoutMs;
  while (Date.now() < deadline) {
    guard.assertOpen();
    if (await editFormVisible(page)) return;
    if (!(await isGeoVerifyStep(page))) {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      if (await editFormVisible(page)) return;
      return;
    }
    await clickFirst(page, [...SEL.continueButtons], 1500).catch(() => undefined);
    await page.waitForTimeout(800);
  }

  throw new Error('Craigslist map location step was not completed before the timeout.');
}

async function waitForEditForm(page: Page, ctx: PublishContext, guard: BrowserGuard): Promise<void> {
  ctx.onProgress('Waiting for the listing form…');
  const deadline = Date.now() + ctx.config.publish.timeoutMs;
  while (Date.now() < deadline) {
    guard.assertOpen();
    await completeGeoVerifyIfNeeded(page, ctx, guard);
    if (await editFormVisible(page)) return;
    await page.waitForTimeout(500);
  }
  throw new Error('Craigslist listing form did not appear (stuck on map or an earlier step).');
}

async function fillField(
  page: Page,
  selector: string,
  value: string,
  ctx: PublishContext,
  guard: BrowserGuard,
): Promise<void> {
  guard.assertOpen();
  await completeGeoVerifyIfNeeded(page, ctx, guard);
  const loc = page.locator(selector);
  await loc.waitFor({ state: 'visible' });
  guard.assertOpen();
  await loc.fill(value);
}

export const craigslistPublisher: Publisher = {
  platform: 'craigslist',

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const secrets = craigslistSecretsSchema.parse(ctx.secrets);
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
          `craigslist-step-${String(stepNo).padStart(2, '0')}-${slug}`,
        );
        if (png) ctx.onArtifact?.(label, png);
      }
    };

    try {
      await ensureLoggedIn(page, secrets, ctx, guard);
      await step('logged in');

      ctx.onProgress(`Starting a new posting in "${secrets.area}"…`);
      await page.goto(SEL.postUrl(secrets.area), { waitUntil: 'domcontentloaded' });
      await humanDelay();
      guard.assertOpen();

      if (await clickFirst(page, [...SEL.forSaleByOwner], 8000)) {
        ctx.onProgress('Selected "for sale by owner".');
        await clickContinue(page, guard);
      }
      await step('post type selected');

      const categoryText = getCategory(ctx.item.category).craigslist;
      const fallback = secrets.defaultCategory;
      const categoryCandidates = [
        `label:has-text("${categoryText}")`,
        ...(fallback ? [`label:has-text("${fallback}")`] : []),
      ];
      if (await clickFirst(page, categoryCandidates, 8000)) {
        ctx.onProgress(`Selected category "${categoryText}".`);
        await clickContinue(page, guard);
      }

      if (await page.locator('input[name="subarea"]').first().isVisible().catch(() => false)) {
        if (secrets.subarea) {
          await page
            .locator(`input[name="subarea"][value="${secrets.subarea}"]`)
            .check()
            .catch(() => undefined);
        }
        await clickContinue(page, guard);
      }
      await step('category / area selected');

      await waitForEditForm(page, ctx, guard);
      await step('edit form visible');

      ctx.onProgress('Filling the listing details…');
      await fillField(page, SEL.title, ctx.item.title, ctx, guard);
      await fillField(page, SEL.price, String(Math.round(ctx.item.priceCents / 100)), ctx, guard);
      const postal = secrets.postalCode ?? ctx.config.location.zip;
      if (postal) {
        await fillField(page, SEL.postal, postal, ctx, guard).catch(() => undefined);
      }
      await fillField(page, SEL.body, ctx.item.description || ctx.item.title, ctx, guard);
      ctx.onProgress(`Price set to ${formatPrice(ctx.item.priceCents)}.`);
      await step('details filled');

      if (ctx.dryRun) {
        ctx.onProgress('Dry run complete — stopping before continue/publish. No listing was created.');
        return { url: page.url() };
      }

      await clickContinue(page, guard);

      // Map confirmation often appears after the edit form — handle it again.
      await completeGeoVerifyIfNeeded(page, ctx, guard);

      if (!(await page.locator(SEL.fileInput).first().isVisible().catch(() => false))) {
        await clickContinue(page, guard).catch(() => undefined);
        await completeGeoVerifyIfNeeded(page, ctx, guard);
      }

      if (ctx.photoPaths.length > 0) {
        ctx.onProgress(`Uploading ${ctx.photoPaths.length} photo(s)…`);
        await clickFirst(page, [SEL.classicUploaderLink], 4000).catch(() => undefined);
        const fileInput = page.locator(SEL.fileInput).first();
        await fileInput.waitFor({ state: 'attached' });
        guard.assertOpen();
        await fileInput.setInputFiles(ctx.photoPaths);
        await humanDelay(1500, 3000);
        await step('photos uploaded');
      }
      await clickFirst(page, [...SEL.doneWithImages, ...SEL.continueButtons], 20000);
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await humanDelay();
      guard.assertOpen();

      ctx.onProgress('Publishing…');
      await clickFirst(page, [...SEL.publish], 20000);
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await humanDelay(1500, 2500);
      guard.assertOpen();

      const link = page.locator(SEL.postingLink).first();
      let url = page.url();
      let externalId: string | undefined;
      if (await link.isVisible().catch(() => false)) {
        url = (await link.getAttribute('href')) ?? url;
      }
      const idMatch = url.match(/\/(\d+)\.html/);
      if (idMatch) externalId = idMatch[1];

      ctx.onProgress('Craigslist posting submitted.');
      return { url, externalId };
    } catch (err) {
      const shot = await captureFailure(page, ctx.debugDir, 'craigslist');
      const suffix = shot ? ` (screenshot: ${shot})` : '';
      throw new Error(`${(err as Error).message}${suffix}`);
    } finally {
      guard.dispose();
      await context.close().catch(() => undefined);
    }
  },
};

/** Posting entry URL for a Craigslist area. Exported for the dev harness. */
export function craigslistPostUrl(area: string): string {
  return SEL.postUrl(area);
}

export const CRAIGSLIST_LOGIN_URL = SEL.loginUrl;

export interface CraigslistDiagnostics {
  url: string;
  onLoginPage: boolean;
  geoVerify: boolean;
  editForm: boolean;
  fields: {
    title: boolean;
    price: boolean;
    postal: boolean;
    body: boolean;
    fileInput: boolean;
  };
}

/** Reports what the publisher would see on the current page (same selectors). */
export async function craigslistDiagnostics(page: Page): Promise<CraigslistDiagnostics> {
  const visible = async (selector: string) =>
    page.locator(selector).first().isVisible().catch(() => false);
  return {
    url: page.url(),
    onLoginPage: await visible(SEL.loginEmail),
    geoVerify: await isGeoVerifyStep(page),
    editForm: await editFormVisible(page),
    fields: {
      title: await visible(SEL.title),
      price: await visible(SEL.price),
      postal: await visible(SEL.postal),
      body: await visible(SEL.body),
      fileInput: (await page.locator(SEL.fileInput).count().catch(() => 0)) > 0,
    },
  };
}
