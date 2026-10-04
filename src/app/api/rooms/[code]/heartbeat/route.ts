import { touchRoomPresence } from "@/lib/server/rooms";
import { apiFailure, authenticateRequest } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { userId } = await authenticateRequest(request);
    const { code } = await context.params;
    await touchRoomPresence(code.toUpperCase(), userId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}
