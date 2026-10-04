import { applyRoomGameAction } from "@/lib/server/rooms";
import { apiFailure, authenticateRequest, requestBody } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { userId } = await authenticateRequest(request);
    const { code: rawCode } = await context.params;
    const body = await requestBody(request);
    const snapshot = await applyRoomGameAction(rawCode.toUpperCase(), userId, body);
    return Response.json(snapshot, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiFailure(error);
  }
}
