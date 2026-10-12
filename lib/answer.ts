// 찾은 문단과 질문을 AI에 보내 답변을 받아 온다. (DESIGN.md 2.2의 ④, ⑤)
// 서버 쪽 코드에서만 쓴다. API 키는 .env에서만 읽는다.

import type { MatchedChunk } from "./search.ts";

// 답변용 모델. 바꾸려면 이 한 줄만 고친다. (2026-10-12 확정, PLAN 작업 26에서 다시 비교)
export const ANSWER_MODEL = "gpt-6.1-sol";

// 답변 하나를 기다리는 최대 시간
const ANSWER_TIMEOUT_MS = 60000;

const INSTRUCTIONS = `너는 기관 공식 홈페이지의 보도자료를 근거로 실무자의 질문에 답하는 도우미다.
아래에 주어진 [문서]의 내용만 근거로 한국어로 답한다. 네가 원래 알고 있는 일반 지식을 보태지 않는다.
핵심부터 5문장 이내로 답한다.
별표(**) 같은 꾸밈 기호를 쓰지 않고, "문서 12" 같은 문서 번호를 답에 적지 않는다.`;

type ResponsesApiResult = {
  output?: {
    type: string;
    content?: { type: string; text?: string; refusal?: string }[];
  }[];
};

// 찾은 문단 묶음을 문서별로 모아 AI가 읽을 글로 만든다.
// 문서마다 번호, 제목, 발표일, 담당 부서를 함께 적는다.
export function formatContext(chunks: MatchedChunk[]): string {
  const byDocument = new Map<number, MatchedChunk[]>();
  for (const chunk of chunks) {
    byDocument.set(chunk.documentId, [...(byDocument.get(chunk.documentId) ?? []), chunk]);
  }
  return [...byDocument.entries()]
    .map(([documentId, parts]) => {
      const first = parts[0];
      return [
        `[문서 ${documentId}]`,
        `제목: ${first.title}`,
        `발표일: ${first.publishedDate ?? "표기 없음"}`,
        `담당 부서: ${first.department}`,
        "내용:",
        parts.map((part) => part.content).join("\n(중략)\n"),
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export async function generateAnswer(question: string, chunks: MatchedChunk[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(".env에 OPENAI_API_KEY가 없습니다.");
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      reasoning: { effort: "low" },
      instructions: INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: `${formatContext(chunks)}\n\n===\n\n질문: ${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`AI 답변 요청 실패 (HTTP ${res.status}): ${await res.text()}`);
  }

  const result = (await res.json()) as ResponsesApiResult;
  // 응답의 output에는 답변 말고 다른 항목도 섞여 있으므로, 답변 글만 골라 잇는다.
  const text = (result.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error("AI가 답변 글을 돌려주지 않았습니다.");
  }
  return text;
}
