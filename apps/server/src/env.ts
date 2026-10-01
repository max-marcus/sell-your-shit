import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Loads `<repoRoot>/.env` into `process.env` when the file exists. Variables
 * already set in the shell take precedence over values in the file.
 *
 * Import this module first in every server entry point, before any module that
 * reads `process.env` at load time. It must not import `./paths`, because
 * `paths` reads `SYS_*` variables at load time.
 */
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
