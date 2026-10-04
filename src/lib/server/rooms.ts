import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { applyGameAction, createWaitingGame, createPlayerGameView, type GameState } from "@/lib/game";
import { parseClientGameAction } from "@/lib/online/action-parser";
import type { RoomSnapshot } from "@/lib/online/types";
import { ApiError, getAdminSupabase, safeRpcError } from "@/lib/server/supabase";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RoomRow {
  id: string;
  code: string;
  status: RoomSnapshot["room"]["status"];
  host_player_id: string;
}

interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string | null;
  nickname: string;
  is_host: boolean;
  is_ready: boolean;
  is_connected: boolean;
  seat_number: number;
  last_seen_at: string;
}

async function getRoomByCode(code: string): Promise<RoomRow> {
  const { data, error } = await getAdminSupabase()
    .from("rooms")
    .select("id, code, status, host_player_id")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new ApiError(500, "โหลดข้อมูลห้องไม่สำเร็จ");
  if (!data) throw new ApiError(404, "ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง");
  return data as RoomRow;
}

async function getPlayer(roomId: string, userId: string): Promise<PlayerRow> {
  const { data, error } = await getAdminSupabase()
    .from("players")
    .select("id, room_id, user_id, nickname, is_host, is_ready, is_connected, seat_number, last_seen_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(500, "ตรวจสอบสิทธิ์ผู้เล่นไม่สำเร็จ");
  if (!data) throw new ApiError(403, "คุณยังไม่ได้เข้าร่วมห้องนี้ กลับไปกรอกรหัสห้องก่อน");
  return data as PlayerRow;
}

async function getRoomPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await getAdminSupabase()
    .from("players")
    .select("id, room_id, user_id, nickname, is_host, is_ready, is_connected, seat_number, last_seen_at")
    .eq("room_id", roomId)
    .order("seat_number", { ascending: true });
  if (error) throw new ApiError(500, "โหลดรายชื่อผู้เล่นไม่สำเร็จ");
  return (data ?? []) as PlayerRow[];
}

async function getLatestGameId(roomId: string): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from("games")
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(500, "โหลดเกมในห้องไม่สำเร็จ");
  return data?.id ?? null;
}

async function loadGameState(gameId: string): Promise<GameState> {
  const { data, error } = await getAdminSupabase().rpc("load_private_game_state", {
    p_game_id: gameId,
  });
  if (error || !data) throw new ApiError(500, "โหลดสถานะเกมไม่สำเร็จ");
  return data as GameState;
}

export async function createRoom(nickname: string, userId: string) {
  const admin = getAdminSupabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const { data, error } = await admin.rpc("create_room_for_user", {
      p_user_id: userId,
      p_nickname: nickname,
      p_code: code,
    });
    if (!error) return data as { roomId: string; roomCode: string; playerId: string };
    if (error.code !== "23505") throw safeRpcError(error);
  }
  throw new ApiError(503, "สร้างรหัสห้องไม่สำเร็จ ลองอีกครั้ง");
}

export async function joinRoom(code: string, nickname: string, userId: string) {
  const { data, error } = await getAdminSupabase().rpc("join_room_for_user", {
    p_user_id: userId,
    p_nickname: nickname,
    p_code: code,
  });
  if (error) throw safeRpcError(error);
  return data as { roomId: string; roomCode: string; playerId: string };
}

export async function getRoomSnapshot(code: string, userId: string): Promise<RoomSnapshot> {
  const room = await getRoomByCode(code);
  const [viewer, players] = await Promise.all([
    getPlayer(room.id, userId),
    getRoomPlayers(room.id),
  ]);
  let game: RoomSnapshot["game"] = null;
  const gameId = await getLatestGameId(room.id);
  if (gameId) {
    const state = await loadGameState(gameId);
    game = createPlayerGameView(state, viewer.id);
    if (!game) throw new ApiError(500, "ผู้เล่นไม่อยู่ในสถานะเกมนี้");
    const connectedById = new Map(players.map((player) => [player.id, isRecentlySeen(player.last_seen_at)]));
    game = {
      ...game,
      players: game.players.map((player) => ({
        ...player,
        connected: connectedById.get(player.id) ?? false,
      })),
    };
  }

  return {
    room: { id: room.id, code: room.code, status: room.status },
    viewer: {
      id: viewer.id,
      nickname: viewer.nickname,
      isHost: viewer.is_host,
      isReady: viewer.is_ready,
    },
    players: players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.is_host,
      isReady: player.is_ready,
      connected: isRecentlySeen(player.last_seen_at),
      seatNumber: player.seat_number,
    })),
    game,
  };
}

