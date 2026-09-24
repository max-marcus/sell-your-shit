/**
 * Craigslist publisher dev harness.
 *
 * Exercise the Craigslist flow in isolation (same publisher code + persistent
 * browser profile as the real app). Step screenshots land in data/debug/.
 *
 * Usage (from repo root):
 *   pnpm harness:craigslist                 # dry run vs first DB item (no publish)
 *   pnpm harness:craigslist -- --item <id>  # dry run vs a specific item
 *   pnpm harness:craigslist -- probe        # open post flow + print diagnostics
 *   pnpm harness:craigslist -- publish --item <id>   # REAL publish (opt-in)
 *   pnpm harness:craigslist -- --headless
 *   pnpm harness:craigslist -- --keep 120   # (probe) seconds to leave browser open
 */
import { join } from 'node:path';
import type { Item } from '@sell/core';
import {
  craigslistPublisher,
  craigslistDiagnostics,
  craigslistPostUrl,
  CRAIGSLIST_LOGIN_URL,
  launchPersistent,
  type PublishContext,
} from '@sell/publishers';
import { loadConfig, loadSecrets, configuredPlatforms } from '../config';
import { profilesDir, debugDir } from '../paths';
import { photoFilePath } from '../storage';
import { listItems, getItem } from '../repo';

type Mode = 'dry' | 'probe' | 'publish';

interface Args {
  mode: Mode;
  itemId?: string;
  headless: boolean;
  keepSeconds: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'dry', headless: false, keepSeconds: 90 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === 'probe' || a === 'dry' || a === 'publish') args.mode = a;
    else if (a === '--item') args.itemId = argv[++i];
    else if (a === '--headless') args.headless = true;
    else if (a === '--keep') args.keepSeconds = Number(argv[++i]) || args.keepSeconds;
  }
  return args;
}

const FIXTURE_ITEM: Item = {
  id: 'harness-fixture',
  title: 'Harness Test — please ignore',
  description: 'Craigslist harness dry run. Not a real listing.',
  priceCents: 4200,
  condition: 'good',
  category: 'general',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  photos: [],
  listings: [],
};

function resolveItem(itemId?: string): Item {
  if (itemId) {
    const item = getItem(itemId);
    if (!item) throw new Error(`No item with id ${itemId} in the local DB.`);
    return item;
  }
  const first = listItems()[0];
  if (first) return first;
  console.log('No items in the DB — using a built-in fixture item (no photos).');
  return FIXTURE_ITEM;
}

function banner(title: string): void {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

async function runProbe(args: Args): Promise<void> {
  const config = loadConfig();
  const secrets = loadSecrets();
  const area = secrets.craigslist?.area ?? 'losangeles';
  const postUrl = craigslistPostUrl(area);

  const context = await launchPersistent({
    profileDir: join(profilesDir, 'craigslist'),
    headless: args.headless,
    slowMoMs: config.publish.slowMoMs,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    banner(`Probe → ${postUrl}`);
    console.log(`Login URL: ${CRAIGSLIST_LOGIN_URL}`);
    console.log(`Area: ${area}`);

    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    let diag = await craigslistDiagnostics(page);
    console.log(JSON.stringify(diag, null, 2));

    if (diag.onLoginPage) {
      console.log('\nOn login page — credentials from secrets.json will be used on a dry/publish run.');
      console.log('Or log in manually while the browser is open; the profile is saved.');
    }

    if (!args.headless && args.keepSeconds > 0) {
      console.log(`\nLeaving the browser open for ${args.keepSeconds}s so you can inspect / advance steps…`);
      console.log('Tip: walk to the posting-details form, then wait — diagnostics re-run at the end.');
      await page.waitForTimeout(args.keepSeconds * 1000);
      diag = await craigslistDiagnostics(page);
      console.log('\nDiagnostics after wait:');
      console.log(JSON.stringify(diag, null, 2));
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runFlow(args: Args): Promise<void> {
  const config = loadConfig();
  const secrets = loadSecrets();
  const configured = configuredPlatforms(secrets);
  if (!configured.craigslist) {
    throw new Error(
      'Craigslist credentials are missing in secrets.json — need email, password, and area.',
    );
  }

  const item = resolveItem(args.itemId);
  const photoPaths = item.photos.map((p) => photoFilePath(item.id, p.filename));
  const dryRun = args.mode !== 'publish';

  banner(
    `${dryRun ? 'DRY RUN (stops after filling the form)' : 'REAL PUBLISH'} → item "${item.title}" ` +
      `(${item.photos.length} photo(s), headless=${args.headless})`,
  );

  const ctx: PublishContext = {
    item,
    photoPaths,
    config: { ...config, publish: { ...config.publish, headless: args.headless } },
    secrets: (secrets.craigslist ?? {}) as Record<string, unknown>,
    profileDir: join(profilesDir, 'craigslist'),
    debugDir,
    dryRun,
    captureSteps: true,
    onProgress: (m) => console.log(`  · ${m}`),
    onAwaitingUser: (m) => console.log(`  ⏸  ${m}`),
    onArtifact: (label, png) => console.log(`  📸 [${label}] ${png}`),
  };

  try {
    const result = await craigslistPublisher.publish(ctx);
    banner('Result');
    console.log(JSON.stringify(result, null, 2));
    if (dryRun) {
      console.log('\nDry run finished. Review step screenshots in data/debug/ (craigslist-step-*).');
      console.log('If price/title/body look filled in the last shot, selectors are good — try publish.');
    }
  } catch (err) {
    banner('FAILED');
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'probe') await runProbe(args);
  else await runFlow(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
