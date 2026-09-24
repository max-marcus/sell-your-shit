import type { Platform } from '@sell/core';
import type { Publisher } from './types';
import { craigslistPublisher } from './craigslist';
import { offerupPublisher } from './offerup';
import { facebookPublisher } from './facebook';
import { createMockPublisher } from './mock';

export type { Publisher, PublishContext, PublishResult } from './types';
export { createMockPublisher };

// Low-level helpers + diagnostics exposed for the dev harness (scripts/*).
export { launchPersistent } from './browser';
export {
  facebookPublisher,
  facebookDiagnostics,
  FACEBOOK_CREATE_URL,
  type FacebookDiagnostics,
} from './facebook';
export {
  craigslistPublisher,
  craigslistDiagnostics,
  craigslistPostUrl,
  CRAIGSLIST_LOGIN_URL,
  type CraigslistDiagnostics,
} from './craigslist';

const REAL_PUBLISHERS: Record<Platform, Publisher> = {
  craigslist: craigslistPublisher,
  offerup: offerupPublisher,
  facebook: facebookPublisher,
};

/**
 * Returns the publisher to use for a platform. When `mock` is true (no
 * credentials configured, or MOCK_PUBLISH=1) a simulated publisher is returned
 * so the full flow can be exercised without hitting a real marketplace.
 */
export function getPublisher(platform: Platform, opts: { mock: boolean }): Publisher {
  return opts.mock ? createMockPublisher(platform) : REAL_PUBLISHERS[platform];
}
