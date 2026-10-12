// 개인정보 다시 거르기: 거르는 규칙(lib/redact.ts)을 고친 뒤,
// 이미 저장된 문서에 새 규칙을 다시 적용한다. 홈페이지에는 접속하지 않는다.
// 내용이 달라진 문서만 지우고 다시 넣는다. (문단 묶음과 숫자도 새로 만든다)
//
// 달라질 문서만 보기: npm run db:reredact -- --dry-run
// 실제로 적용:        npm run db:reredact

import { deleteDocument, saveDocument } from "../lib/documents.ts";
import { recordFailure } from "../lib/ingest-log.ts";
import { redactPersonalInfo } from "../lib/redact.ts";
import { dbRequest } from "../lib/supabase.ts";

type StoredDocument = {
  url: string;
  title: string;
  published_date: string | null;
  department: string;
  body: string;
  has_unread_attachment: boolean;
};

const dryRun = process.argv.includes("--dry-run");

const documents = await dbRequest<StoredDocument[]>(
  "documents?select=url,title,published_date,department,body,has_unread_attachment&order=id.asc",
);
console.log(`저장된 문서 ${documents.length}건에 거르는 규칙을 다시 적용합니다.\n`);

let changed = 0;
let failed = 0;

for (const doc of documents) {
  const body = redactPersonalInfo(doc.body).text;
  if (body === doc.body) {
    continue;
  }
  changed++;
  console.log(`${dryRun ? "달라질 문서" : "다시 넣는 문서"}: ${doc.title} (${doc.body.length - body.length}글자 줄어듦)`);
  if (dryRun) {
    continue;
  }
  try {
    await deleteDocument(doc.url);
    await saveDocument({
      url: doc.url,
      title: doc.title,
      publishedDate: doc.published_date,
      department: doc.department,
      body,
      hasUnreadAttachment: doc.has_unread_attachment,
    });
  } catch (error) {
    failed++;
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ 다시 넣지 못했습니다: ${reason}`);
    // 실패 목록에 올려, 다음 가져오기 때 홈페이지에서 다시 가져오게 한다.
    await recordFailure(doc.url, `다시 거르기 실패: ${reason}`).catch(() => {});
  }
}

console.log(
  dryRun
    ? `\n달라질 문서 ${changed}건. 저장소는 바꾸지 않았습니다. (--dry-run)`
    : `\n다시 넣은 문서 ${changed - failed}건 / 실패 ${failed}건 / 그대로 둔 문서 ${documents.length - changed}건`,
);
process.exit(failed > 0 ? 1 : 0);
