import { getRoomSnapshot } from "@/lib/server/rooms";
import { apiFailure, authenticateRequest } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { userId } = await authenticateRequest(request);
    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();
    return Response.json(await getRoomSnapshot(code, userId), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
