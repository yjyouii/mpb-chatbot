"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

// 답변 아래에 보여 주는 출처 하나. 서버가 문서 저장소에서 꺼내 준 값이다.
type Source = {
  title: string;
  publishedDate: string;
  url: string;
  hasUnreadAttachment: boolean;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  // 답변의 종류. 서버가 알려 준 값이다. (answer, not_found, clarify, smalltalk)
  kind?: string;
  sources?: Source[];
  hasMoreSources?: boolean;
  // 답변을 기다리는 중이거나 오류로 끝난 말풍선. 직전 대화로 보내지 않는다.
  unfinished?: boolean;
};

// 이어지는 질문을 이해하도록 함께 보내는 직전 질문·답의 최대 쌍 수 (PRD 5장)
const MAX_HISTORY_TURNS = 3;

type HistoryTurn = { question: string; answer: string; kind?: string };

// 지금까지의 말풍선에서 끝까지 주고받은 질문·답 쌍을 골라 마지막 3쌍을 돌려준다.
function collectHistory(messages: Message[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (let index = 0; index + 1 < messages.length; index++) {
    const question = messages[index];
    const answer = messages[index + 1];
    if (question.role === "user" && answer.role === "assistant" && !answer.unfinished) {
      turns.push({ question: question.text, answer: answer.text, kind: answer.kind });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

type ChatResponse = {
  kind?: string;
  answer?: string;
  sources?: Source[];
  hasMoreSources?: boolean;
  error?: string;
};

const SEARCHING = "자료에서 찾는 중입니다…";
const FAILED = "답변을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요";

export default function ChatScreen({ corpusLabel }: { corpusLabel: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  // 답변을 기다리는 동안에는 새 질문을 보내지 못하게 한다.
  const [waiting, setWaiting] = useState(false);
  const nextId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 말풍선이 생기면 맨 아래가 보이게 한다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const text = question.trim();
    if (!text || waiting) {
      return;
    }
    const history = collectHistory(messages);
    const answerId = nextId.current + 1;
    setMessages((previous) => [
      ...previous,
      { id: nextId.current, role: "user", text },
      { id: answerId, role: "assistant", text: SEARCHING, unfinished: true },
    ]);
    nextId.current += 2;
    setQuestion("");
    setWaiting(true);

    // 기다리는 말풍선을 답변(또는 오류 문구)으로 바꾼다.
    const replaceAnswer = (answer: string, extra: Partial<Message> = {}) =>
      setMessages((previous) =>
        previous.map((message) =>
          message.id === answerId ? { ...message, text: answer, ...extra } : message,
        ),
      );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history }),
      });
      const data = (await res.json()) as ChatResponse;
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? FAILED);
      }
      replaceAnswer(data.answer, {
        kind: data.kind,
        sources: data.sources ?? [],
        hasMoreSources: data.hasMoreSources ?? false,
        unfinished: false,
      });
    } catch (error) {
      replaceAnswer(error instanceof Error && error.message ? error.message : FAILED);
      // 오류가 나면 입력한 질문을 지우지 않고 입력 칸에 되돌려 놓는다.
      setQuestion((current) => current || text);
    } finally {
      setWaiting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter로 보내고, Shift+Enter로 줄을 바꾼다.
    // 한글을 조합하는 중의 Enter는 글자를 확정하는 것이므로 보내지 않는다.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
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
                    {message.role === "user" ? (
                      <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2.5 text-white">
                        {message.text}
                      </p>
                    ) : (
                      <div className="max-w-[80%] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5">
                        <p className="whitespace-pre-wrap">{message.text}</p>
                        {/* ⑤ 출처: 누르면 공식 홈페이지의 해당 글이 새 창으로 열린다. */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-3 border-t border-zinc-200 pt-2.5 text-sm">
                            <p className="font-semibold text-zinc-700">출처</p>
                            <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
                              {message.sources.map((source) => (
                                <li key={source.url}>
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-700 underline-offset-2 hover:underline"
                                  >
                                    {source.title} · {source.publishedDate} ↗
                                  </a>
                                  {source.hasUnreadAttachment && (
                                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                      읽지 못한 첨부 있음
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                            {message.hasMoreSources && (
                              <p className="mt-1.5 text-zinc-500">관련 문서가 더 있습니다</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                disabled={!question.trim() || waiting}
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
