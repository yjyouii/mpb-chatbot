// 저장 기능 자체 점검: 시험용 글 1건을 넣어 보고, 확인한 뒤 바로 지운다.
// 문서 저장소에는 아무것도 남기지 않는다.
// 실행: npm run db:selftest

import { deleteDocument, saveDocument } from "../lib/documents.ts";
import { EMBEDDING_DIMENSIONS } from "../lib/embedding.ts";
import { dbRequest } from "../lib/supabase.ts";

// 실제 글 주소와 겹치지 않는 점검 전용 주소
const TEST_URL = "https://www.mpb.go.kr/web/main/bbs/b_0001/__selftest__";

// 묶음이 여러 개로 나뉘는지 보려고 문단을 여러 번 반복한다.
const paragraph =
  "이 글은 저장 기능을 점검하기 위한 시험용 글이다. 실제 보도자료가 아니며 점검이 끝나면 바로 지운다. 문단을 나누고 숫자로 바꾸는 과정이 제대로 동작하는지 확인한다.";
const body = Array.from({ length: 12 }, (_, i) => `${i + 1}번 문단. ${paragraph}`).join("\n\n");

let failed = false;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) {
    failed = true;
  }
  console.log(`${ok ? "✅" : "❌"} ${label}: ${detail}`);
}

// 지난 점검이 중간에 멈춰 남은 글이 있으면 먼저 지운다.
await deleteDocument(TEST_URL);

try {
  const first = await saveDocument({
    url: TEST_URL,
    title: "저장 기능 점검용 글",
    publishedDate: null,
    department: null,
    body,
    hasUnreadAttachment: false,
  });
  check(
    "문서 저장",
    first.status === "saved",
    first.status === "saved" ? `문단 묶음 ${first.chunkCount}개로 나눠 저장` : "저장되지 않음",
  );

  const docs = await dbRequest<{ id: number; department: string; published_date: string | null }[]>(
    `documents?select=id,department,published_date&url=eq.${encodeURIComponent(TEST_URL)}`,
  );
  check(
    "없는 값 처리",
    docs[0]?.department === "표기 없음" && docs[0]?.published_date === null,
    `담당 부서 "${docs[0]?.department}", 발표일 ${docs[0]?.published_date ?? "비어 있음"}`,
  );

  const chunks = await dbRequest<{ embedding: string }[]>(
    `chunks?select=embedding&document_id=eq.${docs[0]?.id}`,
  );
  const dimensions = chunks[0] ? (JSON.parse(chunks[0].embedding) as number[]).length : 0;
  check(
    "숫자로 바꾸기",
    chunks.length > 1 && dimensions === EMBEDDING_DIMENSIONS,
    `묶음 ${chunks.length}개, 숫자 길이 ${dimensions}`,
  );

  const second = await saveDocument({
    url: TEST_URL,
    title: "저장 기능 점검용 글",
    publishedDate: null,
    department: null,
    body,
    hasUnreadAttachment: false,
  });
  check("중복 방지", second.status === "skipped", "같은 주소를 다시 넣으면 건너뜀");
} finally {
  await deleteDocument(TEST_URL);
}

const left = await dbRequest<{ id: number }[]>(
  `documents?select=id&url=eq.${encodeURIComponent(TEST_URL)}`,
);
check("뒷정리", left.length === 0, "시험용 글을 지움");

console.log(failed ? "\n저장 기능에 문제가 있습니다." : "\n저장 기능 점검 완료.");
process.exit(failed ? 1 : 0);
