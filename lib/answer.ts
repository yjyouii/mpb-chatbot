// 찾은 문단과 질문을 AI에 보내 답변을 받아 온다. (DESIGN.md 2.2의 ④, ⑤와 "규칙을 지키게 하는 장치")
// 서버 쪽 코드에서만 쓴다. API 키는 .env에서만 읽는다.

import type { MatchedChunk } from "./search.ts";

// 답변용 모델. 바꾸려면 이 한 줄만 고친다. (2026-10-12 확정, PLAN 작업 26에서 다시 비교)
export const ANSWER_MODEL = "gpt-6.1-sol";

// 답변 하나를 기다리는 최대 시간
const ANSWER_TIMEOUT_MS = 60000;

// 문서에서 답을 찾지 못했을 때 내보내는 문장. AI가 쓴 글 대신 항상 이 문장을 쓴다. (PRD 5장)
export const NOT_FOUND_TEXT = "자료에서 찾지 못했습니다";

// 답변 종류는 4가지로 고정한다.
export type AnswerKind = "answer" | "not_found" | "clarify" | "smalltalk";

export type Answer = {
  kind: AnswerKind;
  text: string;
  // 근거로 쓴 문서 번호. 관련이 높은 순서다. "answer"일 때만 채워진다.
  documentIds: number[];
};

const INSTRUCTIONS = `너는 기관 공식 홈페이지의 보도자료를 근거로 실무자의 질문에 답하는 도우미다.
사용자 메시지에는 검색으로 찾은 [문서]들과 질문이 들어 있다. 아래 규칙을 반드시 지킨다.

[근거]
- [문서]에 적힌 내용만 근거로 답한다. 네가 원래 알고 있는 일반 지식이나 추측을 보태지 않는다.
- [문서]는 검색으로 찾은 것이라 질문과 관련 없는 것이 섞여 있을 수 있다. 관련 없는 문서는 무시한다.

[답변 종류] kind는 아래 넷 중 하나로 정한다.
- "answer": [문서]에서 질문의 답을 찾았다. text에 답을 적고, document_ids에 실제로 근거로 쓴 문서의 번호를 관련이 높은 순서로 적는다. 근거로 쓰지 않은 문서의 번호는 적지 않는다.
- "not_found": [문서]에 질문의 답이 없다. text는 빈 글로, document_ids는 빈 목록으로 둔다. 답의 일부만 짐작할 수 있을 때도 지어내지 말고 이것을 고른다.
- "clarify": 질문이 너무 막연해 어떤 사업·연도·대상을 묻는지 알 수 없다. (예: "예산 알려줘") text에 무엇을 알려 주면 되는지 한 문장으로 되묻는다. document_ids는 빈 목록으로 둔다.
- "smalltalk": 인사이거나 이 챗봇의 사용법을 묻는 말이다. text에 짧게 답한다. 사용법은 "보도자료 내용을 문장으로 물어보면 출처와 함께 답한다"는 취지로 안내한다. document_ids는 빈 목록으로 둔다.

[숫자]
- 숫자, 날짜, 금액, 단위는 [문서]에 적힌 표기 그대로 옮긴다. 계산하거나 반올림하거나 단위를 바꾸지 않는다.

[문서끼리 내용이 다를 때]
- 발표일이 가장 최근인 문서를 기준으로 답하고, 이전 문서와 내용이 다르다는 점을 함께 알린다.
- 발표일이 "표기 없음"인 문서는 가장 오래된 것으로 본다.

[소관을 묻는 질문]
- 어느 부서 소관인지 묻는 질문에는 [문서]의 "담당 부서" 표기를 근거로 답한다.
- 담당 부서가 "표기 없음"이면 "담당 부서 표기 없음"이라고 답한다. 부서를 짐작해 적지 않는다.

[형식]
- 한국어로, 핵심부터 5문장 이내로 답한다.
- 별표(**) 같은 꾸밈 기호를 쓰지 않는다. "문서 12" 같은 문서 번호를 text에 적지 않는다.`;

