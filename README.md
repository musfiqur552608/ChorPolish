# Chor Police — Project Documentation

## Overview
Chor Police (chorpolice) is a polished, mobile-first, real-time exactly-4-player web game recreating the classic Bangladeshi paper game. Players sit at a virtual table, draw folded paper slips, and try to catch the Chor (thief) or Dakat (robber) while avoiding being caught yourself.

The game is built with React 18 + Vite + TypeScript, Tailwind CSS, Zustand, React Router, Framer Motion, and Supabase for backend/auth/realtime.

---

## 📦 Quick Start

### Prerequisites
- Node.js v20+ (v22 recommended)
- npm or bun

### Installation
```bash
npm install
```

### Development
```bash
npm run dev      # Vite dev server
npm run typecheck # TypeScript check (clean)
npm run build    # Production build (✓ built in ~10s)
npm run test     # Run Vitest tests
```

### Production Build
```bash
npm run build
```
Output: `dist/` directory with static files.

---

## 🗂️ Project Structure

```
src/
├── features/
│   ├── engine/          # Pure game engine (142/142 Vitest tests pass)
│   ├── lobby/           # Lobby UI (LobbyView, RoomRoute, RoomPreviewView)
│   ├── room/            # Game table (GameTable), session hook (useRoomSession)
│   ├── scoresheet/      # ScoreSheet component
│   └── shell/           # NotFoundPage
├── i18n/                # Bengali (default) + English locale files
├── lib/                 # Utilities: sound, haptics, cn, errors, time, etc.
├── config/              # GAME_CONFIG (points, timers, avatars, phase durations)
├── features/shell/      # NotFoundPage component
└── App.tsx              # Root component with routing
```

### Migrations (Supabase PostgreSQL)
Migration files are in `supabase/migrations/` and **must be applied in filename order**:
- `20261023000100_init.sql` — Schema, RLS policies, grants, realtime configuration
- `20261023000200_game_rpcs.sql` — All security-definer RPCs (create_room, join_room, set_ready, set_rounds, start_game, pick_slip, police_guess, advance_phase, leave_room, heartbeat, sync_room, finalize_room, build_room_state, cleanup_rooms, etc.)
- `20261024000400_manual_flow.sql` — Manual Babu rise → ask Police → Police rise → guess flow, new phase timestamps, `rooms.state_version`
- `20261024000500_scheduled_cleanup.sql` — Schedules `public.cleanup_rooms()` via pg_cron (safe replacement for the former 003 draft)
- `20261024000600_end_of_room_cleanup.sql` — Deterministic deletion for every ended room: 120s cleanup window on finalize, 5-minute finished fallback, 10-minute stuck-final fallback, 30-minute idle cleanup

The old `003_cleanup_migration.sql` draft was **removed**: it redefined `finalize_room`/`leave_room`, granted internal functions to `public`, and deleted child rows directly. If that draft was ever applied to a database, re-run `20261023000200_game_rpcs.sql` once afterwards — it is idempotent and restores the audited function bodies.

#### Applying to hosted Supabase (SQL editor)
1. Open **Dashboard → SQL Editor** for the project.
2. Paste and run each migration file in order (001 → 002 → 004 → 005 → 006).
3. Enable pg_cron once: **Database → Extensions → pg_cron → Enable**.
4. If pg_cron was enabled *after* running 005, schedule the job manually:
   ```sql
   select cron.schedule(
     'chor-police-cleanup-rooms',
     '* * * * *',
     'select public.cleanup_rooms();'
   );
   ```
5. Verify:
   ```sql
   select extname from pg_extension where extname = 'pg_cron';
   select jobid, jobname, schedule, command, active
     from cron.job where jobname = 'chor-police-cleanup-rooms';
   select public.cleanup_rooms();  -- manual run; deletes ended/idle rooms
   -- Replace CODE; after cleanup this must return 0.
   select count(*) from public.rooms where code = 'CODE';
   ```
6. Verify the manual flow is live:
   ```sql
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'rounds'
      and column_name in ('babu_risen_at', 'police_called_at', 'police_risen_at');
   ```
   Three rows must be returned. Until 004 is applied, the client automatically falls back to the legacy automatic reveal phases.

`finalize_room()` gives **every** ended room (completed or abandoned) `cleanup_at = now() + 120s`, which is enough time to export the notebook. `cleanup_rooms()` then deletes rooms past `cleanup_at` regardless of client polling, finished rooms older than 5 minutes, rooms whose final round sat on `ROUND_RESULT`/`MATCH_END` for 10 minutes, and rooms idle for 30 minutes. Deleting `public.rooms` cascades to `players`, `rounds`, `round_roles`, `round_results`, and `reactions`. The function is revoked from `anon`/`authenticated` and only runs from the cron job. Explicit `leave_room()` still hard-deletes immediately.

### Automated Tests
Run `npm.cmd run test`, or `npm.cmd run verify` for typecheck + tests + build.
142 tests across 14 files cover:
- Engine: target parity, draw order, shuffler rotation, scoring (Chor/Dakat), competition ranking, Babu tie-break, shared ranks, transitions, visibility, history dedupe
- Config: zero-based slot contract, four seats, points, timers, avatars
- Room codes: sanitising and validation against the database alphabet
- Errors: longest-code matching, network/schema/auth mapping, translation fallback
- Time/numbers: countdowns, clock offset, Bengali digits, English ordinals
- Share/clipboard: invite URLs, Web Share outcomes, file sharing, clipboard fallback cleanup
- Storage/request IDs/i18n storage: profile drafts, recent room, blocked storage, UUID fallback, language preference
- i18n: identical English/Bengali keys and interpolation placeholders
- Migrations/privacy: RLS/grants/publication secrecy, cascade deletes, leave hard-delete, cleanup, own-role gating, manual flow, safe pg_cron schedule, room code excluded from scorecards

