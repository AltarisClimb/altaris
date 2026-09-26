# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ALTARIS™ Pro Platform — climbing performance/training app. Vanilla JS split into **native ES modules** under `src/`, loaded directly by the browser from `index.html` (a thin shell). No build step, no bundler, no npm dependencies — `package.json` exists only to run tests. Keep it that way unless explicitly asked.

## Commands

```bash
npm test                              # node --test, all tests in tests/
node --test tests/workload.test.js    # a single test file
npm run serve                         # http://localhost:8080 (ES modules need HTTP; file:// won't work)
scripts/test-db.sh                    # Supabase RLS tests against a throwaway local Postgres
node scripts/build-seed.mjs           # regenerate supabase/seed.sql from src/domain/exercises.js
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main` and every PR, plus `node --check` on each module and a check that `supabase/seed.sql` matches the exercise bank.

The service worker caches the app shell; hard-refresh or unregister it when iterating locally.

## Two rules the code depends on

1. **Every file added under `src/` must be listed in `PRECACHE` in `sw.js`**, or offline mode breaks silently. `tests/precache.test.js` enforces this.
2. **`data.js` and `domain/` must never import `views/` or `actions.js`.** That keeps business logic testable under Node. When the data layer needs a re-render it calls `requestRender()` from `bus.js`, which `main.js` wires to the real `render()` at boot.

## Architecture

- `src/main.js` — boot + `render()`. Imports `actions.js` for its side effects (it registers all event listeners); removing that import leaves a UI that ignores clicks.
- **Rendering is a full re-render**: `render()` rebuilds `#app.innerHTML` from string-returning view functions (`src/views/*`), then restores scroll and focus (inputs carry `data-fk`). No virtual DOM, no components.
- **Interaction is delegated**: `document`-level listeners in `src/actions.js` match `[data-act]` (click), `[data-act-input]`, `[data-act-change]` and dispatch to the `ACTIONS` map. New control = `data-act="name" data-v="..."` in markup + an `ACTIONS` entry.
- **UI-only state** (current tab, selected athlete, filters, onboarding/test-runner progress) lives in `View` (`src/views/shell.js`); role → tabs mapping is `TABS` there.
- **Persistence** is `src/data.js`: `Store` (`init`/`list`/`get`/`put`/`del`, collections in `COLS`), `Session`, `Access` (RBAC), `audit()`, `config()`. `Store` tries the Claude artifact DB (`claude.use("db")`) and falls back to `localStorage` with a write queue — "Mode local" in the footer is expected outside that runtime. This module is the seam being replaced by Supabase.
- `Access` checks are **client-side only**; they are not a security boundary. Real permissions live in the Supabase RLS policies (below).
- `Session.live()` re-reads the user from `Store`; prefer it over `Session.user`.
- **i18n**: `src/i18n/fr-FR.js` and `en-US.js` are flat key → string maps; `t(key, vars)` from `src/i18n/index.js`. Every user-facing string goes through `t()`, and both files must get the key.
- `src/domain/` — pure logic: grades, scoring/level routing, workload (session-RPE load, ACWR rolling-average and EWMA, monotony/strain), exercise bank (`"FR|EN"` strings per field).

## Supabase backend (in progress)

Target roles: `admin`, `teacher`, `student` (the UI still says admin/coach/climber).

- `supabase/migrations/` — schema + Row Level Security. Tables: `profiles` (role, status, `teacher_id` set by admins only), `exercises` (`visibility` is `free` = everyone, or `library` = teachers/admins, students only via assignment; only admins publish `free`), `assignments` (teacher → own students). Any change to who-can-see-what is a policy change **plus** a case in `supabase/tests/rls.sql`.
- Client side: `src/config.js` holds the project URL + anon key (empty = local PIN mode). `src/remote.js` wraps auth and `profiles`, lazy-loads the vendored UMD client `src/vendor/supabase.js` (supabase-js, MIT; replace the file to upgrade), and is the only place that maps schema roles (admin/teacher/student) to UI roles (admin/coach/climber). In Supabase mode, `Store.put("users", …)` sends name/role/status/coach to the server first and only updates the local copy if the server accepts. Collections in `REMOTE_COLS` (`src/data.js`, currently `sessions`) live in the generic `athlete_docs` table (RLS: the athlete, their coach, admins; Realtime enabled): writes are optimistic, queued when offline, and `Store.syncRemote()` replaces the cache with the server view after login. The other collections are still local.
- Exercise bank v2: `node scripts/build-bank-v2.mjs <outil-entrainement-escalade.html>` regenerates `supabase/migrations/20260927000100_exercise_bank_v2.sql` (82 exercises, 3 variants, FR/EN/ES, pose data in `content.meta.pose`, drawn by `src/ui/poses.js`). Built-in exercises it supersedes are listed in `REPLACED` in `src/domain/exercises.js`; `build-seed.mjs` leaves them out. 12 categories (`EX_CATS`), labels `ex.cat.*`.
- An admin is a coach with extra powers: same tabs as a coach plus the admin ones, sees every climber, and can be a student's `teacher_id`.
- `supabase/seed.sql` is generated — don't edit by hand.
- `supabase/tests/auth_stub.sql` fakes Supabase's `auth` schema and roles for local tests only; never apply it to a real project.

## Constraints from README

See `README.md` for deployment and the pre-launch checklist (real auth, RLS, GDPR art. 9 consent for health data, retention, HDS). Do not add quantified injury-risk-reduction claims anywhere in the copy.
