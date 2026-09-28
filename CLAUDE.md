# CLAUDE.md

Guidance for AI agents and contributors who work in this repository.

## Project goal

`sell-your-shit` will be an **open-source app that makes it easy to sell things on online marketplaces**. A seller enters an item once, adds photos, and publishes to many marketplaces from one place. The app tracks each listing and removes the item when it sells.

### Current state (v0.1.0, work in progress)

- Local, single-machine tool. No auth, no accounts, no hosted deploy.
- Three marketplaces: Craigslist, OfferUp, and Facebook Marketplace.
- Publishing drives a real Chromium browser through Playwright, because these marketplaces have no public posting API for personal sellers.
- No automated tests, no linter, no CI, and no `LICENSE` file yet.

### Direction

Every change must move the project toward an app that a stranger can clone, set up, and use to sell items. In priority order:

1. **Reliable core flow.** Create item, add photos, publish, track listings, mark sold.
2. **Open-source readiness.** License, contributor docs, tests, CI, and issue and PR templates. No secrets, API keys, personal details, etc in version control!
3. **Easy setup.** Fewer manual steps, clear errors, and safe defaults such as mock mode.
4. **More marketplaces.** Add new marketplaces only through the `Publisher` interface.

Do not add hosted, multi-user, or paid features unless an issue explicitly scopes them.

## Architecture

pnpm workspace monorepo, TypeScript (strict, ESM), Node.

```
apps/
  server/      Fastify API, SQLite (better-sqlite3), photo storage (sharp),
               publish job queue (p-queue), retail link scrape, dev harnesses
  web/         Vite + React 19 + React Router UI
packages/
  core/        Shared types, zod schemas, category mapping, listing templates
  publishers/  One Playwright publisher per marketplace, plus a mock publisher
data/          SQLite DB, photos, browser profiles, debug output (git-ignored)
```

Key rules:

- `packages/core` holds the shared contract. Put types and zod schemas here, not in an app.
- Each marketplace is one file in `packages/publishers/src/` that implements `Publisher` from `types.ts`. Register it in `REAL_PUBLISHERS` in `index.ts`.
- Keep DOM selectors at the top of each publisher file. Sites change their DOM often, and this makes fixes fast.
- On failure, publishers write a screenshot and an HTML dump to `data/debug/`. Keep this behavior for new publishers.
- The server binds to `127.0.0.1`. Do not expose it on other interfaces.

## Commands

| Command | Does |
|---------|------|
| `pnpm install` | Installs all workspace packages |
| `pnpm run setup:browsers` | Installs Chromium for Playwright (one time) |
| `MOCK_PUBLISH=1 pnpm dev` | API (`:8123`) and web (`:5173`) with simulated publishing |
| `pnpm dev` | Same, with real publishing for platforms that have credentials |
| `pnpm build` | Builds the web UI to `apps/web/dist` |
| `pnpm start` | Runs the server and serves the built UI at `:8123` |
| `pnpm typecheck` | Type-checks every package. **Run before every PR.** |
| `pnpm harness:craigslist` | Manual Craigslist publisher debug run |
| `pnpm harness:facebook` | Manual Facebook publisher debug run |

## Safety rules

- **Never commit secrets or local data.** `config.json`, `secrets.json`, `.env`, and `data/` are git-ignored. Change the `*.example` files or `.env.sample` when you add a new config, secret, or environment variable.
- **Never read, print, or log the contents of `secrets.json` or `.env`.**
- **Never create a real marketplace listing during development.** Use `MOCK_PUBLISH=1`, or use `dryRun: true` in the harnesses. `dryRun` stops before the final submit.
- Automating these sites can violate their Terms of Service. Keep request volume low and keep `slowMoMs` delays. Do not add features that post in bulk or evade anti-bot checks.
- Only add dependencies with licenses that permit open-source distribution (for example MIT, Apache-2.0, BSD, ISC).

## AI design
When writing code to make calls to LLMs, use your Cerebras skill (`.cursor/skills/cerebras/SKILL.md`). It uses the official `openai` Node.js SDK, pointed at OpenRouter, to call the `openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs (zod schemas) so that you can interpret the results and populate fields as needed.

- Make LLM calls only from `apps/server`. Never send `OPENROUTER_API_KEY` to the web UI.
- The server reads `OPENROUTER_API_KEY` from the root `.env` file. See `.env.sample`.

## Agile workflow with GitHub Issues

All work goes through GitHub Issues in `max-marcus/sell-your-shit`. Use the `gh` CLI.

### Rules

1. **No issue, no work.** Every branch and PR links to one issue. If the work has no issue, create the issue first.
2. **Small increments.** One issue must fit in one PR that a reviewer can read in one sitting. Split larger work into sub-issues under a parent epic issue.
3. **One PR per issue.** The PR body contains `Closes #<number>`.
4. **Keep `main` releasable.** Merge only when `pnpm typecheck` passes and mock mode still works end to end.

