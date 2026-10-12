import { isUnlocked } from "@/lib/auth.ts";
import { getCorpusStatus } from "@/lib/ingest-log.ts";

import ChatScreen from "./chat-screen";
import LockScreen from "./lock-screen";

// "10월 6일"처럼 한국 시각 기준의 월·일을 만든다.
function formatMonthDay(isoTime: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(new Date(isoTime));
}

// 화면 위쪽에 보여 줄 "문서 N건 · ○월 ○일까지 가져온 자료 기준" 문구를 만든다.
async function readCorpusLabel(): Promise<string> {
  try {
    const status = await getCorpusStatus();
    if (!status.lastRunAt) {
      return `문서 ${status.documentCount}건 · 아직 가져온 자료가 없습니다`;
    }
    return `문서 ${status.documentCount}건 · ${formatMonthDay(status.lastRunAt)}까지 가져온 자료 기준`;
  } catch {
    return "문서 정보를 읽지 못했습니다";
  }
}

export default async function Home() {
  // 통과 표시(쿠키)를 읽으므로 이 화면은 접속할 때마다 새로 그려진다.
  // 잠금을 통과하지 않은 브라우저에는 잠금 화면만 보낸다. 문서 정보도 읽지 않는다.
  if (!(await isUnlocked())) {
    return <LockScreen />;
  }

  const corpusLabel = await readCorpusLabel();
  return <ChatScreen corpusLabel={corpusLabel} />;
}
