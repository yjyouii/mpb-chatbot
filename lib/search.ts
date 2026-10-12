// 질문과 뜻이 가까운 문단 묶음을 문서 저장소에서 찾는다. (DESIGN.md 2.2의 ②, ③)
// 서버 쪽 코드에서만 쓴다.

import { embedTexts } from "./embedding.ts";
import { dbRequest } from "./supabase.ts";

// 한 번에 찾아오는 문단 묶음의 수. 정답률을 재면서 조정한다. (PLAN 작업 26)
export const DEFAULT_MATCH_COUNT = 8;

export type MatchedChunk = {
  chunkId: number;
  documentId: number;
  content: string;
  // 1에 가까울수록 질문과 뜻이 가깝다.
  similarity: number;
  url: string;
  title: string;
  // "2026-09-29" 형식. 발표일이 없으면 null
  publishedDate: string | null;
  department: string;
  hasUnreadAttachment: boolean;
};

type MatchRow = {
  chunk_id: number;
  document_id: number;
  content: string;
  similarity: number;
  url: string;
  title: string;
  published_date: string | null;
  department: string;
  has_unread_attachment: boolean;
};

function toMatchedChunk(row: MatchRow): MatchedChunk {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    content: row.content,
    similarity: row.similarity,
    url: row.url,
    title: row.title,
    publishedDate: row.published_date,
    department: row.department,
    hasUnreadAttachment: row.has_unread_attachment,
  };
}

// 숫자로 바꾼 질문 하나로 가까운 문단 묶음을 찾는다.
async function matchChunks(embedding: number[], matchCount: number): Promise<MatchedChunk[]> {
  const rows = await dbRequest<MatchRow[]>("rpc/match_chunks", {
    method: "POST",
    body: { query_embedding: JSON.stringify(embedding), match_count: matchCount },
  });
  return rows.map(toMatchedChunk);
}

export async function searchChunks(
  question: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
): Promise<MatchedChunk[]> {
  const [embedding] = await embedTexts([question]);
  return matchChunks(embedding, matchCount);
}

// 이어지는 질문을 위한 검색.
// "그건 어느 부서 담당이야?"는 그것만으로는 무엇을 찾을지 알 수 없으므로,
// 직전 질문과 답의 앞부분을 붙인 글로도 한 번 더 찾는다.
// 반대로 주제를 바꾼 질문은 직전 대화를 붙이면 엉뚱한 문서가 잡히므로,
// 질문만으로 찾은 결과와 번갈아 섞어 양쪽을 모두 담는다.
export async function searchChunksWithContext(
  question: string,
  previous: { question: string; answer: string } | undefined,
  matchCount: number = DEFAULT_MATCH_COUNT,
): Promise<MatchedChunk[]> {
  if (!previous) {
    return searchChunks(question, matchCount);
  }
  const withContext = [previous.question, previous.answer.slice(0, 200), question].join("\n");
  const [questionEmbedding, contextEmbedding] = await embedTexts([question, withContext]);
  const [byQuestion, byContext] = await Promise.all([
    matchChunks(questionEmbedding, matchCount),
    matchChunks(contextEmbedding, matchCount),
  ]);

  const merged: MatchedChunk[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < matchCount && merged.length < matchCount; index++) {
    for (const chunk of [byQuestion[index], byContext[index]]) {
      if (chunk && !seen.has(chunk.chunkId) && merged.length < matchCount) {
        seen.add(chunk.chunkId);
        merged.push(chunk);
      }
    }
  }
  return merged;
}
