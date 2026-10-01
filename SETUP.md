# Setup

Everything you need to provide to get `sell-your-shit` publishing for real.

## 1. Install

```bash
pnpm install
pnpm run setup:browsers   # downloads the Chromium build Playwright drives
```

## 2. Location — `config.json`

Copy the example and edit it:

```bash
cp config.json.example config.json
```

| Field | What to put |
|-------|-------------|
| `location.city` / `state` / `zip` | Where you sell from. Used for OfferUp / Facebook pickup location and as the Craigslist postal code fallback. |
| `location.latitude` / `longitude` | Optional. Helps pin the map location; leave out if unknown. |
| `listing.pickupLine` | Line inserted into every generated listing description (default: Local pickup only). |
| `listing.askingPriceFraction` | When fetching a retail link, suggest asking price as this fraction of retail (e.g. `0.5`). |
| `publish.headless` | `false` (recommended) shows the browser so you can solve 2FA / captchas. `true` runs invisibly once sessions are established. |
| `publish.slowMoMs` | Delay between automated actions (ms). Higher = more human-like. |
| `publish.timeoutMs` | How long a single step may take, including time spent waiting for you to finish a login challenge. |
| `maxPhotos` | Upload cap enforced in the UI. |

## 3. Credentials — `secrets.json`

```bash
cp secrets.json.example secrets.json
```

`secrets.json` is git-ignored. Only fill in the platforms you want; any platform
left out (or missing email/password) automatically uses the **mock publisher**.

### Craigslist
- `email`, `password` — your Craigslist account login.
- `area` — your region slug from the URL, e.g. `sfbay`, `newyork`, `seattle`, `losangeles`.
- `subarea` — optional sub-region code (e.g. `sfc` for SF proper) if your region has them.
- `postalCode` — ZIP used on the posting.
- `defaultCategory` — fallback category text if an item's mapped category can't be found.

### OfferUp
- `email`, `password`. **Personal accounts can only post via the mobile app**, not the website.
  After posting in the app, paste the listing URL in the Publish panel on the item page.
  The automated publisher verifies your login, then stops with instructions.

### Facebook
- `email`, `password`. Marketplace has no posting API and aggressively challenges
  automation, so the **first** publish will almost certainly need you to complete
  login + 2FA in the visible window. After that the session is saved under
  `data/browser-profiles/facebook` and reused.

### Environment variables — `.env`

```bash
cp .env.sample .env
```

`.env` is git-ignored. The server loads it from the repo root at startup.
Variables set in your shell override values in the file.

| Variable | What to put |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your [OpenRouter API key](https://openrouter.ai/keys). Required only for the AI assist chat in the item editor. |
| `PORT` / `HOST` | Optional. Server port and bind address (defaults: `8123`, `127.0.0.1`). |
| `MOCK_PUBLISH` | Optional. Set to `1` to simulate publishing. |
| `SYS_DATA_DIR` / `SYS_CONFIG` / `SYS_SECRETS` | Optional. Absolute paths that override the default `data/`, `config.json`, and `secrets.json` locations. |

### AI assist

To use the AI assist chat in the item editor:

1. Set `OPENROUTER_API_KEY` in `.env`.
2. Restart the server. The server reads the key only at startup.
3. Open **Settings**. The **AI assist** panel shows **configured**.

The chat sends your messages and the current form values to OpenRouter. The
model runs on Cerebras. The chat never changes a field or saves the item until
you click **Apply** or **Apply all**, and then **Save**. Suggested descriptions
use the listing templates and your `listing.pickupLine` from `config.json`.

Without a key, the chat panel shows "AI assist is not configured", and the rest
of the app works as before.

## 4. Things worth telling me / deciding

These affect how reliable each publisher is — answer them in `secrets.json` /
`config.json` or note them so the selectors can be tuned:

1. **Craigslist region slug + ZIP** (required for Craigslist).
2. **Which accounts have 2FA / SMS codes** (Facebook, OfferUp almost always do).
3. **Visible vs headless** — keep visible until each platform has logged in once.
4. **Your most-used categories** — the mapping in `packages/core/src/index.ts`
   (`CATEGORIES`) covers common ones; tell me if you need others.
5. **Local pickup vs shipping** — current flows assume local pickup.

## 5. Try it without real accounts first

```bash
MOCK_PUBLISH=1 pnpm dev
```

Everything works end to end (create item, photos, publish, listing links, mark
sold) but publishing is simulated. Drop `MOCK_PUBLISH` once your credentials are
in and you've run a visible publish to clear logins.

## Where things live

- SQLite DB: `data/app.db`
- Photos: `data/photos/<itemId>/`
- Browser login sessions: `data/browser-profiles/<platform>/`
- Failure screenshots + HTML dumps: `data/debug/`

All of `data/` is git-ignored and safe to delete to reset.
