# sell-your-shit

> **Status: work in progress.** This is an early personal project (`v0.1.0`). APIs, UI, and especially marketplace publishers will change. Expect rough edges, breakage when sites update their DOM, and incomplete polish. Use at your own risk.

A local tool for creating sale listings across **Craigslist**, **OfferUp**, and
**Facebook Marketplace** from a single place. Enter an item once, add photos, and
publish to whichever platforms you pick. Listing links come back into the app;
mark something sold and it's removed from the local store.

Built for personal, single-machine use — no auth, accounts, or hosted deploy.

## What works today

- **Inventory UI** — list items, create/edit, manage photo order (first = cover)
- **Retail link scrape** — paste a product URL to pull title, price, and description hints
- **Local config** — `config.json` (location, pickup line, publish timing) and `secrets.json` (marketplace logins); both are git-ignored — copy from the `*.example` files
- **Publish job queue** — pick platforms per item; jobs run via Playwright against a real Chromium window
- **Mock mode** — `MOCK_PUBLISH=1` simulates publishing with no credentials
- **Settings page** — shows location defaults and which platforms have credentials configured

## How publishing works (and the honest caveats)

None of these three platforms offer a public posting API for personal sellers,
so publishing drives a real Chromium browser with
[Playwright](https://playwright.dev):

| Platform | Approach | Reliability |
|----------|----------|-------------|
| Craigslist | Logged-in "create a posting" web flow | Most reliable |
| OfferUp | Mobile web post flow; pauses for SMS / app follow-up | Medium |
| Facebook Marketplace | Persistent login profile + create-item flow | Most fragile (2FA, anti-automation) |

Selectors live at the top of each file in `packages/publishers/src/` so breakage
is a quick fix. On failure, a screenshot + HTML dump lands in `data/debug/`.
Automating these sites may violate their Terms of Service — keep volumes low.

## Quick start

```bash
pnpm install
pnpm run setup:browsers          # one-time Chromium download for Playwright

cp config.json.example config.json
cp secrets.json.example secrets.json   # optional until you publish for real

# Simulated publishing (no credentials needed):
MOCK_PUBLISH=1 pnpm dev
# open http://localhost:5173
```

For real publishing, fill in `config.json` and `secrets.json` per
**[SETUP.md](SETUP.md)**, then run `pnpm dev` (drop `MOCK_PUBLISH`).

### Single-port run

```bash
pnpm build      # builds the web UI into apps/web/dist
pnpm start      # API + UI at http://localhost:8123 (binds to 127.0.0.1)
```

## Project layout

```
apps/
  server/      Fastify API, SQLite, photo storage, publish job queue, retail scrape
  web/         Vite + React UI (inventory, item editor, settings, publish panel)
packages/
  core/        Shared types, zod schemas, category mapping, description template
  publishers/  Playwright publishers (craigslist / offerup / facebook) + mock
data/          SQLite DB, photos, browser profiles, debug output (git-ignored)
config.json    Local location / listing defaults (git-ignored; see *.example)
secrets.json   Marketplace credentials (git-ignored; see *.example)
```

## Commands

| Command | Does |
|---------|------|
| `pnpm dev` | API (`:8123`) + web (`:5173`) with hot reload |
| `pnpm build` | Builds the web UI to `apps/web/dist` |
| `pnpm start` | Runs the server; serves the built UI if present |
| `pnpm typecheck` | Type-checks every package |
| `pnpm run setup:browsers` | Installs Chromium for Playwright |
| `pnpm harness:craigslist` | Manual Craigslist publisher dry-run / debug |
| `pnpm harness:facebook` | Manual Facebook publisher dry-run / debug |
| `MOCK_PUBLISH=1 …` | Forces simulated publishing on any command |

## Data model

- **items** — title, description, price, condition, category, status
- **photos** — files under `data/photos/<itemId>/`, ordered (first = cover)
- **listings** — one row per platform with live URL, status, and last error

Marking an item **sold** deletes the item, its photos, and its listing rows from
the local store.
