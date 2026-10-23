import { createHmac } from "node:crypto";
import { ApiError } from "./api";
import { getSessionSecret } from "./adminToken";
import { getSupabaseAdmin } from "./supabaseAdmin";

// Database counters are shared across Vercel instances and survive cold starts.
export async function rateLimit(request: Request, action: string, limit: number, resource?: string) {
  // Trust proxy headers only on Vercel. Local requests share a bucket.
  const ip = process.env.VERCEL === "1"
    ? (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
    : "local";
  const key = createHmac("sha256", getSessionSecret())
    .update(`${action}:${resource ?? ip}`)
    .digest("hex");
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 600,
  });
  if (error) {
    console.error("Rate limit database error", error);
    throw new ApiError(503, "요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (data !== true) throw new ApiError(429, "요청이 너무 많습니다. 10분 후 다시 시도해 주세요.");
}
