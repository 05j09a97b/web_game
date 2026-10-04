-- Phase 3: private game data and read-only client access.
-- Client writes stay disabled until trusted room/game actions are added in later phases.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(6) not null unique,
  host_player_id uuid not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nickname varchar(24) not null,
  is_host boolean not null default false,
  is_ready boolean not null default false,
  is_connected boolean not null default true,
  seat_number integer not null check (seat_number between 0 and 7),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint players_nickname_nonempty check (char_length(btrim(nickname)) between 1 and 24),
  constraint players_room_seat_unique unique (room_id, seat_number),
  constraint players_id_room_unique unique (id, room_id),
  constraint players_room_user_unique unique (room_id, user_id)
);

alter table public.rooms
  add constraint rooms_host_same_room_fkey
  foreign key (host_player_id, id)
  references public.players (id, room_id)
  deferrable initially deferred;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  current_player_id uuid,
  phase text not null default 'waiting'
    check (
      phase in (
        'waiting',
        'starting',
        'select_card',
        'select_target',
        'select_claim',
        'waiting_response',
        'reveal',
        'resolve',
        'next_turn',
        'game_over'
      )
    ),
  turn_number integer not null default 0 check (turn_number >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint games_id_room_unique unique (id, room_id),
  constraint games_current_player_same_room_fkey
    foreign key (current_player_id, room_id)
    references public.players (id, room_id)
    deferrable initially deferred
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  type text not null
    check (type in ('bug', 'rat', 'bat', 'spider', 'frog', 'fly', 'scorpion', 'snake')),
  owner_player_id uuid references public.players(id) on delete no action
    deferrable initially deferred,
  location text not null check (location in ('deck', 'hand', 'table', 'penalty')),
  is_face_up boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cards_location_visibility_check check (
    (location = 'deck' and owner_player_id is null and not is_face_up)
    or (location = 'hand' and owner_player_id is not null and not is_face_up)
    or (location = 'table' and owner_player_id is null)
    or (location = 'penalty' and owner_player_id is not null and is_face_up)
  )
);

create table public.game_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  action_type text not null
    check (
      action_type in (
        'start_game',
        'select_card',
        'select_target',
        'select_claim',
        'respond_to_challenge',
        'resolve_challenge',
        'finish_resolution',
        'advance_turn'
      )
    ),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index games_room_status_idx on public.games (room_id, status);
create index cards_game_location_owner_idx
  on public.cards (game_id, location, owner_player_id);
create index game_actions_game_created_idx on public.game_actions (game_id, created_at);

create function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.players as p
    where p.room_id = target_room_id
      and p.user_id = (select auth.uid())
  );
$function$;

create function private.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.games as g
    join public.players as p on p.room_id = g.room_id
    where g.id = target_game_id
      and p.user_id = (select auth.uid())
  );
$function$;

create function private.can_read_card(
  target_game_id uuid,
  target_owner_player_id uuid,
  target_location text,
  target_is_face_up boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (
      target_location = 'hand'
      and exists (
        select 1
        from public.players as p
        join public.games as g on g.room_id = p.room_id
        where p.id = target_owner_player_id
          and g.id = target_game_id
          and p.user_id = (select auth.uid())
      )
    )
    or (
      target_location in ('table', 'penalty')
      and target_is_face_up
      and private.is_game_member(target_game_id)
    );
$function$;

create function private.touch_room_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.is_room_member(uuid) from public, anon, authenticated;
revoke all on function private.is_game_member(uuid) from public, anon, authenticated;
revoke all on function private.can_read_card(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function private.touch_room_updated_at() from public, anon, authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.can_read_card(uuid, uuid, text, boolean) to authenticated;

create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function private.touch_room_updated_at();

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.cards enable row level security;
alter table public.game_actions enable row level security;

revoke all privileges on table
  public.rooms,
  public.players,
  public.games,
  public.cards,
  public.game_actions
from anon, authenticated;

grant select on public.rooms, public.players, public.games, public.cards to authenticated;
grant all privileges on table
  public.rooms,
  public.players,
  public.games,
  public.cards,
  public.game_actions
to service_role;

create policy room_members_can_read_room
  on public.rooms for select to authenticated
  using ((select private.is_room_member(id)));

create policy room_members_can_read_players
  on public.players for select to authenticated
  using ((select private.is_room_member(room_id)));

create policy room_members_can_read_game
  on public.games for select to authenticated
  using ((select private.is_room_member(room_id)));

create policy players_can_read_only_their_hand_and_visible_cards
  on public.cards for select to authenticated
  using (
    (select private.can_read_card(game_id, owner_player_id, location, is_face_up))
  );

-- game_actions deliberately has no client policy or client grant because payloads may contain
-- private action details. Trusted server-side game actions can write it in a later phase.