142 of 142 tests pass. See [`TESTING.md`](TESTING.md) for the manual four-player checklist and SQL verification queries.

### Environment Variables
Create `.env` (or verify existing):
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_YOUR_KEY
```

### GitHub
- Repository: `https://github.com/musfiqur552608/ChorPolish`
- First commit: `2dc6db8` — Phase 2-3: lobby UI, game table, engine tests, migrations

---

## 🎮 Game Rules (from config)

| Role | Points |
|------|--------|
| BABU | 90 |
| POLICE | 80 (if correct) / 0 (if wrong) |
| CHOR | 60 (if not caught) / 0 (if caught) |
| DAKAT | 70 (if not caught) / 0 (if caught) |

| Round | Target Role |
|-------|-------------|
| Odd (1,3,5…) | CHOR |
| Even (2,4,6…) | DAKAT |

- 4 players, 4 seats, host starts
- Shuffler rotates clockwise each round (starting from host)
- Draw order: counter-clockwise from shuffler (shuffler takes last slip)
- Babu reveals first → Police reveals → "Babu's orders" → Police guesses → Final reveal → Round result
- Competition ranking: 1, 2, 2, 4. Babu count breaks total-score ties. Equal both share rank.
- Odd rounds hunt Chor, even rounds hunt Dakat
- Disconnected player: seat held for 40s, then 90s grace period, then abandoned

---

## 🛠️ Development Notes

### Architecture
- **All authoritative game logic lives in PostgreSQL security-definer RPCs**, not Edge Functions
- `round_roles` has RLS enabled, no policies, no grants, and is excluded from realtime
- `rounds` table is also client-inaccessible and removed from realtime/publication because `guess_correct` could leak before `FINAL_REVEAL`; round data is exposed only through sanitized RPC JSON
- Public tables readable by members: `rooms`, `players`, `round_results`, `reactions`
- Realtime used for meaningful player/room changes, results, and reactions
- Polling/deadline timers cover phase transitions as fallback

### Key Files
- `src/features/room/useRoomSession.ts` — Authoritative hook: boot, join/preview, room state, realtime presence, polling, deadline wakeups, actions (ready/start/pick/guess/advance/react/leave), error handling
- `src/features/room/RoomRoute.tsx` — Full router: setup/error/closed/preview/joined/game states
- `src/features/room/LobbyView.tsx` — Lobby UI with 4 seats, ready toggles, host controls, invite sheet
- `src/features/room/GameTable.tsx` — Phase-driven game table (all 10 phases, including legacy `BABU_ORDER`)
- `src/features/engine/engine.ts` — Pure game engine (no React/Supabase dependency)
- `src/config/game.ts` — Central config: points, timers, avatars, phase durations
- `src/i18n/locales/bn.ts` — Bengali (default) + English
- `src/features/scoresheet/ScoreSheet.tsx` — Handwritten score sheet (live, compact, captureMode, PNG/PDF export)

### Pause/Reconnect Mechanics
- Player goes offline after 40s of no activity (`isOnline: false`, `disconnectedAt` set)
- `room.pausedAt` set when any player is offline
- 90s grace period from `disconnectedAt`
- If player returns within 90s: `sync_room` marks them online, clears `pausedAt`, and shifts deadlines by the pause duration
- If grace expires: `finalize_room('abandoned')` keeps scores from completed rounds, computes `final_rank`, and sets `cleanupAt = now() + 120s`
- Every finalized room (completed or abandoned) gets the same 120-second download window
- `cleanup_rooms()` deletes at `cleanupAt` even while clients keep polling; finished rooms fall back to 5 minutes, stuck final results to 10 minutes, and idle rooms to 30 minutes
- The result screen shows the cleanup countdown; explicit leave deletes immediately; deleting the room cascades to all child rows

### TypeScript & Build
- `npm.cmd run typecheck` — clean
- `npm.cmd run build` — `✓ built`
- `npm.cmd run verify` — typecheck + 142 tests + production build

---

## 📦 What's Included

### ✅ Complete Features
- Lobby UI + game table for all 10 phases (manual flow + legacy `BABU_ORDER`)
- Pause/reconnect with 90s grace; all ended matches get a deterministic 120s deletion window, and abandoned matches keep partial scores
- MATCH_END with competition ranking, shared ranks, Babu tie-break, partial/abandoned states, and a cleanup countdown
- Bengali default + English toggle (key/interpolation parity enforced by tests)
- Sound/haptics for all actions
- Reduced motion support
- Accessible How to Play modal and focus-trapped dialogs
- ScoreSheet (live, compact, captureMode) with private own-slip reveal
- PNG/PDF scorecard export + Web Share API (room code excluded)
- 142/142 automated tests (unit, static migration/security invariants)
- 5 SQL migrations (001 → 002 → 004 → 005 → 006)
- Guaranteed end-of-room data deletion (cleanup_at + cron fallbacks + FK cascades)
- GitHub repository with full history

### 🔧 To Do (Low Priority)
- Apply migrations 004/005/006 to the hosted Supabase project (manual flow + deletion guarantee are behind this)
- Enable anonymous sign-ins and pg_cron in the Supabase dashboard
- Verify realtime integration against the hosted project after 004/005/006
- See [`TESTING.md`](TESTING.md) for the manual four-player regression checklist

---

## 👤 Author
Built with React 18 + Vite + TypeScript + Tailwind + Zustand + React Router + Framer Motion + Supabase + i18next + html-to-image + Vitest.

For questions or support, see the GitHub repository or check the code comments.