"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  applyGameAction,
  createWaitingGame,
  type Card,
  type CardType,
  type GameAction,
  type GameState,
} from "@/lib/game";

type GameCommand<T extends GameAction = GameAction> = T extends GameAction
  ? Omit<T, "expectedVersion">
  : never;

const CARD_DETAILS: Record<CardType, { name: string; english: string; accent: string }> = {
  bug: { name: "แมลง", english: "BUG", accent: "#d96631" },
  rat: { name: "หนู", english: "RAT", accent: "#7259a8" },
  bat: { name: "ค้างคาว", english: "BAT", accent: "#415d8c" },
  spider: { name: "แมงมุม", english: "SPIDER", accent: "#394b49" },
  frog: { name: "กบ", english: "FROG", accent: "#508355" },
  fly: { name: "แมลงวัน", english: "FLY", accent: "#87933d" },
  scorpion: { name: "แมงป่อง", english: "SCORPION", accent: "#c25138" },
  snake: { name: "งู", english: "SNAKE", accent: "#438276" },
};

const ERROR_MESSAGES: Record<string, string> = {
  stale_action: "เกมเปลี่ยนไปแล้ว ลองทำรายการอีกครั้ง",
  invalid_phase: "ยังทำขั้นตอนนี้ไม่ได้",
  player_not_found: "ไม่พบผู้เล่นคนนี้",
  not_host: "เฉพาะเจ้าของเกมเท่านั้นที่เริ่มได้",
  not_your_turn: "ยังไม่ถึงตาของผู้เล่นคนนี้",
  card_not_owned: "ไม่พบไพ่ใบนั้นในมือ",
  invalid_target: "เลือกผู้เล่นอื่นในเกม",
  invalid_claim: "เลือกชนิดไพ่ที่มีในเกม",
  game_not_startable: "ต้องมีผู้เล่น 2–8 คนเพื่อเริ่มเกม",
  invalid_response: "เลือกคำตอบจริงหรือบลัฟ",
};

function playAction(state: GameState, action: GameCommand) {
  return applyGameAction(state, { ...action, expectedVersion: state.version } as GameAction);
}

function BugMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 12.5v16M11 16l-5-3M25 16l5-3M11 22H5M25 22h6M12 28l-4 4M24 28l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <ellipse cx="18" cy="21" fill="currentColor" rx="6.2" ry="8.5" />
      <circle cx="18" cy="10" fill="currentColor" r="4.5" />
      <circle cx="16.5" cy="9.5" fill="#fff8ec" r=".8" />
      <circle cx="19.5" cy="9.5" fill="#fff8ec" r=".8" />
    </svg>
  );
}

function CardFace({
  type,
  selected = false,
  onClick,
  disabled = false,
}: {
  type: CardType;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const details = CARD_DETAILS[type];
  const contents = (
    <>
      <span className="card-face__type">{details.english}</span>
      <span className="card-face__seal" style={{ "--card-accent": details.accent } as React.CSSProperties}>
        <Image
          className="card-face__art"
          src={`/images/cards/${type}.png`}
          alt=""
          width={512}
          height={512}
        />
      </span>
      <span className="card-face__name">{details.name}</span>
      <span className="card-face__serial">ไพ่แมลงป่วน</span>
    </>
  );

  if (!onClick) {
    return <div className="card-face" aria-label={details.name}>{contents}</div>;
  }

  return (
    <motion.button
      type="button"
      className={`card-face${selected ? " card-face--selected" : ""}`}
      style={{ "--card-accent": details.accent } as React.CSSProperties}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -5 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      aria-label={`เลือกไพ่${details.name}`}
      aria-pressed={selected}
    >
      {contents}
    </motion.button>
  );
}

function CardBack({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`card-back${compact ? " card-back--compact" : ""}`} aria-label="ไพ่คว่ำหน้า">
      <span className="card-back__inner"><BugMark /></span>
    </div>
  );
}

