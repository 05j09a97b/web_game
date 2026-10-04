import { startRoomGame } from "@/lib/server/rooms";
import { apiFailure, authenticateRequest } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { userId } = await authenticateRequest(request);
    const { code: rawCode } = await context.params;
    return Response.json(await startRoomGame(rawCode.toUpperCase(), userId));
  } catch (error) {
    return apiFailure(error);
  }
}
