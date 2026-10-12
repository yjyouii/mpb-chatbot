// 가져오기의 실패 목록과 실행 기록을 다룬다. (DESIGN.md 2.1의 ⓪, ⑧, ⑨ / 3.4)

import { dbRequest } from "./supabase.ts";

export type IngestFailure = {
  url: string;
  reason: string;
};

// 지난 실행에서 본문을 읽지 못한 글의 목록
export async function listFailures(): Promise<IngestFailure[]> {
  return dbRequest<IngestFailure[]>("ingest_failures?select=url,reason&order=failed_at.asc");
}

// 실패한 글을 목록에 올린다. 이미 있으면 이유와 시각만 고친다.
export async function recordFailure(url: string, reason: string): Promise<void> {
  await dbRequest("ingest_failures", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: { url, reason: reason.slice(0, 500), failed_at: new Date().toISOString() },
  });
}

// 다시 가져오는 데 성공한 글을 실패 목록에서 지운다.
export async function clearFailure(url: string): Promise<void> {
  await dbRequest(`ingest_failures?url=eq.${encodeURIComponent(url)}`, {
    method: "DELETE",
  });
}

export type IngestRun = {
  successCount: number;
  failureCount: number;
  unreadAttachmentCount: number;
};

// 가져오기를 한 번 실행했다는 기록을 남긴다. 새 글이 없었어도 남긴다.
export async function recordRun(run: IngestRun): Promise<void> {
  await dbRequest("ingest_runs", {
    method: "POST",
    body: {
      success_count: run.successCount,
      failure_count: run.failureCount,
      unread_attachment_count: run.unreadAttachmentCount,
    },
  });
}

export type CorpusStatus = {
  // 들어 있는 문서 건수
  documentCount: number;
  // 마지막으로 가져오기를 실행한 시각. 한 번도 실행하지 않았으면 null
  lastRunAt: string | null;
};

// 화면 위쪽의 문서 건수와 "○월 ○일까지 가져온 자료 기준"에 쓸 값을 읽는다.
export async function getCorpusStatus(): Promise<CorpusStatus> {
  const [documents, runs] = await Promise.all([
    dbRequest<{ count: number }[]>("documents?select=count"),
    dbRequest<{ ran_at: string }[]>("ingest_runs?select=ran_at&order=ran_at.desc&limit=1"),
  ]);
  return {
    documentCount: documents[0]?.count ?? 0,
    lastRunAt: runs[0]?.ran_at ?? null,
  };
}
