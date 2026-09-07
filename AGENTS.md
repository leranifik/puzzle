<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PuzzleHub — AI Agent Instructions

PuzzleHub is a production puzzle-game mini-app (fifteen, sudoku, 2048, memory, numsolis)
with cloud saves, cross-device sync, Telegram Mini Apps integration and a
self-hosted analytics dashboard. Real users depend on it — do not break
saves, auth, or the public API contract.

## Tech stack (fixed — do not swap or add frameworks)

- Next.js 16 App Router + React 19 + TypeScript (strict), Turbopack
- TanStack Query (server state) · Zustand (game state) · Zod (all validation)
- Tailwind CSS 4 + shadcn/ui (vendored in `src/components/ui/` — do not edit)
- Framer Motion (animation) · React Hook Form (forms)
- Prisma 7 + SQLite via `@prisma/adapter-better-sqlite3`
- Vitest (unit/integration) · Playwright (`tests-e2e/`)

## Commands

```bash
npm install            # .npmrc already sets legacy-peer-deps=true
npx prisma db push     # sync dev DB (prisma/dev.db)
npm run dev            # http://localhost:3000
npm test               # vitest — MUST pass before you finish
npx eslint src tests   # MUST be clean before you finish
npm run build          # catches type errors vitest doesn't
npm run test:e2e       # Playwright; builds app, isolated DB in .e2e/
```

Definition of done for ANY change: `npm test` green + `npx eslint src tests`
clean + `npm run build` compiles. Add/update tests for behavior you change.

## Architecture map

```
src/
  proxy.ts                    # locale redirects + CSRF Origin check (API)
  i18n/                       # config.ts (locales) + dictionaries/{en,ru}.ts
  app/[locale]/               # pages: landing, games hub, play/<game>, admin, link/<token>
  app/api/                    # route handlers = the whole backend
  lib/
    games/<game>.ts           # PURE engine: no React, no I/O, fully unit-tested
    games/registry.ts         # single source of game metadata (icons, names)
    session.ts                # cookie + Telegram-header auth, scrypt passwords
    telegram.ts               # server-side initData HMAC validation
    telegram-client.ts        # client: initData from SDK or URL hash, haptics
    api.ts                    # typed client; apiFetch adds `Authorization: tma`
    analytics.ts              # fire-and-forget event tracking
  stores/<game>-store.ts      # Zustand wrapper around the engine
  components/games/<game>-client.tsx  # UI + autosave + sync wiring
  hooks/                      # use-autosave, use-remote-watch, use-session
scripts/init-db.mjs           # PRODUCTION migrations (raw idempotent DDL)
tests/, tests-e2e/            # vitest and Playwright suites
```

### Layered game pattern (follow it exactly)

**engine (pure fns) → store (Zustand) → client component**. Engines export
`newX`, move/apply functions, `xProgress` (0..1), `serializeX`/`deserializeX`
(deserialize must reject malformed input by returning `null`). No React
imports in engines or their tests.

### Adding a new game — checklist

1. `src/lib/games/<id>.ts` — pure engine + serializer; unit tests in
   `tests/games/<id>.test.ts` (include invariants over random playthroughs).
2. Add the id to `gameIdSchema` in `src/lib/schemas.ts` (backend accepts it).
3. `src/stores/<id>-store.ts` — Zustand store (`init/newGame/move/tick/reset`).
4. `src/components/games/<id>-client.tsx` — copy the wiring of an existing
   client (fifteen is the simplest reference): saveQuery + ContinueDialog +
   SyncDialog + useAutosave + useRemoteWatch + haptics + WinOverlay.
5. `src/app/[locale]/play/<id>/page.tsx` — thin server wrapper (validate
   locale, pass dictionary).
6. Register in `src/lib/games/registry.ts` → landing grid and hub pick it up.
7. Dictionary entries in BOTH `en.ts` and `ru.ts` (`games.<id>.name/tagline`).
   The `Dictionary` type is inferred from `en.ts`; a missing ru key is a
   compile error — this is intentional, keep it that way.
