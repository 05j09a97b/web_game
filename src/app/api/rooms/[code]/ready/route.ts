import { setPlayerReady } from "@/lib/server/rooms";
import { ApiError, apiFailure, authenticateRequest, requestBody } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { userId } = await authenticateRequest(request);
    const { code: rawCode } = await context.params;
    const body = await requestBody(request);
    if (typeof body.ready !== "boolean") throw new ApiError(400, "สถานะพร้อมไม่ถูกต้อง");
    const snapshot = await setPlayerReady(rawCode.toUpperCase(), userId, body.ready);
    return Response.json(snapshot);
  } catch (error) {
    return apiFailure(error);
  }
}
