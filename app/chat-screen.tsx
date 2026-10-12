"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import {
  clearConversations,
  getConversations,
  getServerConversations,
  saveConversation,
  subscribe,
} from "./conversation-store";
import type { Conversation, Message, Source } from "./conversation-store";

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
  // 브라우저에 저장된 지난 대화 목록. 저장된 내용이 바뀌면 자동으로 다시 그려진다.
  const conversations = useSyncExternalStore(subscribe, getConversations, getServerConversations);
  // 지금 열려 있는 대화의 번호. 새 대화이고 아직 질문을 보내지 않았으면 null
  const [conversationId, setConversationId] = useState<string | null>(null);
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
    // 새 대화의 첫 질문이면 이 대화에 번호를 붙인다.
    const id = conversationId ?? crypto.randomUUID();
    setConversationId(id);
    const userMessage: Message = { id: nextId.current, role: "user", text };
    const answerId = nextId.current + 1;
    setMessages((previous) => [
      ...previous,
      userMessage,
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
      const answerMessage: Message = {
        id: answerId,
        role: "assistant",
        text: data.answer,
        kind: data.kind,
        sources: data.sources ?? [],
        hasMoreSources: data.hasMoreSources ?? false,
      };
      replaceAnswer(answerMessage.text, { ...answerMessage, unfinished: false });
      // 끝까지 주고받은 질문과 답을 브라우저에 저장한다.
      saveConversation(id, [...messages, userMessage, answerMessage]);
    } catch (error) {
      replaceAnswer(error instanceof Error && error.message ? error.message : FAILED);
      // 오류가 나면 입력한 질문을 지우지 않고 입력 칸에 되돌려 놓는다.
      setQuestion((current) => current || text);
    } finally {
      setWaiting(false);
    }
  }

  // 지난 대화를 다시 연다.
  function openConversation(conversation: Conversation) {
    setConversationId(conversation.id);
    setMessages(conversation.messages);
    nextId.current = Math.max(-1, ...conversation.messages.map((message) => message.id)) + 1;
    setQuestion("");
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    nextId.current = 0;
    setQuestion("");
  }

  function deleteAllConversations() {
    if (!window.confirm("저장된 대화 기록을 모두 지울까요? 지우면 되돌릴 수 없습니다.")) {
      return;
    }
    clearConversations();
    startNewConversation();
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
        {/* ② 왼쪽 줄: 새 대화, 지난 대화 목록, 전체 삭제 */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4">
          <button
            type="button"
            onClick={startNewConversation}
            disabled={waiting}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-400"
          >
            + 새 대화
          </button>

          <h2 className="mt-5 text-sm font-semibold text-zinc-700">지난 대화</h2>
          {conversations.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">아직 저장된 대화가 없습니다.</p>
          ) : (
            <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(conversation)}
                    disabled={waiting}
                    aria-current={conversation.id === conversationId ? "true" : undefined}
                    className={
                      conversation.id === conversationId
                        ? "w-full truncate rounded-lg bg-zinc-200 px-3 py-2 text-left text-sm font-medium"
                        : "w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100"
                    }
                  >
                    {conversation.title}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={deleteAllConversations}
            disabled={waiting || conversations.length === 0}
            className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:text-zinc-400 disabled:hover:bg-transparent"
          >
            전체 삭제
          </button>
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
