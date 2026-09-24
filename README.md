# sell-your-shit

A local tool for creating sale listings across **Craigslist**, **OfferUp**, and
**Facebook Marketplace** from a single place. Enter an item once, add photos, and
publish to whichever platforms you pick. Listing links come back into the app;
mark something sold and it's removed from the local store.

It's built for personal, single-machine use, so there's no auth, accounts, or
hosting to worry about.

## How publishing works (and the honest caveats)

None of these three platforms offer a public posting API for personal sellers,
so publishing is done by driving a real Chromium browser with
[Playwright](https://playwright.dev):

| Platform | Approach | Reliability |
|----------|----------|-------------|
| Craigslist | Logged-in "create a posting" web flow | Most reliable |
| OfferUp | Mobile web post flow; pauses for SMS codes | Medium |
| Facebook Marketplace | Persistent login profile + create-item flow | Most fragile (2FA, anti-automation) |

Selectors for each site are centralized at the top of their file in
`packages/publishers/src/` so breakage is a quick fix. On any failure a
screenshot + HTML dump is written to `data/debug/`. Automating these sites may
violate their Terms of Service — use at your own risk and keep volumes low.

## Quick start

```bash
pnpm install
pnpm run setup:browsers          # one-time Chromium download for Playwright

# Try the whole flow with simulated publishing (no credentials needed):
MOCK_PUBLISH=1 pnpm dev
# open http://localhost:5173
```

For real publishing, see **[SETUP.md](SETUP.md)** to fill in `config.json` and
`secrets.json`, then just `pnpm dev`.

### Production-style run (single port)

```bash
pnpm build      # builds the web UI
pnpm start      # serves UI + API from http://localhost:8123
```

## Project layout

```
apps/
  server/   Fastify API, SQLite, photo storage, publish job queue
  web/       Vite + React UI
packages/
  core/      Shared types, zod schemas, category mapping, listing templates
  publishers/ Playwright publishers (craigslist / offerup / facebook) + mock
data/        SQLite DB, photos, browser profiles, debug output (git-ignored)
```

## Commands

| Command | Does |
|---------|------|
| `pnpm dev` | Runs API (`:8123`) + web (`:5173`) with hot reload |
| `pnpm build` | Builds the web UI to `apps/web/dist` |
| `pnpm start` | Runs the server; serves the built UI if present |
| `pnpm typecheck` | Type-checks every package |
| `pnpm run setup:browsers` | Installs the Chromium build for Playwright |
| `MOCK_PUBLISH=1 ...` | Forces simulated publishing on any command |

## Data model

- **items** — title, description, price, condition, category, status
- **photos** — files on disk under `data/photos/<itemId>/`, ordered (first = cover)
- **listings** — one row per platform with the live URL, status, and last error

Marking an item **sold** deletes the item, its photos, and its listing rows from
the local store (per the project's spec).