function PlayerSeat({
  player,
  isActive,
  isCurrentViewer,
}: {
  player: GameState["players"][number];
  isActive: boolean;
  isCurrentViewer: boolean;
}) {
  return (
    <article className={`player-seat${isActive ? " player-seat--active" : ""}${isCurrentViewer ? " player-seat--you" : ""}`}>
      <div className="player-seat__avatar" aria-hidden="true">{player.nickname.slice(0, 1).toLocaleUpperCase()}</div>
      <div className="player-seat__identity">
        <span className="player-seat__name">{player.nickname}{isCurrentViewer ? <span className="player-seat__you">คุณ</span> : null}</span>
        <span className="player-seat__count">ไพ่ในมือ {player.hand.length} ใบ</span>
      </div>
      {player.penaltyCards.length > 0 ? (
        <div className="player-seat__penalties" aria-label={`ไพ่โทษ ${player.penaltyCards.length} ใบ`}>
          {player.penaltyCards.map((card) => (
            <span key={card.id} title={CARD_DETAILS[card.type].name} style={{ "--card-accent": CARD_DETAILS[card.type].accent } as React.CSSProperties}>
              {CARD_DETAILS[card.type].english.slice(0, 1)}
            </span>
          ))}
        </div>
      ) : null}
      {isActive ? <span className="player-seat__turn">ตานี้</span> : null}
    </article>
  );
}

