/**
 * Facebook publisher dev harness.
 *
 * Lets you exercise the Facebook Marketplace flow in isolation — without going
 * through the API/job queue — so you can iterate on selectors and see exactly
 * where the flow stands.
 *
 * It reuses the SAME publisher code the real app runs, plus the real persistent
 * browser profile (so login/2FA is done once), and writes a screenshot + HTML
 * snapshot at each milestone into data/debug/.
 *
 * Usage (from repo root):
 *   pnpm harness:facebook                 # dry run against the first DB item (no publish)
 *   pnpm harness:facebook -- --item <id>  # dry run against a specific item
 *   pnpm harness:facebook -- probe        # just open the create form + print diagnostics
 *   pnpm harness:facebook -- publish --item <id>   # REAL publish (explicit opt-in)
 *   pnpm harness:facebook -- --headless   # run headless (default: headed)
 *   pnpm harness:facebook -- --keep 120   # (probe) seconds to leave the browser open
 */
import { join } from 'node:path';
import type { Item } from '@sell/core';
import {
  facebookPublisher,
  facebookDiagnostics,
  launchPersistent,
  FACEBOOK_CREATE_URL,
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
  description: 'Facebook harness dry run. Not a real listing.',
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
  const context = await launchPersistent({
    profileDir: join(profilesDir, 'facebook'),
    headless: args.headless,
    slowMoMs: config.publish.slowMoMs,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    banner(`Probe → ${FACEBOOK_CREATE_URL}`);
    await page.goto(FACEBOOK_CREATE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const diag = await facebookDiagnostics(page);
    console.log(JSON.stringify(diag, null, 2));
    if (!args.headless && args.keepSeconds > 0) {
      console.log(`\nLeaving the browser open for ${args.keepSeconds}s so you can inspect it…`);
      console.log('(Complete any login / human-verification now — the profile is saved for next run.)');
      await page.waitForTimeout(args.keepSeconds * 1000);
      console.log('Re-running diagnostics after the wait:');
      console.log(JSON.stringify(await facebookDiagnostics(page), null, 2));
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runFlow(args: Args): Promise<void> {
  const config = loadConfig();
  const secrets = loadSecrets();
  const configured = configuredPlatforms(secrets);
  if (!configured.facebook) {
    throw new Error('Facebook credentials are missing in secrets.json — add email/password first.');
  }

  const item = resolveItem(args.itemId);
  const photoPaths = item.photos.map((p) => photoFilePath(item.id, p.filename));
  const dryRun = args.mode !== 'publish';

  banner(
    `${dryRun ? 'DRY RUN (no publish)' : 'REAL PUBLISH'} → item "${item.title}" ` +
      `(${item.photos.length} photo(s), headless=${args.headless})`,
  );

  const ctx: PublishContext = {
    item,
    photoPaths,
    config: { ...config, publish: { ...config.publish, headless: args.headless } },
    secrets: (secrets.facebook ?? {}) as Record<string, unknown>,
    profileDir: join(profilesDir, 'facebook'),
    debugDir,
    dryRun,
    captureSteps: true,
    onProgress: (m) => console.log(`  · ${m}`),
    onAwaitingUser: (m) => console.log(`  ⏸  ${m}`),
    onArtifact: (label, png) => console.log(`  📸 [${label}] ${png}`),
  };

  try {
    const result = await facebookPublisher.publish(ctx);
    banner('Result');
    console.log(JSON.stringify(result, null, 2));
    if (dryRun) {
      console.log('\nDry run finished. Review the step screenshots in data/debug/ (facebook-step-*).');
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
