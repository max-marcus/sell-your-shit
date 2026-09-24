import type { Platform } from '@sell/core';
import type { Publisher } from './types';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A fake publisher used when a platform has no credentials configured, or when
 * MOCK_PUBLISH=1. It lets you exercise the whole publish/jobs/UI flow end to
 * end without touching a real marketplace.
 */
export function createMockPublisher(platform: Platform): Publisher {
  return {
    platform,
    async publish(ctx) {
      ctx.onProgress(`[mock] Preparing "${ctx.item.title}" for ${platform}`);
      await wait(500);
      ctx.onProgress(`[mock] Attaching ${ctx.photoPaths.length} photo(s)`);
      await wait(700);
      const externalId = Math.random().toString(36).slice(2, 10);
      const url = `https://example.com/${platform}/listing/${externalId}`;
      ctx.onProgress(`[mock] Published at ${url}`);
      return { url, externalId };
    },
  };
}
