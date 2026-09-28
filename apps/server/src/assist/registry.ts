import { loadConfig } from '../config';
import { createListingProfile } from './profiles/listing';
import type { AnyAssistProfile } from './types';

/**
 * All AI assist profiles, keyed by name.
 *
 * How to add an AI chat to a page:
 * 1. Add the context and suggestions zod schemas to `packages/core`.
 * 2. Add a profile in `profiles/<name>.ts` that implements `AssistProfile`.
 * 3. Add the profile to the list below.
 * 4. Render `<AssistChat profile="<name>" getContext={...} onSuggestions={...} />`
 *    on the page.
 *
 * You do not need to change the route, the service, the LLM client, the
 * `AssistChat` component, or the `useAssistChat` hook.
 */
const PROFILES: AnyAssistProfile[] = [
  createListingProfile({ getPickupLine: () => loadConfig().listing.pickupLine }),
];

const PROFILE_BY_NAME = new Map(PROFILES.map((p) => [p.name, p]));

/** Returns the profile with this name, or undefined. */
export function getAssistProfile(name: string): AnyAssistProfile | undefined {
  return PROFILE_BY_NAME.get(name);
}