8. e2e smoke test in `tests-e2e/games.spec.ts`.

### Numsolis generation and saves

Numsolis uses a pure engine plus deterministic generation. Every accepted deal must have a complete solution replayed through the same legal-move engine; a search timeout is not proof of solvability. Generation runs asynchronously through the generation client. Store `revision` changes only on meaningful local actions, not timer ticks or remote initialization. A pending generation must never overwrite a later new game, reset, or loaded save. Keep each new/replayed game ID unique and history within the existing 50,000-character save limit. See `NUMSOLIS.md` for the confirmed rules, including immediate-merge capacity and lower-neighbor cascade priority.

### Adding a language

Add code to `locales` in `src/i18n/config.ts`, create
`src/i18n/dictionaries/<code>.ts` typed as `Dictionary`, register it in
`get-dictionary.ts`. Everything else (routing, hreflang, switcher) follows.

## Domain rules you must not violate

- **Saves**: one `GameSave` per (player, game). Autosave via `useAutosave`
  only — it debounces (1 PUT/s max), flushes with `keepalive` on unmount and
  feeds `syncedAt` to `useRemoteWatch`. Trigger saves from meaningful changes
  (moves), NEVER from timer ticks.
- **Save conflicts** (device link / remote watch): per game, newer
  `updatedAt` wins; signed-in profiles are never merged into or deleted;
  the user decides via SyncDialog when a live conflict appears.
- **Results**: post to `/api/results` at the moment of victory (e.g. 2048
  reached), not only at game over; guard with a ref so one game = one result.
- **Auth resolution order** (in `ensurePlayer`): session cookie → `tma`
  header → create guest. Registration/Telegram login upgrades the current
  guest in place so progress is kept.
- **Analytics**: `track()` is fire-and-forget and must never throw into the
  request path. New event types: just call `track("name", playerId, meta)` —
  the admin dashboard lists types dynamically.

## Hard-won gotchas (each cost us a production bug — respect them)

