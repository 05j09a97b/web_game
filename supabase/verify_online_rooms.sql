-- Run in the Supabase SQL Editor after applying the migrations.
select
  to_regclass('private.game_states') is not null as private_state_table_exists,
  has_table_privilege('authenticated', 'private.game_states', 'SELECT')
    as authenticated_can_read_private_table,
  has_column_privilege('authenticated', 'public.players', 'user_id', 'SELECT')
    as authenticated_can_read_player_user_ids,
  has_function_privilege('authenticated', 'public.create_room_for_user(uuid,text,text)', 'EXECUTE')
    as authenticated_can_create_room,
  has_function_privilege('service_role', 'public.create_room_for_user(uuid,text,text)', 'EXECUTE')
    as server_can_create_room,
  has_function_privilege('authenticated', 'public.load_private_game_state(uuid)', 'EXECUTE')
    as authenticated_can_read_private_state,
  has_function_privilege('service_role', 'public.load_private_game_state(uuid)', 'EXECUTE')
    as server_can_read_private_state,
  exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'room_members_can_receive_private_broadcasts'
  ) as realtime_membership_policy_exists;
