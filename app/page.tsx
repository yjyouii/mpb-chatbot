import { connection } from "next/server";

import { getCorpusStatus } from "@/lib/ingest-log.ts";

import ChatScreen from "./chat-screen";

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
  // 문서 건수와 기준 날짜는 접속할 때마다 새로 읽는다. (빌드할 때의 값으로 굳지 않게 한다)
  await connection();
  const corpusLabel = await readCorpusLabel();

  return <ChatScreen corpusLabel={corpusLabel} />;
}
