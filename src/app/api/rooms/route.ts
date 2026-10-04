import { createRoom, joinRoom } from "@/lib/server/rooms";
import { ApiError, apiFailure, authenticateRequest, requestBody } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await authenticateRequest(request);
    const body = await requestBody(request);
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (nickname.length < 1 || nickname.length > 24) {
      throw new ApiError(400, "ชื่อผู้เล่นต้องมี 1–24 ตัวอักษร");
    }

    if (body.action === "create") {
      const room = await createRoom(nickname, userId);
      return Response.json(room, { status: 201 });
    }
    if (body.action === "join") {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new ApiError(400, "รหัสห้องต้องมี 6 ตัวอักษร");
      const room = await joinRoom(code, nickname, userId);
      return Response.json(room, { status: 200 });
    }
    throw new ApiError(400, "เลือกสร้างห้องหรือเข้าร่วมห้องก่อน");
  } catch (error) {
    return apiFailure(error);
  }
}
