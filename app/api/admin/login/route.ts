import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminSession";
import { ADMIN_SESSION_SECONDS, createAdminSessionToken } from "@/lib/adminToken";
import { verifyPassword } from "@/lib/password";
import { apiError, readJsonObject } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminHash) {
      return NextResponse.json(
        { error: "관리자 설정을 확인해 주세요." },
        { status: 500 },
      );
    }

    if (typeof body.password !== "string" || !body.password || Buffer.byteLength(body.password) > 72) {
      return NextResponse.json({ error: "관리자 비밀번호를 확인해 주세요." }, { status: 400 });
    }

    await rateLimit(request, "admin-login", 10);

    const matches = await verifyPassword(body.password, adminHash);
    if (!matches) {
      return NextResponse.json(
        { error: "관리자 비밀번호가 일치하지 않습니다." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return apiError(error, "관리자 로그인에 실패했습니다.");
  }
}
