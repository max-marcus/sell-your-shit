import { existsSync, readFileSync } from 'node:fs';
import {
  appConfigSchema,
  secretsSchema,
  PLATFORMS,
  type AppConfig,
  type Platform,
  type Secrets,
} from '@sell/core';
import { configPath, secretsPath } from './paths';

export function loadConfig(): AppConfig {
  if (!existsSync(configPath)) {
    return appConfigSchema.parse({});
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return appConfigSchema.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read config at ${configPath}: ${(err as Error).message}`);
  }
}

export function loadSecrets(): Secrets {
  if (!existsSync(secretsPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(secretsPath, 'utf8'));
    return secretsSchema.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read secrets at ${secretsPath}: ${(err as Error).message}`);
  }
}

/** Whether the global mock switch is on (publishing is always simulated). */
export function isMockMode(): boolean {
  return process.env.MOCK_PUBLISH === '1';
}

/** Map of platform -> whether usable credentials exist in secrets.json. */
export function configuredPlatforms(secrets: Secrets): Record<Platform, boolean> {
  const out = {} as Record<Platform, boolean>;
  for (const p of PLATFORMS) {
    const entry = secrets[p];
    out[p] = Boolean(entry && entry.email && entry.password);
  }
  return out;
}
