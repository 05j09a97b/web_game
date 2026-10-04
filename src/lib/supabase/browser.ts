"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  browserClient ??= createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return browserClient;
}

export async function ensureAnonymousSession() {
  const client = getBrowserSupabase();
  if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase ในไฟล์ .env.local");

  const { data: existing, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error("กู้คืนเซสชันผู้เล่นไม่สำเร็จ");
  if (existing.session) return existing.session;

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw new Error("เข้าเล่นแบบไม่ต้องสมัครสมาชิกไม่สำเร็จ");
  return data.session;
}