export async function setPlayerReady(code: string, userId: string, ready: boolean) {
  const room = await getRoomByCode(code);
  const { error } = await getAdminSupabase().rpc("set_room_ready", {
    p_room_id: room.id,
    p_user_id: userId,
    p_ready: ready,
  });
  if (error) throw safeRpcError(error);
  return getRoomSnapshot(code, userId);
}

export async function touchRoomPresence(code: string, userId: string) {
  const room = await getRoomByCode(code);
  const { error } = await getAdminSupabase().rpc("touch_room_presence", {
    p_room_id: room.id,
    p_user_id: userId,
  });
  if (error) throw safeRpcError(error);
}

export async function startRoomGame(code: string, userId: string): Promise<RoomSnapshot> {
  const room = await getRoomByCode(code);
  const host = await getPlayer(room.id, userId);
  const players = await getRoomPlayers(room.id);
  const gameId = randomUUID();
  const waiting = createWaitingGame(
    players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      connected: player.is_connected,
    })),
    { gameId, hostPlayerId: host.id },
  );
  const started = applyGameAction(
    waiting,
    { type: "start_game", playerId: host.id, expectedVersion: waiting.version },
    { random: () => randomInt(0, 2 ** 32) / 2 ** 32 },
  );
  if (!started.ok) throw new ApiError(409, started.error.message);

  const { data, error } = await getAdminSupabase().rpc("start_room_game", {
    p_room_id: room.id,
    p_user_id: userId,
    p_game_id: gameId,
    p_state: started.nextState,
  });
  if (error || !data) throw error ? safeRpcError(error) : new ApiError(409, "เริ่มเกมไม่สำเร็จ");
  return getRoomSnapshot(code, userId);
}

export async function applyRoomGameAction(
  code: string,
  userId: string,
  payload: unknown,
): Promise<RoomSnapshot> {
  const room = await getRoomByCode(code);
  const player = await getPlayer(room.id, userId);
  const gameId = await getLatestGameId(room.id);
  if (!gameId) throw new ApiError(409, "เกมยังไม่เริ่ม");
  const state = await loadGameState(gameId);
  const action = parseClientGameAction(payload, player.id);
  if (!action) throw new ApiError(400, "คำสั่งเกมไม่ถูกต้อง");

  const result = applyGameAction(state, action);
  if (!result.ok) {
    const messages: Record<string, string> = {
      stale_action: "เกมมีการเปลี่ยนแปลงแล้ว กำลังโหลดสถานะล่าสุดให้",
      invalid_phase: "ตอนนี้ยังทำขั้นตอนนี้ไม่ได้",
      player_not_found: "ไม่พบผู้เล่นคนนี้ในเกม",
      not_host: "เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้",
      not_your_turn: "ยังไม่ถึงตาของคุณ",
      card_not_owned: "ไพ่ใบนี้ไม่ได้อยู่ในมือคุณแล้ว",
      invalid_target: "เลือกผู้เล่นคนอื่นในห้อง",
      invalid_claim: "คำอ้างนี้ไม่ใช่ชนิดไพ่ที่รองรับ",
      game_not_startable: "เกมนี้ยังเริ่มไม่ได้",
      invalid_response: "คำตอบต้องเป็นจริงหรือบลัฟ",
    };
    throw new ApiError(
      result.error.code === "stale_action" ? 409 : 400,
      messages[result.error.code] ?? "คำสั่งเกมไม่ถูกต้อง",
    );
  }

  const { data, error } = await getAdminSupabase().rpc("commit_game_action", {
    p_game_id: gameId,
    p_room_id: room.id,
    p_player_id: player.id,
    p_expected_version: state.version,
    p_next_state: result.nextState,
    p_action_type: action.type,
    p_payload: { ...action, playerId: undefined },
  });
  if (error) throw safeRpcError(error);
  if (!data) throw new ApiError(409, "มีผู้เล่นส่งคำสั่งก่อนหน้าแล้ว โหลดสถานะใหม่ก่อนเล่นต่อ");
  return getRoomSnapshot(code, userId);
}

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join("");
}

function isRecentlySeen(lastSeenAt: string): boolean {
  const timestamp = Date.parse(lastSeenAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 45_000;
}
