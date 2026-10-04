import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

function supabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

function publicKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error("Missing Supabase publishable key");
  return value;
}

export function getAdminSupabase(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing a server-only Supabase secret key");
  adminClient ??= createClient(supabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

export async function authenticateRequest(request: Request): Promise<{ userId: string }> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, "กรุณาเข้าเล่นก่อนสร้างหรือเข้าห้อง");

  const authClient = createClient(supabaseUrl(), publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "เซสชันผู้เล่นหมดอายุ ลองโหลดหน้าใหม่");
  return { userId: data.user.id };
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiFailure(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "ระบบห้องเกมขัดข้องชั่วคราว ลองอีกครั้ง" }, { status: 500 });
}

export async function requestBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  return body as Record<string, unknown>;
}

export function safeRpcError(error: { message?: string; code?: string }): ApiError {
  const message = error.message ?? "";
  if (message.includes("ROOM_NOT_FOUND")) return new ApiError(404, "ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง");
  if (message.includes("ROOM_FULL")) return new ApiError(409, "ห้องนี้มีผู้เล่นครบ 8 คนแล้ว");
  if (message.includes("ROOM_ALREADY_STARTED")) return new ApiError(409, "เกมเริ่มไปแล้ว เข้าร่วมรอบนี้ไม่ได้");
  if (message.includes("NOT_ROOM_HOST")) return new ApiError(403, "เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้");
  if (message.includes("PLAYERS_NOT_READY")) return new ApiError(409, "ผู้เล่นทุกคนต้องกดพร้อมก่อนเริ่มเกม");
  if (message.includes("ROOM_NOT_WAITING")) return new ApiError(409, "ห้องนี้เริ่มเกมไปแล้ว");
  if (message.includes("PLAYER_NOT_IN_WAITING_ROOM")) return new ApiError(409, "ห้องนี้ไม่รับการเปลี่ยนสถานะแล้ว");
  if (message.includes("PLAYER_NOT_IN_ROOM")) return new ApiError(403, "คุณไม่ได้อยู่ในห้องนี้");
  if (message.includes("23505")) return new ApiError(409, "รหัสห้องซ้ำ ลองสร้างอีกครั้ง");
  if (message.includes("INVALID_NICKNAME")) return new ApiError(400, "ชื่อผู้เล่นต้องมี 1–24 ตัวอักษร");
  return new ApiError(500, "บันทึกข้อมูลห้องไม่สำเร็จ ลองอีกครั้ง");
}
