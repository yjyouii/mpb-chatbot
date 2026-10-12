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

export async function searchChunks(
  question: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
): Promise<MatchedChunk[]> {
  const [embedding] = await embedTexts([question]);
  const rows = await dbRequest<MatchRow[]>("rpc/match_chunks", {
    method: "POST",
    body: { query_embedding: JSON.stringify(embedding), match_count: matchCount },
  });
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    content: row.content,
    similarity: row.similarity,
    url: row.url,
    title: row.title,
    publishedDate: row.published_date,
    department: row.department,
    hasUnreadAttachment: row.has_unread_attachment,
  }));
}
