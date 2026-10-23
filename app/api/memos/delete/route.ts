import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isFourDigitPassword, verifyPassword } from "@/lib/password";
import { apiError, readJsonObject, requireMemoId } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    requireMemoId(body.id);
    if (!isFourDigitPassword(body.password)) {
      return NextResponse.json(
        { error: "메모와 숫자 4자리 비밀번호를 확인해 주세요." },
        { status: 400 },
      );
    }

    await rateLimit(request, "delete-ip", 30);
    await rateLimit(request, "delete-memo", 10, body.id.toLowerCase());
    const supabase = getSupabaseAdmin();
    const { data: memo, error: readError } = await supabase
      .from("memos")
      .select("id,password_hash")
      .eq("id", body.id)
      .maybeSingle();

    if (readError) throw readError;
    if (!memo) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }

    const matches = await verifyPassword(body.password, memo.password_hash);
    if (!matches) {
      return NextResponse.json(
        { error: "삭제 비밀번호가 일치하지 않습니다." },
        { status: 403 },
      );
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("memos")
      .delete()
      .eq("id", body.id)
      .select("id");
    if (deleteError) throw deleteError;
    if (!deleted?.length) return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "메모를 삭제하지 못했습니다.");
  }
}
