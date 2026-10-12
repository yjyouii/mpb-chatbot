"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

// 답변 기능이 연결되기 전까지 보여 주는 임시 문구 (PLAN 작업 17~18에서 실제 답변으로 바뀐다)
const NOT_CONNECTED_YET = "아직 답변 기능이 연결되지 않았습니다.";

export default function ChatScreen({ corpusLabel }: { corpusLabel: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 말풍선이 생기면 맨 아래가 보이게 한다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function send() {
    const text = question.trim();
    if (!text) {
      return;
    }
    setMessages((previous) => [
      ...previous,
      { id: previous.length, role: "user", text },
      { id: previous.length + 1, role: "assistant", text: NOT_CONNECTED_YET },
    ]);
    setQuestion("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter로 보내고, Shift+Enter로 줄을 바꾼다.
    // 한글을 조합하는 중의 Enter는 글자를 확정하는 것이므로 보내지 않는다.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900">
      {/* ① 위쪽 줄: 앱 이름, 문서 건수와 기준 날짜 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6">
        <h1 className="text-lg font-bold tracking-tight">mpb챗봇</h1>
        <p className="text-sm text-zinc-600">{corpusLabel}</p>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ② 왼쪽 줄: 지난 대화 (목록·새 대화·전체 삭제는 PLAN 작업 23~24에서 채운다) */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700">지난 대화</h2>
          <p className="mt-3 text-sm text-zinc-400">아직 저장된 대화가 없습니다.</p>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* ③④ 가운데: 질문과 답변 */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-lg text-zinc-500">보도자료 내용을 문장으로 물어보세요.</p>
              </div>
            ) : (
              <ul className="mx-auto flex max-w-3xl flex-col gap-4">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <p
                      className={
                        message.role === "user"
                          ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2.5 text-white"
                          : "max-w-[80%] whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white px-4 py-2.5"
                      }
                    >
                      {message.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ⑥⑦ 맨 아래: 질문 입력 칸과 안내 */}
          <div className="shrink-0 border-t border-zinc-200 bg-white px-8 py-4">
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-end gap-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="궁금한 내용을 문장으로 적어 주세요"
                aria-label="질문 입력"
                className="min-h-[3.25rem] flex-1 resize-none rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
              />
              <button
                type="submit"
                disabled={!question.trim()}
                className="h-[3.25rem] shrink-0 rounded-xl bg-zinc-900 px-5 font-medium text-white disabled:bg-zinc-300"
              >
                보내기
              </button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl text-sm text-zinc-500">
              개인정보나 비공개 내용은 적지 마세요
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
