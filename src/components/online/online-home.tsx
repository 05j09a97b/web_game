"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { onlineRequest } from "@/lib/online/api-client";
import { getBrowserSupabase } from "@/lib/supabase/browser";

interface RoomEntry {
  roomCode: string;
}

export default function OnlineHome() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isConfigured = getBrowserSupabase() !== null;

  async function enterRoom(action: "create" | "join") {
    const cleanNickname = nickname.trim();
    if (!cleanNickname || cleanNickname.length > 24) {
      setMessage("ใส่ชื่อเล่น 1–24 ตัวอักษรก่อนนะ");
      return;
    }
    if (action === "join" && code.trim().length !== 6) {
      setMessage("กรอกรหัสห้อง 6 ตัวอักษรก่อนนะ");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const room = await onlineRequest<RoomEntry>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          action,
          nickname: cleanNickname,
          ...(action === "join" ? { code: code.trim().toUpperCase() } : {}),
        }),
      });
      router.push(`/room/${room.roomCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าห้องไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell online-home">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="ไพ่แมลงป่วน หน้าแรก">
          <span className="brand__mark" aria-hidden="true">✳</span>
          ไพ่แมลงป่วน
        </Link>
        <span className="online-tag"><span /> เล่นออนไลน์</span>
      </header>

      <section className="online-home__content">
        <motion.div
          className="online-home__story"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="eyebrow"><span className="eyebrow__line" /> เกมไพ่บลัฟออนไลน์</p>
          <h1>หน้าตายไว้<br /><span>แล้วค่อยบลัฟ</span></h1>
          <p className="landing-copy">
            ส่งไพ่คว่ำหน้า อ้างว่าเป็นตัวอะไร แล้วดูว่าเพื่อนจะเชื่อไหม ชวนกันได้ 2–8 คนด้วยรหัสห้อง
          </p>
          <div className="online-home__chips" aria-label="คุณสมบัติเกม">
            <span>ไม่ต้องสมัครสมาชิก</span>
            <span>เห็นไพ่เฉพาะของตัวเอง</span>
            <span>เล่นได้บนมือถือ</span>
          </div>
        </motion.div>

        <motion.section
          className="online-panel"
          aria-labelledby="online-panel-title"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          <div className="online-panel__heading">
            <span className="online-panel__icon" aria-hidden="true">♧</span>
            <div>
              <p className="setup-kicker">เริ่มโต๊ะใหม่หรือเข้าวงเพื่อน</p>
              <h2 id="online-panel-title">พร้อมเล่นหรือยัง?</h2>
            </div>
          </div>

          <label className="online-label" htmlFor="nickname">ชื่อเล่น</label>
          <input
            id="nickname"
            className="online-input"
            autoComplete="nickname"
            maxLength={24}
            placeholder="เช่น มะลิ"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />

          <button
            className="primary-button online-action"
            type="button"
            onClick={() => void enterRoom("create")}
            disabled={busy || !isConfigured}
          >
            <span aria-hidden="true">＋</span> สร้างห้องใหม่
          </button>

          <div className="online-divider"><span>หรือ</span></div>
          <label className="online-label" htmlFor="room-code">รหัสห้องจากเพื่อน</label>
          <div className="online-join-row">
            <input
              id="room-code"
              className="online-input online-input--code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              placeholder="เช่น AB7K2M"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => void enterRoom("join")}
              disabled={busy || !isConfigured}
            >
              เข้าห้อง
            </button>
          </div>

          {message ? <p className="online-error" role="alert">{message}</p> : null}
          {!isConfigured ? (
            <p className="online-setup-note">
              เพิ่ม URL และ Publishable key ของ Supabase ใน <code>.env.local</code> เพื่อเปิดห้องออนไลน์
            </p>
          ) : (
            <p className="setup-note"><span>●</span> ระบบจะสร้างผู้เล่นชั่วคราวให้โดยอัตโนมัติ</p>
          )}
        </motion.section>
      </section>
      <footer className="landing-footer"><span>ไพ่แมลงป่วน</span><span>เชื่อใจเพื่อน…ได้แค่ไหน?</span></footer>
    </main>
  );
}
