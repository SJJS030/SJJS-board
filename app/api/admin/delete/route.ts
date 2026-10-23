import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, readJsonObject, requireMemoId } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await readJsonObject(request);
    requireMemoId(body.id);

    const { data, error } = await getSupabaseAdmin()
      .from("memos")
      .delete()
      .eq("id", body.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "메모를 강제 삭제하지 못했습니다.");
  }
}
