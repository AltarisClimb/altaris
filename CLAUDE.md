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

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main` and every PR, plus `node --check` on each module and a check that `supabase/seed.sql` matches the exercise bank. CI is deliberately non-blocking (`continue-on-error` on each job): check the job results, not just the run's overall status.

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

Database roles are `admin`, `teacher`, `student`; the UI deliberately says Admin / Coach / Grimpeur (climber) — don't rename the UI labels.

- `supabase/migrations/` — schema + Row Level Security. Tables: `profiles` (role, status, `teacher_id` set by admins only), `exercises` (`visibility` is `free` = everyone, or `library` = teachers/admins, students only via assignment; only admins publish `free`), `assignments` (teacher → own students). Any change to who-can-see-what is a policy change **plus** a case in `supabase/tests/rls.sql`.
- Client side: `src/config.js` holds the project URL + anon key (empty = local PIN mode). `src/remote.js` wraps auth and `profiles`, lazy-loads the vendored UMD client `src/vendor/supabase.js` (supabase-js, MIT; replace the file to upgrade), and is the only place that maps schema roles (admin/teacher/student) to UI roles (admin/coach/climber). In Supabase mode, `Store.put("users", …)` sends name/role/status/coach to the server first and only updates the local copy if the server accepts. Collections in `REMOTE_COLS` (`src/data.js`: `sessions`, `assessments`, `pain`, `prefs`, `routines`, `videos`, `ascents`) live in the generic `athlete_docs` table (RLS: the athlete, their coach, admins; Realtime enabled): writes are optimistic, queued when offline, and `Store.syncRemote()` replaces the cache with the server view after login. Messaging uses its own tables (`messages`: one immutable row per message, sender and time stamped by the server; `message_reads`: per-user read markers); in Supabase mode `Store.data.threads` holds one conversation per climber keyed by the climber id, shared by their coach and admins. `prefs` is the climber's training profile (one doc `prefs-<id>`, keys in `PREF_KEYS`: level, availability, dated goal, gear — never injuries or pain), copied into `users[id].profile` by `Store.applyPrefs()`; `routines` are session templates owned by their author (`userId`). The other collections are still local.
- Exercise bank v2: `node scripts/build-bank-v2.mjs <outil-entrainement-escalade.html>` regenerates `supabase/migrations/20260927000100_exercise_bank_v2.sql` (82 exercises, 3 variants, FR/EN/ES, pose data in `content.meta.pose`, drawn by `src/ui/poses.js`). Built-in exercises it supersedes are listed in `REPLACED` in `src/domain/exercises.js`; `build-seed.mjs` leaves them out. 12 categories (`EX_CATS`), labels `ex.cat.*`.
- Health data (`assessments`, `pain` — `HEALTH_COLS` in `src/data.js`) is GDPR art. 9: the server only accepts it for a climber with `profiles.health_consent_at` set, only the climber can set/clear it, and clearing erases those docs. The client never sends it without consent (it stays on the device) and asks for consent via `withHealthConsent()` when reporting pain or starting a test. Don't add another health collection without this gate.
- Edge Functions (Deno) in `supabase/functions/`: `notify` (push to the other side after a message/session; verifies the caller's JWT and `can_access_athlete`, reads content from the DB), `remind` (pg_cron every 5 min, `x-cron-secret`, 1 h before sessions using `profiles.timezone`), `calendar` (private webcal feed by `calendar_tokens.token`). `_shared/ics.js` is plain JS so Node tests it too (`tests/feed.test.js` keeps it in line with `src/domain/calendar.js`). Setup steps and secrets: README §5. `VAPID_PUBLIC_KEY` in `src/config.js` empty = push UI hidden.
- Climber plans (`profiles.plan`: trial 7 days / standard / premium, set by an admin; `plan_of()` gives the effective plan incl. `expired`): the server enforces them (trial = beginner battery + sessions within the trial, expired = no training, messaging and video calls = premium). Client side: `src/domain/plans.js` (`FEATURES`, `effectivePlan`), `planOf`/`can` in `data.js` (everything open in local mode), `withPlan()`/`plansModal()` in `modals.js`. Programmes are generated by `src/domain/program.js`; premium video calls use `call_slots` (+ `guard_call_slot`) and Jitsi links (`src/views/calls.js`).
- Training tools (pure logic in `src/domain/`, screens in `src/views/hang.js` and `src/views/training.js`): hangboard timer protocols and phases (`hang.js`), per-set load log stored as `session.log = { [exerciseId]: [sets] }` and next-load suggestion (`loads.js`), grade benchmarks for the max-hang and weighted pull-up tests (`benchmarks.js` — rough field figures, always shown with their disclaimer), dated goal → phases anchored at `profile.goalFrom` (`periodization.js`), declared gear filtering the programme (`gear.js`), warm-up generator (`warmup.js`), retest every `config().retestDays` (`retestStatus` in `progress.js`).
- Grades are stored in French notation (`gradeSport` 7a, `gradeBoulder` 7A) and displayed per app language: French in French, YDS / V-scale in English (`sportLabel`, `boulderLabel`, `gradePair`, `*Options` in `domain/grades.js`). Weekly availability is edited on a drag grid (`src/views/availgrid.js`, slot ↔ 30-min cell logic in `domain/availability.js`). The exercise library tab is staff-only (`tabAllowed` in `shell.js`); climbers only see the exercises of their sessions.
- Coaching layer: coach feedback on a finished session (`session.review` with text, per-exercise notes and an optional voice note; `session.seenBy`) in `src/views/review.js`; video analysis (Premium, `videos` docs with time-stamped `notes`) in `src/views/videos.js`; files (clips, voice notes) go to the private Storage bucket `media`, one folder per climber (`<athlete uuid>/…`), through `src/media.js` (in-memory `local:` paths in local mode). Logbook of sends (`ascents`, `domain/logbook.js`, `views/logbook.js`) and monthly recap with a shareable 1080×1350 canvas image (`domain/recap.js`, `views/recap.js`). Edge Function `notify` also handles `review`, `video`, `videoNote`.
- Engagement: exercise demo videos (`exercise_demos` table + private bucket `exercise-media`, staff-only writes; `setDemos`/`exVideo` in `domain/exercises.js`, `uploadDemo`/`bindDemos` in `media.js`); adaptive plan (`domain/adapt.js`: next planned session lightened after two sessions well above target or active pain, intensified after two easy ones; `session.adapted.from` keeps the original, coaches can undo); signature programmes (`domain/signature.js`, `views/signature.js`, up to 8 weeks via `generateProgram({ maxWeeks })`); plan preview after onboarding; self-service subscriptions through Edge Functions `checkout`, `billing-portal`, `stripe-webhook` (only the webhook changes `plan`; `guard_plan` blocks billing fields for every signed-in user; `_shared/stripe.js` is Node-tested); `remind` also sends the Sunday streak push and the Monday email (`_shared/digest.js`, Brevo, `profiles.weekly_email`). Setup: README §5.
- Coach workspace: the inbox is filtered by climber (`View.inboxFor`); the planning tab opens on the coach's own agenda (`src/views/agenda.js`: week grid of the climbers' sessions plus the coach's availability = `call_slots`, click/drag to open or remove, month summary) before each climber's calendar; messaging is a chat layout with a conversation list per assigned climber and an emoji panel (`src/views/messages.js`).
- Network: `profiles.region` (declared, never geolocated), `languages`, `directory_optin`; the reciprocal directory is the security-definer function `directory()` (first name + initial, role, region, languages only) — `domain/network.js`, `views/network.js`. `Remote.profiles()` falls back to older column sets when a migration is missing, so a late migration never blocks sign-in.
- Glossary: `info("acwr")` from `src/ui/glossary.js` puts a “?” next to a technical term (texts `lx.<term>.t/.d/.ex`). Cards are never stored by the app: the profile button opens Stripe's portal (`billing-portal` creates the customer if needed). A finished session can be shared as a 1080×1350 image (`shareSession` in `views/recap.js`, Web Share sheet → Instagram).
- An admin is a coach with extra powers: same tabs as a coach plus the admin ones, sees every climber, and can be a student's `teacher_id`.
- `supabase/seed.sql` is generated — don't edit by hand.
- `supabase/tests/auth_stub.sql` fakes Supabase's `auth` schema and roles for local tests only; never apply it to a real project.

## Constraints from README

See `README.md` for deployment and the pre-launch checklist (real auth, RLS, GDPR art. 9 consent for health data, retention, HDS). Do not add quantified injury-risk-reduction claims anywhere in the copy.