1. **Telegram Web (web.telegram.org) runs the app in a cross-site iframe.**
   Cookies may be blocked ENTIRELY (SameSite=None doesn't save you).
   Therefore: `apiFetch` sends `Authorization: tma <initData>` on every call;
   initData is parsed from the URL hash `#tgWebAppData=...` (available before
   any script loads) — never rely on the SDK object or `Script onReady` for
   auth. Any `sessionStorage`/`document.cookie` access must be wrapped in
   try/catch (throws SecurityError in that iframe).
2. **CSRF**: cookies are SameSite=None in prod, so `src/proxy.ts` rejects
   cross-origin mutations by Origin header, compared against
   `X-Forwarded-Host`/`Host` (behind nginx `request.nextUrl.host` is
   127.0.0.1:3000 — comparing with it caused false 403s).
3. **`suppressHydrationWarning` on `<html>`** in `[locale]/layout.tsx` is
   required: the Telegram SDK sets `--tg-viewport-*` styles pre-hydration.
   Do not remove it. Do not use `Script strategy="beforeInteractive"` outside
   the root layout — React throws "script tag while rendering".
4. **Pointer capture swallows clicks**: game boards call `setPointerCapture`
   for mouse swipes, so overlays with buttons must live OUTSIDE the board
   element (absolute-positioned siblings).
5. **Keyboard scoping**: key handlers go on the focused board element
   (`tabIndex={0}` + `onKeyDown` + autofocus), never on `window` with
   `preventDefault` — that broke page scrolling site-wide.
6. **Hydration-safe interactivity**: anything rendered on first paint that
   involves randomness (demo boards) must start from a deterministic state;
   randomness begins after the first user action.
7. **React Compiler lint** is strict: no direct `setState` inside effects, no
   mutating module state from components. Derive state or use
   `useSyncExternalStore` (see `home-link.tsx`) instead of set-state-in-effect.
8. **Prisma 7**: datasource URL lives in `prisma.config.ts`/`DATABASE_URL`,
   NOT in schema.prisma; client is generated to `src/generated/prisma` and
   constructed with the better-sqlite3 adapter (`src/lib/prisma.ts`).
9. **Schema changes require THREE updates**: `prisma/schema.prisma`,
   raw DDL in `scripts/init-db.mjs` (production migrations — idempotent
   `CREATE TABLE IF NOT EXISTS` + incremental `ALTER TABLE` guarded by
   `PRAGMA table_info`), and the DDL copy in `tests/api/harness.ts`.
10. **npm**: peer-dep conflict between @hookform/resolvers and valibot —
    `.npmrc` has `legacy-peer-deps=true`; don't remove it. In Docker dev,
    node_modules lives in a named volume (see Dockerfile.dev comments).
11. **better-sqlite3 is a native module**: server Node major version must
    match the CI build (Node 22). Don't bump one without the other.

## Design system (Auralis) — keep the visual language

Dark ink theme, defined in `src/app/globals.css`:

- Colors via tokens only: `bg-background` #15171C, `bg-card`, `bg-surface`
  #322A1F, gold accents `text-gold` #B98A45 / `text-gold-soft` #FFE8B8,
  `text-muted-foreground`. Never hardcode other hex values.
- Type: headings/numbers `font-display` (Archivo), body `font-body`
  (Georgia), labels/meta `label-mono` (IBM Plex Mono, uppercase, tracked).
- Helpers: `hairline` (inner border glow), `paper-grain` (bg gradient),
  radius tokens (`rounded-lg` = 8px), pill buttons `rounded-full`, primary
  action = gold bg + `text-primary-foreground`.
- Motion: framer-motion, ease `[0.22, 1, 0.36, 1]`, staggered entrances,
  spring for tiles; keep it restrained. Mobile-first (390px), thumb-sized
  touch targets, `touch-none` on swipe surfaces.
- New UI primitives: `npx shadcn@latest add <component>`, then style with
  the tokens above. Do not hand-edit files in `src/components/ui/`.

## i18n rules

- Every user-facing string comes from the dictionary (`dict.<section>.<key>`).
  No hardcoded copy in components — including aria-labels where feasible.
- URLs are locale-prefixed (`/ru/...`, `/en/...`); pages validate the locale
  param and 404 otherwise. Use `HomeLink` for "home" navigation (it targets
  `/games` inside Telegram, `/` in browsers).

## Testing conventions

- Engines: exhaustive unit tests incl. serializer fuzz cases and invariant
  checks over hundreds of random moves.
- API: integration tests via `tests/api/harness.ts` — real SQLite in a temp
  dir + mocked `next/headers`; `useDevice(jar, headers?)` simulates devices;
  import route handlers dynamically AFTER `initDb()`.
- Hooks: jsdom + fake timers (see `use-autosave.test.tsx` for the pattern).
- e2e: mobile viewport, single worker (shared DB), specs must clean up after
  themselves or tolerate existing state.

## Deploy (context only — don't automate without being asked)

GitHub Actions "Auto Release"/"Release" → GitHub Releases (standalone tar.gz)
→ server runs `update.sh` (systemd + nginx, no Docker). DB migrations run via
`scripts/init-db.mjs` on every deploy — which is why it must stay idempotent.
Docs: `DEPLOY.md`. Secrets: `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`,
`ADMIN_KEY` (`.env.example`).

## Etiquette

- Don't create new top-level directories, rename public API routes, or
  change cookie/session semantics without explicit approval.
- Never commit `prisma/dev.db`, `.env`, `coverage/`, `test-results/`.
- Clean up any players/saves your manual testing creates in the dev DB.
- When you finish a feature, update README.md (user-facing) and this file
  (agent-facing) if conventions changed.
