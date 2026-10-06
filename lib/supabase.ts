// 문서 저장소(Supabase)에 서버용 키로 요청을 보내는 도우미.
// 서버 쪽 코드와 관리자용 스크립트에서만 쓴다. 브라우저 화면 코드에서 불러오지 않는다.

type DbRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  // 예: "return=representation" (넣은 줄을 돌려받기)
  prefer?: string;
};

export async function dbRequest<T>(
  path: string,
  options: DbRequestOptions = {},
): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      ".env에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.",
    );
  }

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`문서 저장소 요청 실패 (HTTP ${res.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
