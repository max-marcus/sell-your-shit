import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * All filesystem locations the server uses, resolved once. Everything lives
 * under the repo root by default but can be overridden with env vars so the
 * tool can run from anywhere.
 */

const here = dirname(fileURLToPath(import.meta.url)); // apps/server/src
export const repoRoot = resolve(here, '../../..');

export const dataDir = process.env.SYS_DATA_DIR
  ? resolve(process.env.SYS_DATA_DIR)
  : resolve(repoRoot, 'data');

export const photosDir = resolve(dataDir, 'photos');
export const profilesDir = resolve(dataDir, 'browser-profiles');
export const debugDir = resolve(dataDir, 'debug');
export const dbPath = resolve(dataDir, 'app.db');

export const configPath = process.env.SYS_CONFIG
  ? resolve(process.env.SYS_CONFIG)
  : resolve(repoRoot, 'config.json');

export const secretsPath = process.env.SYS_SECRETS
  ? resolve(process.env.SYS_SECRETS)
  : resolve(repoRoot, 'secrets.json');

export const webDist = resolve(repoRoot, 'apps/web/dist');
