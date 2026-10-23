import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, checkOrigin } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  try {
    checkOrigin(request);
    const { error } = await getSupabaseAdmin()
      .from("memos")
      .delete()
      .not("id", "is", null);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "전체 메모를 삭제하지 못했습니다.");
  }
}
