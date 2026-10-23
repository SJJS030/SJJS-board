import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminSession";
import { apiError, checkOrigin } from "@/lib/api";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
  } catch (error) {
    return apiError(error, "로그아웃에 실패했습니다.");
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
