export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next.js dev normalizes request.url to localhost even for 127.0.0.1 requests.
  // The browser's Host header preserves the authority that received the request.
  const host = request.headers.get("host") ?? url.host;
  if (origin && origin !== `${url.protocol}//${host}`) {
    throw new ApiError(403, "허용되지 않은 요청입니다.");
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  checkOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new ApiError(415, "JSON 형식으로 요청해 주세요.");
  }
  if (Number(request.headers.get("content-length")) > 16_384) {
    throw new ApiError(413, "요청이 너무 큽니다.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 16_384) throw new ApiError(413, "요청이 너무 큽니다.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "올바른 JSON 요청이 필요합니다.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "올바른 JSON 객체가 필요합니다.");
  }
  return body as Record<string, unknown>;
}

export function requireMemoId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new ApiError(400, "올바른 메모 ID가 필요합니다.");
  }
}

export function apiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, {
      status: error.status,
      headers: error.status === 429 ? { "Retry-After": "600" } : undefined,
    });
  }
  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 500 });
}