### Work item types

| Type | Use for | Title form |
|------|---------|------------|
| Epic | A large goal that spans many issues | `Epic: <outcome>` |
| Story | A user-facing change | Imperative verb phrase, for example `Add eBay publisher` |
| Bug | Wrong behavior | `Fix <symptom>` |
| Chore | Tooling, docs, refactors with no user-facing change | Imperative verb phrase |

### Labels

Existing type labels: `enhancement` (story), `bug`, `documentation`, `question`, `good first issue`, `help wanted`.

Add these labels when they first become necessary:

- `epic` for parent issues.
- `chore` for tooling and refactor work.
- Area labels: `area:web`, `area:server`, `area:core`, `area:publishers`.
- Marketplace labels: `platform:craigslist`, `platform:offerup`, `platform:facebook`, and one per new marketplace.
- Priority labels: `P1` (do now), `P2` (next), `P3` (later).

### Issue body template

Use these sections. Issue #3 is a good example.

```markdown
## Summary
One or two sentences: what changes and for whom.

## Motivation
Why this matters to a seller or contributor.

## Proposed approach
Specific steps or options. Name files and packages where known.

## Acceptance criteria
- [ ] Testable result 1
- [ ] Testable result 2

## Out of scope
Items that this issue does not include.
```

### Definition of Ready

An issue is ready to start when it has:

- A clear summary and testable acceptance criteria.
- A type label and, when known, an area label.
- No open blocking questions.

### Definition of Done

An issue is done when:

- All acceptance criteria are met.
- `pnpm typecheck` passes.
- The change works with `MOCK_PUBLISH=1`.
- Docs (`README.md`, `SETUP.md`, `*.example` files) match the new behavior.
- The PR is squash-merged into `main` and the issue is closed.

### Sprints

- Use GitHub **milestones** as sprints. Name them `Sprint <N>` and set a due date (default length: two weeks).
- At sprint planning, assign ready issues to the milestone in priority order.
- At sprint end, move unfinished issues to the next milestone and close the old one.
- Use a GitHub Project board with the columns **Backlog**, **Ready**, **In progress**, **In review**, and **Done** when the issue count makes a board useful.

### Branches, commits, and PRs

- Branch from `main`. Name the branch `<type>/<short-kebab-description>`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Example: `feat/listing-templates`.
- Commit messages use Conventional Commits: `feat: add resale listing templates`.
- PR title: the same as the issue title.
- PR body sections: **Summary**, `Closes #N`, **Design notes**, and **Test plan** as a checklist. PR #4 is a good example.
- Squash-merge PRs. Delete the branch after merge.

## Code conventions

- TypeScript strict mode. Do not use `any` when a zod schema or a type from `@sell/core` can describe the data.
- Validate all API input with zod schemas from `packages/core`.
- Use JSDoc on exported functions, types, and interface fields. Keep other comments rare and use them only for constraints the code cannot show.
- Match the style of nearby code: 2-space indent, single quotes, named exports.
- Keep publishers independent. One publisher must not import from another.

### Design principles (SOLID)

Apply SOLID principles when they make the code easier to change. Do not add layers or abstractions that no current use case needs.

- **Single responsibility.** Each module, class, component, and hook has one reason to change. Keep routes thin: they validate input, call a service, and return the result. Put page-independent UI logic in hooks, and keep page-specific wiring in the page.
- **Open/closed.** Add new behavior by adding new code, not by editing working shared code. Example: add a marketplace by adding a new `Publisher` and registering it. Do not add `if (platform === ...)` branches to shared code.
- **Liskov substitution.** Every implementation of an interface must work anywhere the interface is used. Example: the mock publisher and each real publisher must follow the same `Publisher` contract, including error behavior.
- **Interface segregation.** Keep interfaces small and specific to what callers need. Prefer several focused interfaces or props to one large one.
- **Dependency inversion.** Business logic depends on interfaces, not on concrete SDKs or services. Example: code that calls an LLM depends on an `LlmClient` interface, not on the `openai` SDK directly. Pass dependencies in, so tests can use fakes.

Build shared features, such as UI panels, services, and clients, so other pages or packages can reuse them without changes. A reusable component takes data and callbacks through props and does not import page code.

## Open-source readiness backlog

These gaps block a public release. Create an issue for each one before you start work on it:

- Add a `LICENSE` file (the owner chooses the license).
- Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.
- Add issue and PR templates in `.github/` that match the templates above.
- Add a test runner (for example Vitest) with tests for `packages/core` and the server routes.
- Add ESLint and Prettier with shared config.
- Add GitHub Actions CI that runs install, `typecheck`, lint, and tests on every PR.
- Remove `"private": true` from the root `package.json` only when publishing to a registry is in scope.
