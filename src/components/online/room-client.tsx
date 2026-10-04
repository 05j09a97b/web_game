"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChallengeResponse, CardType } from "@/lib/game/types";
import { onlineRequest } from "@/lib/online/api-client";
import type { RoomSnapshot } from "@/lib/online/types";
import { ensureAnonymousSession, getBrowserSupabase } from "@/lib/supabase/browser";

const CARD_DETAILS: Record<CardType, { name: string; english: string; color: string }> = {
  bug: { name: "แมลง", english: "BUG", color: "#d96631" },
  rat: { name: "หนู", english: "RAT", color: "#7259a8" },
  bat: { name: "ค้างคาว", english: "BAT", color: "#415d8c" },
  spider: { name: "แมงมุม", english: "SPIDER", color: "#394b49" },
  frog: { name: "กบ", english: "FROG", color: "#508355" },
  fly: { name: "แมลงวัน", english: "FLY", color: "#87933d" },
  scorpion: { name: "แมงป่อง", english: "SCORPION", color: "#c25138" },
  snake: { name: "งู", english: "SNAKE", color: "#438276" },
};

const CARD_TYPES = Object.keys(CARD_DETAILS) as CardType[];

type GameCommand =
  | { type: "select_card"; cardId: string }
  | { type: "select_target"; targetPlayerId: string }
  | { type: "select_claim"; claim: CardType }
  | { type: "respond_to_challenge"; response: ChallengeResponse }
  | { type: "resolve_challenge" }
  | { type: "finish_resolution" }
  | { type: "advance_turn" };

