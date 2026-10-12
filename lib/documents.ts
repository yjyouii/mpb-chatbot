// 문서 1건을 문단 묶음으로 나누고 숫자로 바꿔 문서 저장소에 넣는다.
// (DESIGN.md 2.1의 ②, ⑦ / 3.4 "저장할 자료의 모양")

import { splitIntoChunks } from "./chunk.ts";
import { embedTexts } from "./embedding.ts";
import { dbRequest } from "./supabase.ts";

export const NOT_STATED = "표기 없음";

export type NewDocument = {
  // 원문 주소. 같은 글이 두 번 들어가지 않게 하는 기준이다.
  url: string;
  title: string | null;
  // "2026-09-12" 형식. 없으면 null
  publishedDate: string | null;
  department: string | null;
  // 게시글 본문 + PDF에서 읽은 글자 (담당자 실명·전화번호를 걸러 낸 것)
  body: string;
  hasUnreadAttachment: boolean;
};

export type SaveResult =
  | { status: "saved"; documentId: number; chunkCount: number }
  | { status: "skipped" };

export async function documentExists(url: string): Promise<boolean> {
  const rows = await dbRequest<{ id: number }[]>(
    `documents?select=id&url=eq.${encodeURIComponent(url)}`,
  );
  return rows.length > 0;
}

export async function deleteDocument(url: string): Promise<void> {
  // 문단 묶음은 문서를 지우면 함께 지워진다.
  await dbRequest(`documents?url=eq.${encodeURIComponent(url)}`, {
    method: "DELETE",
  });
}

export async function saveDocument(doc: NewDocument): Promise<SaveResult> {
  // 이미 저장된 글은 다시 넣지 않는다.
  if (await documentExists(doc.url)) {
    return { status: "skipped" };
  }

  const title = doc.title?.trim() || NOT_STATED;
  const chunks = splitIntoChunks(doc.body);
  if (chunks.length === 0) {
    throw new Error("본문이 비어 있어 저장할 수 없습니다.");
  }

  // 제목을 함께 넣어 숫자로 바꾸면 조각만 봤을 때보다 뜻이 잘 잡힌다.
  // 저장하는 조각 글에는 제목을 붙이지 않는다.
  const embeddings = await embedTexts(
    chunks.map((chunk) => `제목: ${title}\n\n${chunk}`),
  );

  const [saved] = await dbRequest<{ id: number }[]>("documents", {
    method: "POST",
    prefer: "return=representation",
    body: {
      url: doc.url,
      title,
      published_date: doc.publishedDate,
      department: doc.department?.trim() || NOT_STATED,
      body: doc.body,
      has_unread_attachment: doc.hasUnreadAttachment,
    },
  });

  try {
    await dbRequest("chunks", {
      method: "POST",
      body: chunks.map((content, index) => ({
        document_id: saved.id,
        chunk_index: index,
        content,
        embedding: JSON.stringify(embeddings[index]),
      })),
    });
  } catch (error) {
    // 문단 묶음 없이 문서만 남으면 검색되지 않는 글이 되므로 되돌린다.
    await deleteDocument(doc.url);
    throw error;
  }

  return { status: "saved", documentId: saved.id, chunkCount: chunks.length };
}
