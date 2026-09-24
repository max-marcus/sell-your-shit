import type { AppConfig, Item, Platform } from '@sell/core';

export interface PublishContext {
  item: Item;
  /** Absolute paths to the item's photos, already in display order. */
  photoPaths: string[];
  config: AppConfig;
  /** Platform-specific secrets object; each publisher validates what it needs. */
  secrets: Record<string, unknown>;
  /** Persistent browser-profile directory for this platform. */
  profileDir: string;
  /** Directory where screenshots / HTML dumps are written on failure. */
  debugDir: string;
  /** Stream a human-readable progress line back to the UI. */
  onProgress: (message: string) => void;
  /**
   * Signal that the flow is blocked waiting on the user (e.g. completing 2FA
   * in the visible browser window). The job is marked `awaiting_user`.
   */
  onAwaitingUser?: (message: string) => void;
  /**
   * Run everything up to (but NOT including) the final irreversible submit.
   * Used by the dev harness to exercise selectors without creating a listing.
   */
  dryRun?: boolean;
  /** Write a screenshot + HTML snapshot at each labeled milestone (harness/debugging). */
  captureSteps?: boolean;
  /** Called after a captured step with the screenshot path. */
  onArtifact?: (label: string, pngPath: string) => void;
}

export interface PublishResult {
  url: string;
  externalId?: string;
}

export interface Publisher {
  platform: Platform;
  publish(ctx: PublishContext): Promise<PublishResult>;
}
