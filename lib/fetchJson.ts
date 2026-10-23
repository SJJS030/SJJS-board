export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!response.ok) {
    throw new Error(typeof result?.error === "string" ? result.error : "요청을 처리하지 못했습니다.");
  }
  return result as T;
}
