// 질문을 받아 답변을 돌려주는 서버 쪽 코드 (DESIGN.md 2.2)
// 브라우저는 AI나 문서 저장소에 직접 접속하지 않고 이 주소로만 질문을 보낸다.

import { MAX_HISTORY_TURNS, buildSources, generateAnswer } from "@/lib/answer.ts";
import type { Turn } from "@/lib/answer.ts";
import { isUnlocked } from "@/lib/auth.ts";
import { searchChunksWithContext } from "@/lib/search.ts";

// 질문 하나의 최대 글자 수
const MAX_QUESTION_LENGTH = 1000;
// 직전 답 하나에서 AI에 다시 보내는 최대 글자 수
const MAX_HISTORY_ANSWER_LENGTH = 2000;

// 브라우저가 보낸 직전 대화에서 모양이 맞는 것만 골라, 마지막 3쌍까지만 남긴다.
function readHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const turns: Turn[] = [];
  for (const item of value) {
    const turn = item as { question?: unknown; answer?: unknown; kind?: unknown } | null;
    if (
      turn &&
      typeof turn.question === "string" &&
      typeof turn.answer === "string" &&
      turn.question.trim() &&
      turn.answer.trim()
    ) {
      turns.push({
        question: turn.question.trim().slice(0, MAX_QUESTION_LENGTH),
        answer: turn.answer.trim().slice(0, MAX_HISTORY_ANSWER_LENGTH),
        // 직전 답이 되묻기였는지만 쓰므로, 그 밖의 값은 받지 않는다.
        kind: turn.kind === "clarify" ? "clarify" : undefined,
      });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

export async function POST(request: Request) {
  // 화면뿐 아니라 이 주소도 잠금을 통과한 브라우저만 쓸 수 있다.
  if (!(await isUnlocked())) {
    return Response.json({ error: "잠금이 풀려 있지 않습니다." }, { status: 401 });
  }

  let question: unknown;
  let history: Turn[] = [];
  try {
    const body = (await request.json()) as { question?: unknown; history?: unknown };
    question = body.question;
    history = readHistory(body.history);
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
    const chunks = await searchChunksWithContext(question.trim(), history.at(-1));
    const answer = await generateAnswer(question.trim(), chunks, history);
    const { sources, hasMoreSources } = buildSources(answer, chunks);
    return Response.json({
      kind: answer.kind,
      answer: answer.text,
      sources,
      hasMoreSources,
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
