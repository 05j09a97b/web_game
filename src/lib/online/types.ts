import type { PlayerGameView, PlayerId } from "@/lib/game/types";

export interface RoomPlayerView {
  id: PlayerId;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  seatNumber: number;
}

export interface RoomSnapshot {
  room: {
    id: string;
    code: string;
    status: "waiting" | "playing" | "finished";
  };
  viewer: {
    id: PlayerId;
    nickname: string;
    isHost: boolean;
    isReady: boolean;
  };
  players: RoomPlayerView[];
  game: PlayerGameView | null;
}