export default function RoomClient({ code }: { code: string }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteNickname, setInviteNickname] = useState("");

  const refresh = useCallback(async () => {
    const latest = await onlineRequest<RoomSnapshot>(`/api/rooms/${encodeURIComponent(code)}`);
    setSnapshot(latest);
    return latest;
  }, [code]);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    let channel: RealtimeChannel | null = null;
    const heartbeatOnReturn = () => {
      if (document.visibilityState === "visible") {
        void onlineRequest(`/api/rooms/${encodeURIComponent(code)}/heartbeat`, { method: "POST" }).catch(() => undefined);
      }
    };

    async function connect() {
      try {
        await ensureAnonymousSession();
        if (!mounted) return;
        await refresh();
        if (!mounted) return;

        const client = getBrowserSupabase();
        if (client) {
          channel = client
            .channel(`room:${code}`, { config: { private: true } })
            .on("broadcast", { event: "room_updated" }, () => void refresh())
            .subscribe();
        }
        interval = setInterval(() => void refresh().catch(() => undefined), 12_000);
        heartbeatInterval = setInterval(() => {
          void onlineRequest(`/api/rooms/${encodeURIComponent(code)}/heartbeat`, { method: "POST" }).catch(() => undefined);
        }, 18_000);
        document.addEventListener("visibilitychange", heartbeatOnReturn);
      } catch (error) {
        if (mounted) {
          const detail = error instanceof Error ? error.message : "เชื่อมต่อห้องไม่สำเร็จ";
          setMessage(detail);
          setNeedsJoin(detail.includes("คุณยังไม่ได้เข้าร่วมห้องนี้"));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void connect();
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", heartbeatOnReturn);
      const client = getBrowserSupabase();
      if (channel && client) void client.removeChannel(channel);
    };
  }, [code, refresh]);

  const allReady = useMemo(
    () => Boolean(snapshot && snapshot.players.length >= 2 && snapshot.players.every((player) => player.isReady && player.connected)),
    [snapshot],
  );

  async function updateRoom(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await onlineRequest<RoomSnapshot>(path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setSnapshot(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ ลองอีกครั้ง");
      if (error instanceof Error && error.message.includes("สถานะล่าสุด")) void refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(command: GameCommand) {
    if (!snapshot?.game || busy) return;
    await updateRoom(`/api/rooms/${encodeURIComponent(code)}/actions`, {
      ...command,
      expectedVersion: snapshot.game.version,
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("คัดลอกลิงก์ไม่ได้ คัดลอกรหัสห้องแทนได้เลย");
    }
  }

  async function joinFromInvite() {
    const nickname = inviteNickname.trim();
    if (nickname.length < 1 || nickname.length > 24) {
      setMessage("ชื่อผู้เล่นต้องมี 1–24 ตัวอักษร");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onlineRequest("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ action: "join", code, nickname }),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าร่วมห้องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="app-shell online-room-shell"><p className="room-loading">กำลังเปิดโต๊ะไพ่…</p></main>;
  }

  return (
    <main className="app-shell online-room-shell">
      <header className="site-header online-room-header">
        <Link className="brand" href="/" aria-label="กลับหน้าแรก">
          <span className="brand__mark" aria-hidden="true">✳</span> ไพ่แมลงป่วน
        </Link>
        <div className="online-room-header__right">
          <span className="online-tag"><span /> ออนไลน์</span>
          <Link className="text-button" href="/">ออกจากห้อง</Link>
        </div>
      </header>

      {!snapshot ? (
        <section className="room-error-card">
          <span className="setup-icon" aria-hidden="true">!</span>
          {needsJoin ? (
            <>
              <p className="setup-kicker">รหัสห้อง {code}</p>
              <h1>เพื่อนชวนมาเล่น</h1>
              <p>ใส่ชื่อเล่นเพื่อเข้าร่วมวงนี้ได้เลย</p>
              <label className="online-label room-invite-label" htmlFor="invite-nickname">ชื่อเล่น</label>
              <input
                id="invite-nickname"
                className="online-input"
                maxLength={24}
                placeholder="เช่น มะลิ"
                value={inviteNickname}
                onChange={(event) => setInviteNickname(event.target.value)}
              />
              {message && !message.includes("คุณยังไม่ได้เข้าร่วมห้องนี้") ? <p className="online-error" role="alert">{message}</p> : null}
              <button className="primary-button room-invite-submit" type="button" disabled={busy} onClick={() => void joinFromInvite()}>
                เข้าร่วมเล่น <span aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
              <h1>เข้าห้องนี้ไม่ได้</h1>
              <p>{message ?? "ไม่พบข้อมูลห้อง"}</p>
              <Link className="primary-button" href="/">กลับไปหน้าห้องเกม</Link>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="room-title-row">
            <div>
              <p className="eyebrow"><span className="eyebrow__line" /> {snapshot.room.status === "waiting" ? "ห้องรอผู้เล่น" : "โต๊ะกำลังเล่น"}</p>
              <h1>{snapshot.room.status === "waiting" ? "ชวนเพื่อนเข้าวง" : "จับตาไพ่ให้ดี"}</h1>
            </div>
            <button className="room-code-button" type="button" onClick={() => void copyLink()}>
              <span>รหัสห้อง</span><strong>{snapshot.room.code}</strong><small>{copied ? "คัดลอกลิงก์แล้ว ✓" : "แตะเพื่อคัดลอกลิงก์"}</small>
            </button>
          </div>

          {message ? <p className="online-error room-message" role="alert">{message}</p> : null}
          {snapshot.room.status === "waiting" ? (
            <section className="lobby-layout">
              <div className="lobby-board">
                <div className="lobby-board__heading">
                  <div><p className="setup-kicker">ผู้เล่นในห้อง</p><h2>{snapshot.players.length} <span>/ 8 คน</span></h2></div>
                  <span className="lobby-waiting"><i /> กำลังรอเริ่ม</span>
                </div>
                <div className="online-player-list">
                  {snapshot.players.map((player) => (
                    <article className="online-player-row" key={player.id}>
                      <span className="online-player-row__avatar">{player.nickname.slice(0, 1).toLocaleUpperCase()}</span>
                      <div className="online-player-row__identity">
                        <strong>{player.nickname}{player.id === snapshot.viewer.id ? <small>คุณ</small> : null}</strong>
                        <span>{player.isHost ? "เจ้าของห้อง" : "ผู้เล่น"}</span>
                      </div>
                      <span className={`ready-state${player.connected ? " ready-state--yes" : ""}`}>
                        {player.connected ? (player.isReady ? "พร้อมแล้ว" : "ออนไลน์") : "หลุดการเชื่อมต่อ"}
                      </span>
                    </article>
                  ))}
                  {snapshot.players.length < 2 ? (
                    <div className="lobby-invite-hint"><span aria-hidden="true">↗</span><p>ส่งลิงก์หรือรหัสห้องให้เพื่อนเข้ามาเล่นด้วยกัน</p></div>
                  ) : null}
                </div>
              </div>
              <aside className="lobby-controls">
                <p className="setup-kicker">ก่อนเริ่มเกม</p>
                <h2>พร้อมบลัฟ<br />กันหรือยัง?</h2>
                <p>ทุกคนกดพร้อมก่อน แล้วเจ้าของห้องเริ่มเกมได้เมื่อมีผู้เล่นอย่างน้อย 2 คน</p>
                <button
                  className={snapshot.viewer.isReady ? "secondary-button lobby-ready-button" : "primary-button lobby-ready-button"}
                  type="button"
                  disabled={busy}
                  onClick={() => void updateRoom(`/api/rooms/${encodeURIComponent(code)}/ready`, { ready: !snapshot.viewer.isReady })}
                >
                  {snapshot.viewer.isReady ? "ยกเลิกความพร้อม" : "พร้อมแล้ว!"}
                </button>
                {snapshot.viewer.isHost ? (
                  <button
                    className="start-game-button"
                    type="button"
                    disabled={busy || !allReady}
                    onClick={() => void updateRoom(`/api/rooms/${encodeURIComponent(code)}/start`)}
                  >
                    เริ่มเกม <span aria-hidden="true">→</span>
                  </button>
                ) : <p className="lobby-wait-note">รอเจ้าของห้องกดเริ่มเกม</p>}
                <button className="copy-link-button" type="button" onClick={() => void copyLink()}>
                  {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์ชวนเพื่อน"}
                </button>
              </aside>
            </section>
          ) : snapshot.game ? (
            <GameTable
              snapshot={snapshot}
              busy={busy}
              onAction={(command) => void submitAction(command)}
            />
          ) : <p className="room-loading">กำลังเตรียมไพ่…</p>}
          <footer className="landing-footer"><span>ไพ่แมลงป่วน</span><span>สถานะห้องอัปเดตอัตโนมัติ</span></footer>
        </>
      )}
    </main>
  );
}

function GameTable({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: RoomSnapshot;
  busy: boolean;
  onAction: (command: GameCommand) => void;
}) {
  const game = snapshot.game;
  if (!game) return null;
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const targetPlayer = game.pendingClaim
    ? game.players.find((player) => player.id === game.pendingClaim?.receiverId)
    : undefined;
  const nextPlayer = game.players.find((player) => player.id === game.nextPlayerId);
  const viewerIsCurrent = game.currentPlayerId === snapshot.viewer.id;
  const viewerIsReceiver = game.pendingClaim?.receiverId === snapshot.viewer.id;
  const viewerIsNext = game.nextPlayerId === snapshot.viewer.id;
  const phaseCopy: Record<string, string> = {
    select_card: viewerIsCurrent ? "เลือกไพ่หนึ่งใบจากมือ" : `รอ ${currentPlayer?.nickname ?? "ผู้เล่น"} เลือกไพ่`,
    select_target: viewerIsCurrent ? "เลือกคนที่จะส่งไพ่ให้" : `รอ ${currentPlayer?.nickname ?? "ผู้เล่น"} เลือกเป้าหมาย`,
    select_claim: viewerIsCurrent ? "บอกเพื่อนว่าไพ่เป็นตัวอะไร" : `รอ ${currentPlayer?.nickname ?? "ผู้เล่น"} ตั้งคำอ้าง`,
    waiting_response: viewerIsReceiver ? "คุณเชื่อคำอ้างนี้ไหม?" : `รอ ${targetPlayer?.nickname ?? "ผู้รับ"} ตัดสินใจ`,
    reveal: "เปิดไพ่ดูว่าใครจับบลัฟได้",
    resolve: "สรุปผลและรับไพ่ลงโทษ",
    next_turn: viewerIsNext ? "ถึงตาคุณแล้ว เริ่มตาถัดไปได้เลย" : `ตาถัดไปคือ ${nextPlayer?.nickname ?? "ผู้เล่น"}`,
    game_over: "จบเกมแล้ว",
  };
  const claim = game.pendingClaim;
  const resolution = game.lastResolution;
  const loser = game.gameOver?.loserPlayerId
    ? game.players.find((player) => player.id === game.gameOver?.loserPlayerId)
    : null;

  return (
    <section className="online-game" aria-label="กระดานเกมออนไลน์">
      <div className="online-game__topline">
        <div><p className="setup-kicker">รอบที่ {game.turnNumber}</p><h2>{phaseCopy[game.phase]}</h2></div>
        <span className="game-phase-pill">{game.phase.replaceAll("_", " ")}</span>
      </div>
      <div className="online-game__layout">
        <div className="online-felt">
          <div className="online-table-players">
            {game.players.map((player) => {
              const viewer = player.id === snapshot.viewer.id;
              const active = player.id === game.currentPlayerId || player.id === game.nextPlayerId;
              return (
                <article className={`online-seat${active ? " online-seat--active" : ""}${viewer ? " online-seat--you" : ""}`} key={player.id}>
                  <span className="online-seat__avatar">{player.nickname.slice(0, 1).toLocaleUpperCase()}</span>
                  <strong>{player.nickname}{viewer ? <small>คุณ</small> : null}</strong>
                  <span className="online-seat__count">ไพ่ในมือ {player.cardCount} ใบ</span>
                  {!player.connected ? <span className="online-seat__offline">ออฟไลน์</span> : null}
                  {player.penaltyCards.length > 0 ? (
                    <div className="online-seat__penalties" aria-label={`ไพ่ลงโทษ ${player.penaltyCards.length} ใบ`}>
                      {player.penaltyCards.map((card) => <i key={card.id} style={{ background: CARD_DETAILS[card.type].color }} title={CARD_DETAILS[card.type].name} />)}
                    </div>
                  ) : null}
                  {player.id === game.currentPlayerId ? <span className="online-seat__turn">ตานี้</span> : null}
                </article>
              );
            })}
          </div>

          <div className="online-center-card">
            {game.phase === "game_over" ? (
              <>
                <span className="online-center-card__emoji">🏁</span>
                <strong>{loser ? `${loser.nickname} แพ้แล้ว` : "ไม่มีไพ่ให้เล่นต่อ"}</strong>
                <span>{game.gameOver?.reason === "four_of_a_kind" ? `ได้ไพ่${CARD_DETAILS[game.gameOver.cardType!].name}ครบ 4 ใบ` : "เกมจบลง"}</span>
              </>
            ) : claim ? (
              <>
                {claim.revealedCardType ? (
                  <CardArtwork type={claim.revealedCardType} />
                ) : <div className="online-hidden-card"><span>✳</span></div>}
                <strong>{snapshot.players.find((player) => player.id === claim.senderId)?.nickname} ส่งไพ่ให้ {targetPlayer?.nickname}</strong>
                <span>อ้างว่าเป็น <b>{CARD_DETAILS[claim.claim].name}</b></span>
                {claim.response ? <small>เลือกตอบว่า {claim.response === "true" ? "จริง" : "บลัฟ"}</small> : null}
              </>
            ) : (
              <>
                <div className="online-hidden-card"><span>✳</span></div>
                <strong>ไพ่คว่ำหน้าอยู่กลางโต๊ะ</strong>
                <span>{snapshot.room.code}</span>
              </>
            )}
          </div>
        </div>

        <aside className="online-action-panel">
          {game.phase === "select_card" && viewerIsCurrent ? (
            <>
              <p className="setup-kicker">ไพ่ในมือคุณ</p>
              <div className="online-hand">
                {game.ownHand.map((card) => (
                  <button className="online-hand-card" key={card.id} type="button" disabled={busy} onClick={() => onAction({ type: "select_card", cardId: card.id })}>
                    <CardArtwork type={card.type} />
                    <span>{CARD_DETAILS[card.type].name}</span>
                  </button>
                ))}
              </div>
              <p className="online-action-hint">เลือกหนึ่งใบ แล้วค่อยเลือกคนรับ</p>
            </>
          ) : null}

          {game.phase === "select_target" && viewerIsCurrent ? (
            <>
              <p className="setup-kicker">ส่งไพ่ให้ใครดี?</p>
              <div className="online-choice-list">
                {game.players.filter((player) => player.id !== snapshot.viewer.id).map((player) => (
                  <button key={player.id} type="button" disabled={busy} onClick={() => onAction({ type: "select_target", targetPlayerId: player.id })}>
                    ส่งให้ <strong>{player.nickname}</strong><span>→</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {game.phase === "select_claim" && viewerIsCurrent ? (
            <>
              <p className="setup-kicker">อ้างว่าเป็นตัวอะไร?</p>
              <div className="online-claim-grid">
                {CARD_TYPES.map((type) => (
                  <button key={type} type="button" disabled={busy} onClick={() => onAction({ type: "select_claim", claim: type })}>
                    <i style={{ background: CARD_DETAILS[type].color }} />{CARD_DETAILS[type].name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {game.phase === "waiting_response" && viewerIsReceiver ? (
            <>
              <p className="setup-kicker">ตัดสินใจให้ดี</p>
              <h3>เขาพูดจริงหรือบลัฟ?</h3>
              <button className="truth-button" type="button" disabled={busy} onClick={() => onAction({ type: "respond_to_challenge", response: "true" })}>จริง!</button>
              <button className="bluff-button" type="button" disabled={busy} onClick={() => onAction({ type: "respond_to_challenge", response: "bluff" })}>บลัฟแน่!</button>
            </>
          ) : null}

          {game.phase === "reveal" && viewerIsReceiver ? (
            <>
              <p className="setup-kicker">เห็นไพ่แล้ว</p><h3>พร้อมรู้ผลหรือยัง?</h3>
              <button className="primary-button online-action" type="button" disabled={busy} onClick={() => onAction({ type: "resolve_challenge" })}>เปิดผลตานี้</button>
            </>
          ) : null}

          {game.phase === "resolve" && resolution ? (
            <>
              <p className="setup-kicker">ผลการจับบลัฟ</p>
              <h3>{resolution.responseWasCorrect ? "จับคำอ้างได้!" : "โดนหลอกเข้าแล้ว"}</h3>
              <p className="online-resolution-copy">
                ไพ่{CARD_DETAILS[resolution.actualCard.type].name} ลงโทษ {game.players.find((player) => player.id === resolution.penaltyOwnerId)?.nickname}
              </p>
              {viewerIsReceiver ? (
                <button className="primary-button online-action" type="button" disabled={busy} onClick={() => onAction({ type: "finish_resolution" })}>ไปตาถัดไป</button>
              ) : <p className="online-action-hint">รอผู้รับไพ่ไปตาถัดไป</p>}
            </>
          ) : null}

          {game.phase === "next_turn" ? (
            viewerIsNext ? (
              <button className="primary-button online-action" type="button" disabled={busy} onClick={() => onAction({ type: "advance_turn" })}>เริ่มตาของฉัน</button>
            ) : <p className="online-action-hint">รอ {nextPlayer?.nickname ?? "ผู้เล่นคนถัดไป"} เริ่มตา</p>
          ) : null}

          {game.phase === "game_over" ? <Link className="secondary-button online-back-home" href="/">กลับหน้าแรก</Link> : null}

          {!viewerIsCurrent && !viewerIsReceiver && !viewerIsNext && !["resolve", "game_over"].includes(game.phase) ? (
            <div className="online-waiting-note"><span className="waiting-pulse" /><p>ตาคุณมาถึงเมื่อไร เกมจะแสดงปุ่มให้เล่นตรงนี้</p></div>
          ) : null}
          <div className="online-own-hand-summary">
            <span>มือของ {snapshot.viewer.nickname}</span><strong>{game.ownHand.length} ใบ</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CardArtwork({ type }: { type: CardType }) {
  return (
    <span className="online-card-art" style={{ "--card-accent": CARD_DETAILS[type].color } as React.CSSProperties}>
      <Image src={`/images/cards/${type}.png`} alt={CARD_DETAILS[type].name} width={512} height={512} />
      <b>{CARD_DETAILS[type].english}</b>
    </span>
  );
}
