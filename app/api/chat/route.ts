// 질문을 받아 답변을 돌려주는 서버 쪽 코드 (DESIGN.md 2.2)
// 브라우저는 AI나 문서 저장소에 직접 접속하지 않고 이 주소로만 질문을 보낸다.

import { generateAnswer } from "@/lib/answer.ts";
import { searchChunks } from "@/lib/search.ts";

// 질문 하나의 최대 글자 수
const MAX_QUESTION_LENGTH = 1000;

export async function POST(request: Request) {
  let question: unknown;
  try {
    question = ((await request.json()) as { question?: unknown }).question;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "질문을 적어 주세요." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { error: `질문은 ${MAX_QUESTION_LENGTH}글자 이내로 적어 주세요.` },
      { status: 400 },
    );
  }

  try {
    const chunks = await searchChunks(question.trim());
    const answer = await generateAnswer(question.trim(), chunks);
    return Response.json({
      kind: answer.kind,
      answer: answer.text,
      documentIds: answer.documentIds,
    });
  } catch (error) {
    // 자세한 오류는 서버 기록에만 남기고, 화면에는 일반 문구만 보낸다.
    console.error("[api/chat]", error);
    return Response.json(
      { error: "답변을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요" },
      { status: 500 },
    );
  }
}
