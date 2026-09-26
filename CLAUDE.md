# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ALTARIS™ Pro Platform — a climbing performance/training analytics app for climbers, coaches, and admins. It is a **single HTML file** (`index.html`, ~4850 lines): vanilla JS, no build step, no npm dependencies, no framework. The only external resource is a Google Fonts stylesheet; everything else (CSS, JS, SVG icons, exercise data) is inlined in `index.html`.

Do not introduce a bundler, framework, or npm dependency without being explicitly asked — the zero-build, single-file nature is a deliberate architectural choice (see README.md §6), not an oversight.

## Running / testing locally

There is no build or test tooling in this repo (no `package.json`). To work on the app:

- Open `index.html` directly in a browser, or serve the directory statically (e.g. `python3 -m http.server`) since the service worker only registers over `http(s)`, not `file://`.
- There is no automated test suite. Verify changes manually in the browser against the relevant role (climber / coach / admin) and check both `fr` and `en` (`LANG` toggle in the top bar).
- The service worker (`sw.js`) caches the app shell; when iterating on `index.html`, hard-refresh or unregister the SW to avoid seeing stale content.

## Supabase backend (in progress)

The app is migrating from the Claude-artifact/localStorage `Store` to Supabase. Target roles: `admin`, `teacher`, `student` (the current UI still says admin/coach/climber).

- `supabase/migrations/` — schema + Row Level Security. **Permissions live here, not in the client.** Any change to who-can-see-what must be a policy change plus a test.
- `supabase/seed.sql` — generated; regenerate with `node scripts/build-seed.mjs` (extracts the exercise bank from `index.html`).
- `scripts/test-db.sh` — spins up a throwaway local Postgres, applies migrations + seed, runs `supabase/tests/rls.sql`. Exits non-zero on any `FAIL`. `supabase/tests/auth_stub.sql` fakes Supabase's `auth` schema and roles for this.

## Architecture

`index.html` is organized into numbered sections, each wrapped in its own `<script>` tag (search for `/* ===... N. SECTION NAME ===... */`):

1. Internationalization — `DICT` (a flat `key -> [fr, en]` map), `t(key, vars)`, `setLang`, locale-aware `fmt*` helpers. **Every user-facing string goes through `DICT`/`t()`** — there is no third language and no fallback to raw strings.
2. Persistence layer — `Store` (see below), `Access` (RBAC), `Session`, `audit()`.
3. Climbing domain model — grade scales, level routing, test protocols/scoring.
4. Workload analytics — session load (Foster session-RPE), ACWR, monotony/strain.
5. Exercise bank — bilingual (`"FR|EN"` field strings) reference data.
6–8. Identity assets (inlined SVG logo), UI primitives (icons/toasts/modals), charts (theme-token colors only).
9. `View` (in-memory UI state) + shell chrome (topbar, tab bar, footer).
10–19. Auth, onboarding, and one section per role-facing screen (climber overview/calendar/tests/exercises/messages/profile; coach command center/planning; admin accounts/pairings/params/audit).
20. Modals.
21. Export (JSON export of all data or "mine").
22. Demonstration dataset (`seedDemo`/`purgeDemo`).
23. Action dispatch — the `ACTIONS` table.
24. Render & boot.

### Data flow / rendering model

There is no virtual DOM and no component framework. The whole app is one full re-render on every state change:

- `render()` sets `#app.innerHTML` from `watermark() + topbar() + body() + legalFooter()`, then restores scroll position and focus (via `data-fk` on inputs).
- View functions (e.g. `viewOverview`, `viewCalendar`) are pure string-builders returning HTML; there's no diffing.
- All user interaction is delegated through `document.addEventListener("click"/"input"/"change"/"drag*", ...)` matching `[data-act]`, `[data-act-input]`, `[data-act-change]` attributes, dispatching into the `ACTIONS` map (section 23). To add a new interactive control, add a `data-act="name"` (optionally `data-v="value"`) to the markup and a handler in `ACTIONS`.
- Mutable UI-only state (current tab, selected athlete, calendar week, filters, in-progress onboarding/test-runner state) lives in the global `View` object, not in `Store`.

### Persistence (`Store`, section 2)

- `COLS = ["users", "assessments", "sessions", "pain", "threads", "routines", "config", "audit"]` — the full list of collections. Data shape is `Store.data[col][id] = doc`.
- `Store.init()` tries `claude.use("db")` (the Claude artifact runtime's database). If unavailable, the app **automatically falls back to `mode: "local"`**, persisting to `localStorage` (`altaris.cache.v1`) with a write queue (`altaris.queue.v1`) that flushes when connectivity/cloud returns. This local-mode fallback is intentional and load-bearing — don't "fix" it by requiring a backend.
- In cloud mode, each collection is a live `onSnapshot` subscription; writes go through `Store.put(col, id, obj)` / `Store.del(col, id)`, which are optimistic (write local + render immediately) and queue on failure.
- `Store.mode === "local"` is surfaced to the user in the footer ("Mode local"); this is expected, not a bug, when running outside the Claude artifact runtime (e.g. on Vercel/Cloudflare/GitHub Pages — see README.md §2 for the full implication: no cross-browser sync in local mode).
- RBAC (`Access` object) is enforced **client-side only** — `Access.climbers()`, `Access.canSee()`, `Access.scoped()` gate what a coach/climber/admin can see in the UI, but there is no server to enforce this. Don't treat client-side `Access` checks as a real security boundary; see README.md §5 and §7 for the planned Supabase + Row Level Security migration.
- To swap in a real backend, the persistence surface to replace is exactly `Store`'s five methods (`init`, `list`, `get`, `put`, `del`) — see README.md §5.

### Roles

Three roles drive both `TABS` (nav) and `Access`: `climber`, `coach`, `admin`. Role-specific screens live in their own numbered sections (12–19). `Session.live()` always re-reads the current user doc from `Store` rather than trusting the cached sign-in snapshot — use that pattern (not `Session.user` directly) when you need up-to-date profile/status data.

## Deployment

See `README.md` for full deployment details (Vercel/Cloudflare/GitHub Pages, headers via `vercel.json`, the Supabase migration path, and the pre-launch checklist in README §7 — auth, RLS, GDPR consent, data retention). Notably: this app **must not carry quantified injury-risk-reduction claims** (README §7, last item) — keep that in mind when touching any copy in `DICT` related to training safety/outcomes.
