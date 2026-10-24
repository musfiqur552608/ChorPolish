# Testing & QA

This project is verified with automated unit/static tests plus a four-player
manual end-to-end pass. Run everything with:

```powershell
npm.cmd run verify
```

`verify` runs `tsc -b`, Vitest, and the production build in order.

## Automated coverage

| Suite | File | What it protects |
|---|---|---|
| Engine | `src/features/engine/engine.test.ts` | Target parity, clockwise draw order, shuffler rotation, role validation, scoring (Chor + Dakat rounds), competition ranking, shared ranks, Babu tie-break, phase transitions, timed phases, role visibility, score aggregation, history dedupe, end-of-game superlatives |
| Rules config | `src/config/game.test.ts` | Zero-based slot contract, four seats, point values, timers, avatars/reactions, round presets |
| Room codes | `src/lib/roomCode.test.ts` | Uppercase sanitising, unreadable-character rejection, six-character validation |
| Errors | `src/lib/errors.test.ts` | Longest-code matching (`PLAYERS_NOT_READY` vs `NOT_READY`), network/schema/auth mapping, translation fallback |
| Time | `src/lib/time.test.ts` | Countdown rounding, clock offset, relative minutes, malformed timestamps |
| Numbers | `src/lib/numbers.test.ts` | Bengali digits, English ordinal suffixes (`21st`, `111th`) |
| Share | `src/lib/share.test.ts` | Invite URLs, native share success/cancel/unsupported, file sharing guards |
| Clipboard | `src/lib/clipboard.test.ts` | Secure-context API, legacy fallback, textarea cleanup on failure |
| Profile storage | `src/lib/profileDraft.test.ts` | Draft round-trip/truncation, malformed JSON, blocked storage |
| Request IDs | `src/lib/requestId.test.ts` | UUID v4 shape, uniqueness, no-Web-Crypto fallback |
| Translations | `src/i18n/locales.test.ts` | Identical key sets and interpolation placeholders in English and Bengali; no blank strings |
| Migrations | `src/testing/migrations.test.ts` | Secret-table RLS/grants/publication, cascade deletes, leave hard-delete, cleanup rules, own-role gating, manual-flow phases, safe pg_cron schedule, end-of-room deletion (120s/5m/10m/30m), no unsafe 003 draft, SQL point table matches the client |
| Privacy | `src/testing/privacy.test.ts` | The exported/in-game score sheets never receive the room code |

The migration suite is static: it reads the SQL files, so it needs no database.
It is a guardrail, not a substitute for applying migrations to a real project.

## Manual four-player end-to-end pass

Use four browser profiles or one normal window plus three incognito windows.
Apply migrations `004`, `005`, and `006` first (see README).

1. **Lobby**
   - Host creates a room; code is six readable characters.
   - Invite link opens the preview page with the name prefilled.
   - Four players fill seats 1–4 in order; a fifth visitor sees “room full”.
   - Host changes rounds; all four screens update.
   - Everyone readies; Start is disabled until four ready and online.
2. **Shuffle and draw**
   - Shuffle rotates clockwise from the host each round.
   - Four slips are shown (visually numbered 1–4, stored as slots 0–3).
   - Only the active picker can tap an available slip; tapping out of turn does nothing.
   - After a pick, that player sees **only their own** role and points; nobody sees the picker’s role.
   - The shuffler receives the last slip and sees it once the third picker finishes.
3. **Manual reveal**
   - Babu sees the rise button; other screens show a face-down Babu slip.
   - After Babu rises, everyone sees Babu; only Babu sees “Ask: who is Police?”.
   - After the ask, every screen shows the question; only Police sees the rise button.
   - After Police rises, Police sees exactly two hidden players and picks one.
   - The pick is visible to all; roles stay hidden until the final reveal.
4. **Round result**
   - The score sheet adds the round exactly once.
   - If Police is wrong, the message names the **actual** Chor/Dakat who escaped.
   - Only the host can advance; guests see a waiting message.
5. **Match end**
   - Equal totals are broken by Babu count; equal totals + Babu counts share a rank (1, 2, 2, 4).
   - Joint winners are labelled correctly; last place is labelled only once.
   - The notebook has no room code; PNG/PDF/native share work and contain no code.
6. **Leaving and abandonment**
   - Lobby guest leaves: seat frees, others stay.
   - Lobby host leaves: room closes for everyone.
   - In-game leave: room is erased for everyone; other screens show “Room closed”.
   - Disconnect one player: pause overlay + 90-second grace; reconnect resumes and deadlines shift.
   - Let the grace expire: match ends as abandoned, partial scores are shown, a 120-second cleanup warning appears, and the room disappears after cron cleanup.
   - Finish a match normally: the final screen shows the same 120-second cleanup warning; after the window and one cron tick, the room and every child row are gone.
   - Explicit leave (lobby host or in-game player) erases the room immediately; other screens show “Room closed”.
7. **Language & accessibility**
   - Toggle Bengali/English; every visible string changes and layout stays intact.
   - Reduced motion disables animations.
   - Modals trap focus, close on Escape/backdrop, and restore focus.
   - Score sheet and private slip remain readable at 320px width.

## SQL verification queries

Apply `001 → 002 → 004 → 005 → 006`, enable pg_cron, then run:

```sql
select extname from pg_extension where extname = 'pg_cron';

select jobid, jobname, schedule, command, active
  from cron.job where jobname = 'chor-police-cleanup-rooms';

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'rounds'
   and column_name in ('babu_risen_at', 'police_called_at', 'police_risen_at');

-- Must return no rows: no client policy and no client grant on secrets.
select tablename, policyname from pg_policies
 where schemaname = 'public' and tablename in ('rounds', 'round_roles');

select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'authenticated'
   and table_name in ('rounds', 'round_roles');

select public.cleanup_rooms();  -- manual cleanup; safe to run

-- Replace CODE; after the 120s window + one cron tick this must return 0.
select count(*) from public.rooms where code = 'CODE';

-- Every room-owned FK must cascade (confdeltype = 'c').
select conrelid::regclass as table_name, confdeltype
  from pg_constraint
 where confrelid = 'public.rooms'::regclass
   and contype = 'f';
```

## Environment notes

- `004` (manual flow), `005` (scheduled cleanup), and `006` (end-of-room
  deletion) must be applied to the hosted project; the client falls back to the
  automatic reveal phases until 004.
- Enable anonymous sign-ins and pg_cron in the Supabase dashboard.
- The SQL tests are static; `psql`/Docker are not required.
