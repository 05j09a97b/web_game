-- Server-authoritative room operations and private game snapshots.
-- Client Realtime messages contain invalidation notices only; every client fetches
-- its own sanitized view from the Next.js server.

create table private.game_states (
  game_id uuid primary key references public.games(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table private.game_states enable row level security;
revoke all on table private.game_states from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.game_states to service_role;

-- Keep Auth user IDs away from other room members while retaining public lobby reads.
revoke select on table public.players from authenticated;
grant select (
  id, room_id, nickname, is_host, is_ready, is_connected, seat_number, created_at, last_seen_at
) on table public.players to authenticated;

create function public.create_room_for_user(p_user_id uuid, p_nickname text, p_code text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  new_room_id uuid := pg_catalog.gen_random_uuid();
  new_player_id uuid := pg_catalog.gen_random_uuid();
  clean_nickname text := pg_catalog.btrim(p_nickname);
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if pg_catalog.char_length(clean_nickname) not between 1 and 24 then
    raise exception 'INVALID_NICKNAME';
  end if;
  if p_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  insert into public.rooms (id, code, host_player_id)
  values (new_room_id, p_code, new_player_id);

  insert into public.players (
    id, room_id, user_id, nickname, is_host, is_ready, is_connected, seat_number
  ) values (
    new_player_id, new_room_id, p_user_id, clean_nickname, true, false, true, 0
  );

  return pg_catalog.jsonb_build_object(
    'roomId', new_room_id,
    'roomCode', p_code,
    'playerId', new_player_id
  );
end;
$function$;

create function public.join_room_for_user(p_user_id uuid, p_nickname text, p_code text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  target_room public.rooms%rowtype;
  existing_player public.players%rowtype;
  next_seat integer;
  player_total integer;
  new_player_id uuid := pg_catalog.gen_random_uuid();
  clean_nickname text := pg_catalog.btrim(p_nickname);
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if pg_catalog.char_length(clean_nickname) not between 1 and 24 then
    raise exception 'INVALID_NICKNAME';
  end if;

  select r.* into target_room
  from public.rooms as r
  where r.code = p_code
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select p.* into existing_player
  from public.players as p
  where p.room_id = target_room.id and p.user_id = p_user_id;

  if found then
    update public.players
    set is_connected = true, last_seen_at = pg_catalog.now()
    where id = existing_player.id;

    return pg_catalog.jsonb_build_object(
      'roomId', target_room.id,
      'roomCode', target_room.code,
      'playerId', existing_player.id
    );
  end if;

  if target_room.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  select coalesce(pg_catalog.max(p.seat_number) + 1, 0), pg_catalog.count(*)::integer
  into next_seat, player_total
  from public.players as p
  where p.room_id = target_room.id;

  if player_total >= 8 then
    raise exception 'ROOM_FULL';
  end if;

  insert into public.players (
    id, room_id, user_id, nickname, is_host, is_ready, is_connected, seat_number
  ) values (
    new_player_id, target_room.id, p_user_id, clean_nickname, false, false, true, next_seat
  );

  return pg_catalog.jsonb_build_object(
    'roomId', target_room.id,
    'roomCode', target_room.code,
    'playerId', new_player_id
  );
end;
$function$;

create function public.set_room_ready(p_room_id uuid, p_user_id uuid, p_ready boolean)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  changed_rows integer;
begin
  update public.players as p
  set is_ready = p_ready, last_seen_at = pg_catalog.now(), is_connected = true
  where p.room_id = p_room_id
    and p.user_id = p_user_id
    and exists (
      select 1 from public.rooms as r
      where r.id = p.room_id and r.status = 'waiting'
    );

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'PLAYER_NOT_IN_WAITING_ROOM';
  end if;
  return true;
end;
$function$;

create function public.touch_room_presence(p_room_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  changed_rows integer;
begin
  update public.players as p
  set last_seen_at = pg_catalog.now(), is_connected = true
  where p.room_id = p_room_id and p.user_id = p_user_id;

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;
  return true;
end;
$function$;

create function public.start_room_game(
  p_room_id uuid,
  p_user_id uuid,
  p_game_id uuid,
  p_state jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  target_room public.rooms%rowtype;
  player_total integer;
  ready_total integer;
begin
  select r.* into target_room
  from public.rooms as r
  where r.id = p_room_id
  for update;

  if not found or target_room.status <> 'waiting' then
    raise exception 'ROOM_NOT_WAITING';
  end if;

  if not exists (
    select 1 from public.players as p
    where p.room_id = p_room_id and p.user_id = p_user_id and p.is_host
  ) then
    raise exception 'NOT_ROOM_HOST';
  end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(*) filter (
           where p.is_ready and p.last_seen_at > pg_catalog.now() - interval '45 seconds'
         )::integer
  into player_total, ready_total
  from public.players as p
  where p.room_id = p_room_id;

  if player_total < 2 or player_total > 8 or ready_total <> player_total then
    raise exception 'PLAYERS_NOT_READY';
  end if;
  if pg_catalog.jsonb_typeof(p_state) <> 'object'
      or p_state->>'id' <> p_game_id::text
      or p_state->>'hostPlayerId' <> target_room.host_player_id::text
      or p_state->>'phase' <> 'select_card'
      or (p_state->>'version')::integer <> 1 then
    raise exception 'INVALID_INITIAL_GAME_STATE';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_state->'players')) <> player_total then
    raise exception 'INITIAL_GAME_PLAYERS_MISMATCH';
  end if;
  if (
    select pg_catalog.count(distinct initial_player.value->>'id')
    from pg_catalog.jsonb_array_elements(p_state->'players') as initial_player(value)
  ) <> player_total then
    raise exception 'INITIAL_GAME_PLAYERS_MISMATCH';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_state->'players') as initial_player(value)
    left join public.players as p
      on p.id = (initial_player.value->>'id')::uuid and p.room_id = p_room_id
    where p.id is null
  ) then
    raise exception 'INITIAL_GAME_PLAYERS_MISMATCH';
  end if;

  insert into public.games (
    id, room_id, status, current_player_id, phase, turn_number, version, started_at
  ) values (
    p_game_id,
    p_room_id,
    'playing',
    (p_state->>'currentPlayerId')::uuid,
    p_state->>'phase',
    (p_state->>'turnNumber')::integer,
    (p_state->>'version')::integer,
    pg_catalog.now()
  );

  insert into private.game_states (game_id, state)
  values (p_game_id, p_state);

  insert into public.game_actions (game_id, player_id, action_type, payload)
  values (p_game_id, target_room.host_player_id, 'start_game', '{}'::jsonb);

  update public.rooms set status = 'playing' where id = p_room_id;
  return true;
end;
$function$;

create function public.load_private_game_state(p_game_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select s.state from private.game_states as s where s.game_id = p_game_id;
$function$;

create function public.commit_game_action(
  p_game_id uuid,
  p_room_id uuid,
  p_player_id uuid,
  p_expected_version integer,
  p_next_state jsonb,
  p_action_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  next_phase text := p_next_state->>'phase';
  update_count integer;
begin
  if p_action_type not in (
    'select_card', 'select_target', 'select_claim', 'respond_to_challenge',
    'resolve_challenge', 'finish_resolution', 'advance_turn'
  ) then
    raise exception 'INVALID_ACTION_TYPE';
  end if;
  if pg_catalog.jsonb_typeof(p_next_state) <> 'object'
      or p_next_state->>'id' <> p_game_id::text
      or (p_next_state->>'version')::integer <> p_expected_version + 1 then
    raise exception 'INVALID_NEXT_GAME_STATE';
  end if;
  if not exists (
    select 1 from public.players as p
    where p.id = p_player_id and p.room_id = p_room_id
  ) then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;

  update public.games as g
  set version = p_expected_version + 1,
      phase = next_phase,
      turn_number = (p_next_state->>'turnNumber')::integer,
      current_player_id = nullif(p_next_state->>'currentPlayerId', '')::uuid,
      status = case when next_phase = 'game_over' then 'finished' else 'playing' end,
      finished_at = case when next_phase = 'game_over' then pg_catalog.now() else null end
  where g.id = p_game_id
    and g.room_id = p_room_id
    and g.version = p_expected_version
    and g.status = 'playing';

  get diagnostics update_count = row_count;
  if update_count <> 1 then
    return false;
  end if;

  update private.game_states
  set state = p_next_state, updated_at = pg_catalog.now()
  where game_id = p_game_id;

  if not found then
    raise exception 'PRIVATE_GAME_STATE_NOT_FOUND';
  end if;

  insert into public.game_actions (game_id, player_id, action_type, payload)
  values (p_game_id, p_player_id, p_action_type, coalesce(p_payload, '{}'::jsonb));

  if next_phase = 'game_over' then
    update public.rooms set status = 'finished' where id = p_room_id;
  end if;
  return true;
end;
$function$;

create function private.can_access_realtime_topic(target_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.players as p
    join public.rooms as r on r.id = p.room_id
    where p.user_id = (select auth.uid())
      and ('room:' || r.code) = target_topic
  );
$function$;

create function private.broadcast_room_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_room_id uuid;
  target_code text;
begin
  if tg_table_name = 'rooms' then
    target_code := new.code;
  else
    target_room_id := new.room_id;
    select r.code into target_code from public.rooms as r where r.id = target_room_id;
  end if;

  if target_code is not null then
    perform realtime.send(
      pg_catalog.jsonb_build_object('kind', 'room_updated'),
      'room_updated',
      'room:' || target_code,
      true
    );
  end if;
  return null;
end;
$function$;

revoke all on function public.create_room_for_user(uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_room_for_user(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_room_ready(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.touch_room_presence(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_room_game(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.load_private_game_state(uuid) from public, anon, authenticated;
revoke all on function public.commit_game_action(uuid, uuid, uuid, integer, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_room_for_user(uuid, text, text) to service_role;
grant execute on function public.join_room_for_user(uuid, text, text) to service_role;
grant execute on function public.set_room_ready(uuid, uuid, boolean) to service_role;
grant execute on function public.touch_room_presence(uuid, uuid) to service_role;
grant execute on function public.start_room_game(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.load_private_game_state(uuid) to service_role;
grant execute on function public.commit_game_action(uuid, uuid, uuid, integer, jsonb, text, jsonb)
  to service_role;

revoke all on function private.can_access_realtime_topic(text) from public, anon, authenticated;
revoke all on function private.broadcast_room_update() from public, anon, authenticated;
grant execute on function private.can_access_realtime_topic(text) to authenticated;

create trigger rooms_broadcast_insert
  after insert on public.rooms
  for each row execute function private.broadcast_room_update();

create trigger rooms_broadcast_update
  after update of status on public.rooms
  for each row execute function private.broadcast_room_update();

create trigger players_broadcast_insert
  after insert on public.players
  for each row execute function private.broadcast_room_update();

create trigger players_broadcast_update
  after update of nickname, is_ready, is_host on public.players
  for each row execute function private.broadcast_room_update();

create trigger games_broadcast_update
  after update of version, phase on public.games
  for each row execute function private.broadcast_room_update();

create policy room_members_can_receive_private_broadcasts
  on realtime.messages for select to authenticated
  using ((select private.can_access_realtime_topic((select realtime.topic()))));
