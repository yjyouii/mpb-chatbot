// 검색 시험: 질문과 뜻이 가까운 문단 묶음을 찾아 보여 준다. AI 답변은 만들지 않는다.
// 실행: npm run search -- "유가연동보조금 추가 지원 규모"

import { searchChunks } from "../lib/search.ts";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('❌ 질문을 적어 주세요. 예: npm run search -- "유가연동보조금 추가 지원 규모"');
  process.exit(1);
}

try {
  const chunks = await searchChunks(question);
  console.log(`질문: ${question}\n`);
  for (const [index, chunk] of chunks.entries()) {
    console.log(
      `${index + 1}. 가까운 정도 ${chunk.similarity.toFixed(3)} | ${chunk.publishedDate ?? "표기 없음"} | ${chunk.department} | ${chunk.title}`,
    );
    console.log(`   ${chunk.content.replace(/\s+/g, " ").slice(0, 110)}…`);
    console.log(`   ${chunk.url}\n`);
  }
  const documentCount = new Set(chunks.map((chunk) => chunk.documentId)).size;
  console.log(`문단 묶음 ${chunks.length}개를 찾았습니다. (서로 다른 문서 ${documentCount}건)`);
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