// AI가 돌려줄 답의 모양. 이 모양을 벗어난 답은 나오지 않는다.
const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["answer", "not_found", "clarify", "smalltalk"] },
    text: { type: "string" },
    document_ids: { type: "array", items: { type: "integer" } },
  },
  required: ["kind", "text", "document_ids"],
  additionalProperties: false,
};

type ResponsesApiResult = {
  output?: {
    type: string;
    content?: { type: string; text?: string; refusal?: string }[];
  }[];
};

type RawAnswer = {
  kind: AnswerKind;
  text: string;
  document_ids: number[];
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

// AI가 돌려준 답을 서버가 한 번 더 확인한다. 규칙을 어긴 답이 화면으로 나가지 않게 한다.
export function validateAnswer(raw: RawAnswer, chunks: MatchedChunk[]): Answer {
  if (raw.kind === "not_found") {
    return { kind: "not_found", text: NOT_FOUND_TEXT, documentIds: [] };
  }
  if (raw.kind === "clarify" || raw.kind === "smalltalk") {
    const text = raw.text.trim();
    // 글이 비어 있으면 보여 줄 것이 없으므로 "찾지 못함"으로 처리한다.
    return text
      ? { kind: raw.kind, text, documentIds: [] }
      : { kind: "not_found", text: NOT_FOUND_TEXT, documentIds: [] };
  }

  // "answer": 실제로 찾아 준 문서의 번호만 남기고, 겹치는 번호는 합친다.
  const known = new Set(chunks.map((chunk) => chunk.documentId));
  const documentIds = [...new Set(raw.document_ids)].filter((id) => known.has(id));
  const text = raw.text.trim();
  // 근거 문서가 없는 답변은 내보내지 않는다. (출처 없는 답변 금지)
  if (!text || documentIds.length === 0) {
    return { kind: "not_found", text: NOT_FOUND_TEXT, documentIds: [] };
  }
  return { kind: "answer", text, documentIds };
}

export async function generateAnswer(question: string, chunks: MatchedChunk[]): Promise<Answer> {
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
      text: {
        format: { type: "json_schema", name: "answer", schema: ANSWER_SCHEMA, strict: true },
      },
    }),
    signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`AI 답변 요청 실패 (HTTP ${res.status}): ${await res.text()}`);
  }

  const result = (await res.json()) as ResponsesApiResult;
  // 응답의 output에는 답변 말고 다른 항목도 섞여 있으므로, 답변 글만 골라 잇는다.
  const json = (result.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!json) {
    throw new Error("AI가 답변을 돌려주지 않았습니다.");
  }
  return validateAnswer(JSON.parse(json) as RawAnswer, chunks);
}

// 답변 아래에 보여 줄 출처 하나
export type Source = {
  title: string;
  // "2026-09-29" 형식. 발표일이 없으면 "표기 없음"
  publishedDate: string;
  // 공식 홈페이지의 원문 주소
  url: string;
  hasUnreadAttachment: boolean;
};

// 출처는 최대 3개까지 보여 준다. (PRD 5장)
export const MAX_SOURCES = 3;

// 답변의 근거 문서 번호로 출처를 만든다.
// 제목·발표일·주소는 AI가 쓴 글이 아니라 문서 저장소에서 찾아온 값을 쓴다. AI가 주소를 지어낼 수 없다.
export function buildSources(
  answer: Answer,
  chunks: MatchedChunk[],
): { sources: Source[]; hasMoreSources: boolean } {
  const sources: Source[] = [];
  for (const documentId of answer.documentIds.slice(0, MAX_SOURCES)) {
    const chunk = chunks.find((item) => item.documentId === documentId);
    if (chunk) {
      sources.push({
        title: chunk.title,
        publishedDate: chunk.publishedDate ?? "표기 없음",
        url: chunk.url,
        hasUnreadAttachment: chunk.hasUnreadAttachment,
      });
    }
  }
  // 근거 문서가 4건 이상이면 앞의 3개만 보여 주고 "관련 문서가 더 있습니다"를 붙인다.
  return { sources, hasMoreSources: answer.documentIds.length > MAX_SOURCES };
}
