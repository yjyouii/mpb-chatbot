"use client";

import { useState } from "react";
import type { FormEvent } from "react";

// 잠금 화면 (DESIGN.md 1.1). 공용 비밀번호가 맞으면 대화 화면으로 넘어간다.
export default function LockScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password || checking) {
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // 서버가 통과 표시를 심었으므로, 화면을 다시 불러오면 대화 화면이 나온다.
        window.location.reload();
        return;
      }
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "비밀번호가 맞지 않습니다");
      setPassword("");
    } catch {
      setError("잠금을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요");
    }
    setChecking(false);
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 text-zinc-900">
      <h1 className="text-4xl font-bold tracking-tight">mpb챗봇</h1>
      <form onSubmit={handleSubmit} className="mt-8 flex w-72 flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="공용 비밀번호"
          aria-label="공용 비밀번호"
          autoFocus
          autoComplete="current-password"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={!password || checking}
          className="rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white disabled:bg-zinc-300"
        >
          들어가기
        </button>
        {/* 틀렸을 때만 보인다. 자리를 미리 잡아 두어 화면이 흔들리지 않게 한다. */}
        <p role="alert" className="min-h-5 text-center text-sm text-red-700">
          {error}
        </p>
      </form>
      {/* 대화 기록이 이 브라우저에 남으므로 미리 알린다. (PRD 7장) */}
      <p className="mt-2 text-sm text-zinc-500">공용 컴퓨터에서는 사용하지 마세요</p>
    </div>
  );
}
