# ไพ่แมลงป่วน (Bluff Card Web Game)

A browser based bluffing card game for 2–8 players. Players create a room, share its six-character code, and play together in real time. Each player's hand is kept in a private server-side game snapshot; Realtime broadcasts only tell room members to refresh their own safe view.

## Architecture

- **Game domain:** `src/lib/game` contains the standalone TypeScript rules, state machine, and player-specific view mapper. It has no React or Supabase dependency.
- **Web client:** Next.js App Router renders the room and subscribes to a private Supabase Realtime Broadcast channel. The browser only sends actions and receives a view sanitized for its authenticated player.
- **Game service:** Next.js Route Handlers verify the Supabase Auth token, map it to the room's player record, apply the domain engine, then commit using a version compare-and-swap.
- **Persistence:** PostgreSQL stores public room/lobby metadata and an inaccessible `private.game_states` snapshot. SQL RPCs used by the server are executable only by Supabase's trusted server role; clients have no write grants.
- **Realtime:** PostgreSQL triggers publish a minimal `room_updated` event to `room:{code}`. RLS on `realtime.messages` checks membership. Clients fetch updated state through their authenticated Route Handler.
- **Reconnect:** Anonymous Auth sessions persist in the browser. Reloading `/room/CODE` reloads the same membership and private hand. A 45-second heartbeat drives the connected indicator.

The former same-device pass-and-play version remains available at `/local`.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project

## Supabase setup

1. In Supabase Authentication settings, enable **Anonymous sign-ins**.
2. Copy `.env.example` to `.env.local` and fill in the project URL, publishable (or legacy anon) key, and server-only service-role key.
3. Install the Supabase CLI when needed through `npx`; sign in and link the project:

   ```bash
   npx supabase@latest login
   npx supabase@latest link --project-ref mlvplcmpvqmvjxbumjij
   npx supabase@latest db push --linked
   ```

   The project reference above is the one previously selected for this game. `db push` applies both migrations in `supabase/migrations`.
4. Run the verification query in `supabase/verify_online_rooms.sql` from the Supabase SQL Editor after the migration is applied.

The database does not store the Vercel secret. Never put `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable or browser code.

## Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | Current publishable key; the legacy anon key is accepted as a fallback |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Optional legacy anon-key fallback |
| `SUPABASE_SECRET_KEY` | Server only | Current server key for trusted Route Handlers; keep it private |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Optional legacy fallback for trusted Route Handlers |

## Local development

In PowerShell, create the environment file with `Copy-Item .env.example .env.local`, then fill in the Supabase values. Run:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Create a room in one browser window, then open the invite URL in another browser or private window, enter a nickname, and join. Both players must mark themselves ready before the host can start.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Game flow

1. The current player picks a card, a recipient, and a claim.
2. Only the recipient chooses whether the claim is true or a bluff.
3. The card is revealed, the server engine assigns the penalty, and the next turn begins.
4. Four face-up cards of one type ends the game for that player.

There are eight animal types and eight copies of each, for 64 cards total. The whole deck is dealt as evenly as possible; with four players, each receives 16 cards. The host starts the game after all players in the room are ready. Every action carries a game version; stale or out-of-phase actions are rejected.

## Vercel deployment

1. Import the repository into Vercel and select the Next.js framework preset.
2. Add all required environment variables above to Vercel **Project Settings → Environment Variables** for Development, Preview, and Production as appropriate.
3. Keep the Supabase secret/service-role key server-only. Redeploy after changing environment variables.
4. In Supabase Authentication settings, allow the deployed Vercel domain in the site's URL configuration if the project requires an allowed site URL.
5. Confirm anonymous sign-ins are enabled and that both SQL migrations have been applied to the same Supabase project.

## Current implementation boundaries

- Rooms, ready state, server-authoritative game actions, private hands, reconnect, and lobby/game invalidation use Supabase.
- A player who clears browser storage loses their anonymous identity; anonymous accounts cannot be recovered without adding account linking.
- The legacy `public.cards` table remains in the initial schema, but online private snapshots are canonical and are not exposed through direct client table reads.
- Apply both migrations to each Supabase project before online play works. No database credentials are stored in this repository.