export default function LocalGame() {
  const [playerCount, setPlayerCount] = useState(3);
  const [nicknames, setNicknames] = useState(["มะลิ", "ต้น", "แพร"]);
  const [game, setGame] = useState<GameState | null>(null);
  const [turnReady, setTurnReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function resizePlayers(nextCount: number) {
    const safeCount = Math.min(8, Math.max(2, nextCount));
    setPlayerCount(safeCount);
    setNicknames((current) =>
      Array.from({ length: safeCount }, (_, index) => current[index] ?? `ผู้เล่น ${index + 1}`),
    );
  }

  function startGame() {
    const players = nicknames.slice(0, playerCount).map((nickname, index) => ({
      id: `player-${index + 1}`,
      nickname: nickname.trim() || `ผู้เล่น ${index + 1}`,
    }));
    const waitingGame = createWaitingGame(players, {
      gameId: `local-${Date.now()}`,
      hostPlayerId: players[0].id,
    });
    const result = playAction(waitingGame, { type: "start_game", playerId: players[0].id });
    if (!result.ok) {
      setMessage(ERROR_MESSAGES[result.error.code] ?? "เริ่มเกมไม่สำเร็จ");
      return;
    }
    setGame(result.nextState);
    setTurnReady(false);
    setMessage(null);
  }

  function commit(action: GameCommand): GameState | null {
    if (!game) return null;
    const result = playAction(game, action);
    if (!result.ok) {
      setMessage(ERROR_MESSAGES[result.error.code] ?? "ทำรายการไม่สำเร็จ");
      return null;
    }
    setGame(result.nextState);
    setMessage(null);
    return result.nextState;
  }

  function respond(response: "true" | "bluff") {
    if (!game?.pendingTurn?.targetPlayerId) return;
    const responderId = game.pendingTurn.targetPlayerId;
    const reveal = playAction(game, { type: "respond_to_challenge", playerId: responderId, response });
    if (!reveal.ok) {
      setMessage(ERROR_MESSAGES[reveal.error.code] ?? "ส่งคำตอบไม่สำเร็จ");
      return;
    }
    const resolution = playAction(reveal.nextState, { type: "resolve_challenge", playerId: responderId });
    if (!resolution.ok) {
      setMessage(ERROR_MESSAGES[resolution.error.code] ?? "เปิดไพ่ไม่สำเร็จ");
      return;
    }
    setGame(resolution.nextState);
    setMessage(null);
  }

  function continueAfterReveal() {
    if (!game?.pendingTurn?.targetPlayerId) return;
    const responsePlayerId = game.pendingTurn.targetPlayerId;
    const finished = playAction(game, { type: "finish_resolution", playerId: responsePlayerId });
    if (!finished.ok) {
      setMessage(ERROR_MESSAGES[finished.error.code] ?? "ไปตาถัดไปไม่สำเร็จ");
      return;
    }
    if (finished.nextState.phase === "next_turn" && finished.nextState.nextPlayerId) {
      const advanced = playAction(finished.nextState, {
        type: "advance_turn",
        playerId: finished.nextState.nextPlayerId,
      });
      if (!advanced.ok) {
        setMessage(ERROR_MESSAGES[advanced.error.code] ?? "เริ่มตาถัดไปไม่สำเร็จ");
        return;
      }
      setGame(advanced.nextState);
    } else {
      setGame(finished.nextState);
    }
    setTurnReady(false);
    setMessage(null);
  }

  if (!game) {
    return (
      <main className="app-shell landing-shell">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="หน้าแรก ไพ่แมลงป่วน">
            <span className="brand__mark"><BugMark /></span>
            <span>ไพ่แมลงป่วน</span>
          </Link>
          <span className="local-tag"><span aria-hidden="true" /> เล่นบนเครื่องนี้</span>
        </header>

        <section className="landing-content" aria-labelledby="landing-title">
          <div className="landing-story">
            <p className="eyebrow"><span className="eyebrow__line" /> เกมไพ่ปาร์ตี้ · 2–8 คน</p>
            <h1 id="landing-title">ไพ่ใบนี้<br /><span>จริงหรือบลัฟ?</span></h1>
            <p className="landing-copy">ส่งไพ่คว่ำหน้า พูดให้เพื่อนเชื่อ แล้วจับให้ได้ว่าใครกำลังโกหก ระวังอย่าสะสมไพ่ชนิดเดียวกันครบสี่ใบ!</p>
            <div className="card-peek" aria-hidden="true">
              <div className="card-peek__card card-peek__card--one"><span>BUG</span><Image className="card-peek__art" src="/images/cards/bug.png" alt="" width={72} height={72} /></div>
              <div className="card-peek__card card-peek__card--two"><span>RAT</span><Image className="card-peek__art" src="/images/cards/rat.png" alt="" width={72} height={72} /></div>
              <div className="card-peek__card card-peek__card--three"><span>BLUFF?</span><CardBack compact /></div>
              <span className="card-peek__spark">✳</span>
            </div>
            <div className="how-to">
              <span className="how-to__number">01</span><span>เลือกไพ่แล้วแอบอ้างชนิด</span>
              <span className="how-to__number">02</span><span>คนรับตอบ “จริง” หรือ “บลัฟ”</span>
              <span className="how-to__number">03</span><span>ใครพลาดรับไพ่โทษ!</span>
            </div>
          </div>

          <form className="setup-card" onSubmit={(event) => { event.preventDefault(); startGame(); }}>
            <div className="setup-card__heading">
              <span className="setup-icon"><BugMark /></span>
              <div><p className="setup-kicker">ตั้งโต๊ะเล่น</p><h2>ใครมาร่วมวงบ้าง?</h2></div>
            </div>

            <div className="player-count-row">
              <div><span className="field-label">จำนวนผู้เล่น</span><span className="field-hint">อย่างน้อย 2 คน</span></div>
              <div className="stepper" aria-label="จำนวนผู้เล่น">
                <button type="button" onClick={() => resizePlayers(playerCount - 1)} disabled={playerCount <= 2} aria-label="ลดจำนวนผู้เล่น">−</button>
                <output aria-live="polite">{playerCount}<span> คน</span></output>
                <button type="button" onClick={() => resizePlayers(playerCount + 1)} disabled={playerCount >= 8} aria-label="เพิ่มจำนวนผู้เล่น">+</button>
              </div>
            </div>

            <div className="name-fields">
              {nicknames.slice(0, playerCount).map((nickname, index) => (
                <label className="name-field" key={index}>
                  <span className="name-field__number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="sr-only">ชื่อผู้เล่น {index + 1}</span>
                  <input
                    value={nickname}
                    maxLength={18}
                    onChange={(event) => setNicknames((current) => current.map((name, nameIndex) => nameIndex === index ? event.target.value : name))}
                    placeholder={`ผู้เล่น ${index + 1}`}
                    aria-label={`ชื่อผู้เล่น ${index + 1}`}
                  />
                  {index === 0 ? <span className="host-pill">เจ้ามือ</span> : null}
                </label>
              ))}
            </div>

            {message ? <p className="inline-message" role="alert">{message}</p> : null}
            <button className="primary-button setup-submit" type="submit">
              เริ่มเล่น <span aria-hidden="true">↗</span>
            </button>
            <p className="setup-note"><span aria-hidden="true">●</span> เล่นผลัดกันบนอุปกรณ์เดียว ส่งเครื่องให้ผู้เล่นถัดไป</p>
          </form>
        </section>
        <footer className="landing-footer"><span>ไพ่แมลงป่วน</span><span>เกมวงเพื่อน เล่นง่าย แอบโกหกได้</span></footer>
      </main>
    );
  }

  const currentPlayer = game.players.find(({ id }) => id === game.currentPlayerId);
  const pending = game.pendingTurn;
  const sender = pending ? game.players.find(({ id }) => id === pending.senderId) : null;
  const receiver = pending?.targetPlayerId ? game.players.find(({ id }) => id === pending.targetPlayerId) : null;
  const activePlayer = game.phase === "waiting_response" ? receiver : currentPlayer;
  const isHandoffPhase = game.phase === "select_card" || game.phase === "waiting_response";
  const shouldShowHandoff = isHandoffPhase && !turnReady;
  const resolution = game.lastResolution;
  const penaltyOwner = resolution ? game.players.find(({ id }) => id === resolution.penaltyOwnerId) : null;
  const loser = game.gameOver?.loserPlayerId ? game.players.find(({ id }) => id === game.gameOver?.loserPlayerId) : null;

  return (
    <main className="app-shell game-shell">
      <header className="site-header game-header">
        <button className="brand" type="button" aria-label="กลับหน้าเริ่มเกม" onClick={() => { setGame(null); setMessage(null); }}>
          <span className="brand__mark"><BugMark /></span><span>ไพ่แมลงป่วน</span>
        </button>
        <div className="game-header__meta"><span className="local-tag"><span aria-hidden="true" /> โต๊ะส่วนตัว</span><span className="turn-counter">ตาที่ {game.turnNumber}</span></div>
        <button className="text-button" type="button" onClick={() => { setGame(null); setTurnReady(false); setMessage(null); }}>ออกจากเกม <span aria-hidden="true">×</span></button>
      </header>

      <section className="game-heading">
        <div><p className="eyebrow"><span className="eyebrow__line" /> รอบที่ {game.turnNumber}</p>
          <h1>{game.phase === "game_over" ? "จบเกมแล้ว!" : game.phase === "resolve" ? "เปิดไพ่แล้ว" : game.phase === "waiting_response" ? "จริงหรือบลัฟ?" : game.phase === "select_target" ? "ส่งไพ่ให้ใครดี?" : game.phase === "select_claim" ? "จะอ้างว่าเป็นอะไร?" : `ตาของ${currentPlayer?.nickname ?? "ผู้เล่น"}`}</h1>
        </div>
        {game.phase !== "game_over" ? <p className="game-heading__hint">{game.phase === "waiting_response" ? `${sender?.nickname ?? "เพื่อน"} ส่งไพ่คว่ำหน้าให้ ${receiver?.nickname ?? "คุณ"}` : game.phase === "resolve" ? "ดูผล แล้วส่งต่อให้คนเริ่มตาถัดไป" : "เก็บไพ่โทษให้ครบสี่ใบเมื่อไร แพ้ทันที"}</p> : null}
      </section>

      <div className="game-layout">
        <section className="table-panel" aria-label="กระดานเกม">
          <div className="table-panel__topline"><span>วงไพ่</span><span className="table-panel__dots" aria-hidden="true"><i /><i /><i /></span><span>{game.players.length} ผู้เล่น</span></div>

          <div className="seats-grid">
            {game.players.map((player) => (
              <PlayerSeat key={player.id} player={player} isActive={activePlayer?.id === player.id && game.phase !== "resolve" && game.phase !== "game_over"} isCurrentViewer={activePlayer?.id === player.id && turnReady && !shouldShowHandoff} />
            ))}
          </div>

          <div className="table-center">
            {shouldShowHandoff ? (
              <div className="handoff-card" role="status">
                <div className="handoff-card__visual"><CardBack /></div>
                <p className="handoff-card__eyebrow">ส่งต่อหน้าจอ</p>
                <h2>ส่งให้{activePlayer?.nickname ?? "ผู้เล่นถัดไป"}</h2>
                <p>{game.phase === "waiting_response" ? "อย่าให้คนส่งเห็นไพ่ กดรับเพื่อดูคำอ้างแล้วตัดสินใจ" : "ส่งอุปกรณ์ให้คนเล่นตานี้ แล้วค่อยเปิดดูไพ่ในมือ"}</p>
                <button className="primary-button handoff-button" type="button" onClick={() => { setTurnReady(true); setMessage(null); }}>
                  {game.phase === "waiting_response" ? "พร้อมตัดสินใจ" : "พร้อมเล่นแล้ว"}<span aria-hidden="true">→</span>
                </button>
              </div>
            ) : game.phase === "waiting_response" && pending && receiver && sender ? (
              <div className="challenge-card">
                <div className="challenge-card__pass"><CardBack /></div>
                <p className="challenge-card__eyebrow">{sender.nickname} บอกว่า…</p>
                <h2>“ไพ่ใบนี้คือ <span>{CARD_DETAILS[pending.claim ?? "bug"].name}</span>”</h2>
                <p className="challenge-card__hint">รับไพ่คว่ำหน้าไว้ แล้วเลือกว่าจะเชื่อหรือจับโกหก</p>
                <div className="response-buttons">
                  <button className="response-button response-button--true" type="button" onClick={() => respond("true")}><span className="response-button__icon" aria-hidden="true">✓</span><span><strong>จริง</strong><small>เชื่อคำพูดนี้</small></span></button>
                  <button className="response-button response-button--bluff" type="button" onClick={() => respond("bluff")}><span className="response-button__icon" aria-hidden="true">!</span><span><strong>บลัฟ</strong><small>จับได้ว่าโกหก</small></span></button>
                </div>
              </div>
            ) : game.phase === "resolve" && resolution ? (
              <div className="reveal-card">
                <p className="reveal-card__eyebrow">ไพ่ที่ส่งมาเป็น</p>
                <CardFace type={resolution.actualCard.type} />
                <p className="reveal-card__claim">อ้างว่าเป็น {CARD_DETAILS[resolution.claim].name} · ตอบ “{resolution.response === "true" ? "จริง" : "บลัฟ"}”</p>
                <div className={`result-banner${resolution.responseWasCorrect ? " result-banner--good" : " result-banner--bad"}`}>
                  <span aria-hidden="true">{resolution.responseWasCorrect ? "✓" : "!"}</span>
                  <p>{resolution.responseWasCorrect ? "จับคำตอบได้ถูกต้อง!" : "ทายพลาด รับไพ่โทษไปเลย"}<small>{penaltyOwner?.nickname ?? "ผู้เล่น"} ได้ไพ่โทษ 1 ใบ</small></p>
                </div>
                {game.gameOver ? <p className="game-over-callout">{loser?.nickname ?? "ผู้เล่น"} สะสมไพ่{game.gameOver.cardType ? CARD_DETAILS[game.gameOver.cardType].name : ""} ครบ 4 ใบ</p> : null}
                <button className="primary-button reveal-continue" type="button" onClick={continueAfterReveal}>{game.gameOver ? "ดูผลเกม" : "ไปตาถัดไป"}<span aria-hidden="true">→</span></button>
              </div>
            ) : game.phase === "game_over" ? (
              <div className="game-over-card">
                <span className="game-over-card__stamp" aria-hidden="true"><BugMark /></span>
                <p className="challenge-card__eyebrow">หมดรอบแล้ว</p>
                {game.gameOver?.reason === "four_of_a_kind" ? <><h2>{loser?.nickname ?? "ผู้เล่น"}<br /><span>โดนไพ่สี่ใบ!</span></h2><p>สะสมไพ่{game.gameOver.cardType ? CARD_DETAILS[game.gameOver.cardType].name : ""} ครบสี่ใบ</p></> : <><h2>ไพ่หมดมือแล้ว</h2><p>ไม่มีไพ่ให้เล่นต่อ จบรอบนี้พอดี</p></>}
                <button className="primary-button handoff-button" type="button" onClick={() => { setGame(null); setTurnReady(false); }}>{"เล่นอีกรอบ"}<span aria-hidden="true">↻</span></button>
              </div>
            ) : (
              <div className="play-card">
                {game.phase === "select_card" ? <>
                  <div className="play-card__back"><CardBack /></div>
                  <p className="challenge-card__eyebrow">เลือกจากไพ่ในมือ</p>
                  <h2>ส่งไพ่คว่ำหน้า<br />ไปให้เพื่อน</h2>
                  <p className="play-card__hint">เลือกไพ่ 1 ใบด้านล่าง แล้วเลือกคนรับ</p>
                </> : game.phase === "select_target" ? <>
                  <div className="play-card__mini"><CardBack compact /><span>ไพ่ที่เลือก</span></div>
                  <p className="challenge-card__eyebrow">เลือกผู้รับไพ่</p>
                  <h2>จะส่งให้ใคร?</h2>
                  <p className="play-card__hint">เลือกผู้เล่นคนอื่นในวง</p>
                  <div className="target-list">{game.players.filter(({ id }) => id !== game.currentPlayerId).map((player) => <button className="target-button" key={player.id} type="button" onClick={() => commit({ type: "select_target", playerId: currentPlayer!.id, targetPlayerId: player.id })}><span className="target-button__avatar">{player.nickname.slice(0, 1)}</span><span>{player.nickname}<small>ไพ่ในมือ {player.hand.length} ใบ</small></span><b aria-hidden="true">→</b></button>)}</div>
                </> : game.phase === "select_claim" && currentPlayer ? <>
                  <div className="play-card__mini"><CardBack compact /><span>ส่งให้ {receiver?.nickname}</span></div>
                  <p className="challenge-card__eyebrow">เลือกคำกล่าวอ้าง</p>
                  <h2>ไพ่ใบนี้คืออะไร?</h2>
                  <p className="play-card__hint">พูดจริงก็ได้ แอบบลัฟก็ได้</p>
                  <div className="claim-grid">{Object.entries(CARD_DETAILS).map(([type, details]) => <button className="claim-button" key={type} type="button" onClick={() => { const next = commit({ type: "select_claim", playerId: currentPlayer.id, claim: type as CardType }); if (next) setTurnReady(false); }}><span className="claim-button__dot" style={{ "--card-accent": details.accent } as React.CSSProperties} />{details.name}<small>{details.english}</small></button>)}</div>
                </> : null}
              </div>
            )}
          </div>

          {game.phase === "select_card" && turnReady && currentPlayer ? (
            <div className="hand-area"><div className="hand-area__title"><span>ไพ่ในมือของ{currentPlayer.nickname}</span><span>{currentPlayer.hand.length} ใบ</span></div><div className="hand-cards">{currentPlayer.hand.map((card: Card) => <CardFace key={card.id} type={card.type} onClick={() => commit({ type: "select_card", playerId: currentPlayer.id, cardId: card.id })} />)}</div></div>
          ) : null}
          {message ? <p className="inline-message inline-message--game" role="alert">{message}</p> : null}
        </section>

        <aside className="side-panel" aria-label="ข้อมูลเกม">
          <section className="side-card side-card--objective"><p className="side-card__label">เป้าหมาย</p><h2>อย่าสะสม<br /><span>สี่ใบเหมือนกัน</span></h2><p>ใครได้ไพ่โทษชนิดเดียวกันครบ 4 ใบ แพ้ทันที</p><div className="objective-row"><span>ไพ่โทษของผู้เล่น</span><span>{game.players.reduce((total, player) => total + player.penaltyCards.length, 0)} ใบ</span></div></section>
          <section className="side-card side-card--score"><div className="side-card__title"><h2>ไพ่โทษ</h2><span>เปิดหน้าให้เห็น</span></div><div className="penalty-list">{game.players.map((player) => <div className="penalty-row" key={player.id}><span className="penalty-row__name">{player.nickname}</span><span className="penalty-row__cards">{player.penaltyCards.length ? player.penaltyCards.map((card) => <i key={card.id} title={CARD_DETAILS[card.type].name} style={{ "--card-accent": CARD_DETAILS[card.type].accent } as React.CSSProperties}>{CARD_DETAILS[card.type].english.slice(0, 1)}</i>) : <small>ยังไม่มี</small>}</span></div>)}</div></section>
          <div className="privacy-note"><span aria-hidden="true"><BugMark /></span><p><strong>ถึงตาใคร คนนั้นดูไพ่</strong><br />ก่อนส่งเครื่อง ปิดไพ่ในมือไว้เสมอ</p></div>
        </aside>
      </div>
      <footer className="game-footer"><span>ไพ่แมลงป่วน</span><span>เล่นผลัดกันบนอุปกรณ์เดียว</span></footer>
    </main>
  );
}
