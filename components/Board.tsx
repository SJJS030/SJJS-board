"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminPanel from "./AdminPanel";
import FloatingActionButton from "./FloatingActionButton";
import Header from "./Header";
import MemoCard from "./MemoCard";
import MemoFormModal from "./MemoFormModal";
import Toast from "./Toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Memo, ToastMessage } from "@/lib/types";
import { fetchJson } from "@/lib/fetchJson";

export default function Board() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef(0);

  const notify = useCallback(
    (message: string, tone: ToastMessage["tone"] = "info") => {
      const next = { id: Date.now(), message, tone };
      setToast(next);
      window.setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current));
      }, 3200);
    },
    [],
  );

  const loadMemos = useCallback(
    async (showSuccess = false) => {
      const version = ++loadVersion.current;
      setSyncing(true);
      try {
        const supabase = getSupabaseBrowserClient();
        const memos: Memo[] = [];
        // Page through the result instead of silently losing rows above the API limit.
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from("memos")
            .select("id,title,content,created_at")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + 99);
          if (error) throw error;
          if (version !== loadVersion.current) return;
          const page = (data ?? []) as Memo[];
          memos.push(...page);
          if (page.length < 100) break;
          offset += page.length;
        }
        setMemos(Array.from(new Map(memos.map((memo) => [memo.id, memo])).values()));
        setLoadError("");
        if (showSuccess) notify("최신 메모로 동기화했습니다.", "success");
      } catch (caught) {
        if (version !== loadVersion.current) return;
        console.error(caught);
        setLoadError("메모를 불러오지 못했습니다. 잠시 후 동기화를 다시 눌러 주세요.");
      } finally {
        if (version === loadVersion.current) setSyncing(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) void loadMemos();
    });

    void fetchJson<{ isAdmin: boolean }>("/api/admin/session")
      .then((result) => {
        if (active) setIsAdmin(Boolean(result.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });

    return () => {
      active = false;
      loadVersion.current += 1;
    };
  }, [loadMemos]);

  const filteredMemos = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko");
    if (!query) return memos;
    return memos.filter(
      (memo) =>
        memo.title.toLocaleLowerCase("ko").includes(query) ||
        memo.content.toLocaleLowerCase("ko").includes(query),
    );
  }, [memos, search]);

  async function afterCreate() {
    await loadMemos();
    notify("새 메모를 붙였습니다.", "success");
  }

  async function afterDelete(message: string) {
    await loadMemos();
    notify(message, "success");
  }

  async function deleteAll() {
    await fetchJson("/api/admin/delete-all", { method: "POST" });
    await loadMemos();
    notify("모든 메모를 삭제했습니다.", "success");
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("보드 주소를 클립보드에 복사했습니다.", "success");
    } catch {
      notify("주소 복사에 실패했습니다.", "error");
    }
  }

  return (
    <div className="min-h-screen text-slate-900">
      <Header
        search={search}
        onSearch={setSearch}
        onSync={() => void loadMemos(true)}
        syncing={syncing}
        onShare={() => void share()}
        onAdmin={() => setAdminOpen(true)}
        isAdmin={isAdmin}
      />

      <main className="mx-auto min-h-[calc(100vh-73px)] max-w-[1500px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <label className="mb-5 block md:hidden">
          <span className="sr-only">메모 검색</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="메모 검색"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>

        {loadError && (
          <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</p>
        )}
        {syncing && memos.length === 0 && (
          <p role="status" className="py-16 text-center text-slate-500">메모를 불러오는 중입니다.</p>
        )}
        {!syncing && !loadError && filteredMemos.length === 0 && (
          <p className="py-16 text-center text-slate-500">
            {search.trim() ? "검색 결과가 없습니다." : "아직 메모가 없습니다. + 버튼으로 첫 메모를 붙여 보세요."}
          </p>
        )}
        {filteredMemos.length > 0 && (
          <section className="memo-grid" aria-label="메모 목록">
            {filteredMemos.map((memo, index) => (
              <MemoCard
                key={memo.id}
                memo={memo}
                index={index}
                isAdmin={isAdmin}
                onDeleted={afterDelete}
              />
            ))}
          </section>
        )}
      </main>

      <FloatingActionButton onClick={() => setFormOpen(true)} />
      <MemoFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={afterCreate}
      />
      <AdminPanel
        open={adminOpen}
        isAdmin={isAdmin}
        onClose={() => setAdminOpen(false)}
        onAuthChanged={(nextAdmin, message) => {
          setIsAdmin(nextAdmin);
          notify(message, "success");
        }}
        onDeleteAll={deleteAll}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
