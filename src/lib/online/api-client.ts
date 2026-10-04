"use client";

import { ensureAnonymousSession, getBrowserSupabase } from "@/lib/supabase/browser";

export async function onlineRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const client = getBrowserSupabase();
  if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase ในไฟล์ .env.local");

  let { data, error } = await client.auth.getSession();
  if (error) throw new Error("กู้คืนเซสชันผู้เล่นไม่สำเร็จ");
  if (!data.session) {
    await ensureAnonymousSession();
    ({ data, error } = await client.auth.getSession());
  }
  if (error || !data.session) throw new Error("ไม่พบเซสชันผู้เล่น ลองโหลดหน้าใหม่");

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "เชื่อมต่อห้องไม่สำเร็จ ลองอีกครั้ง";
    throw new Error(message);
  }
  return body as T;
}
