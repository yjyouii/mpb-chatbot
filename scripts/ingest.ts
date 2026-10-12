// 자료 가져오기 (관리자가 자기 컴퓨터에서 직접 실행한다)
// 실행: npm run ingest
// 일부만 시험: npm run ingest -- --limit 20
//
// 지금은 "보도자료" 게시판 목록에서 최신 글의 주소를 모으는 단계까지만 한다. (PLAN 작업 8)
// 글을 열어 저장하는 단계는 다음 작업에서 붙인다.

import { collectLatestPosts } from "../lib/board.ts";

// 한 번 실행할 때 훑어보는 최신 글의 수
const DEFAULT_LIMIT = 150;

function readLimit(): number {
  const index = process.argv.indexOf("--limit");
  if (index === -1) {
    return DEFAULT_LIMIT;
  }
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > DEFAULT_LIMIT) {
    throw new Error(`--limit 뒤에는 1부터 ${DEFAULT_LIMIT}까지의 숫자를 적어 주세요.`);
  }
  return value;
}

const limit = readLimit();
console.log(`"보도자료" 게시판에서 최신 글 ${limit}건의 주소를 모읍니다. (요청 사이 1초 이상 쉼)\n`);

const posts = await collectLatestPosts(limit);

for (const [index, post] of posts.entries()) {
  console.log(
    `${String(index + 1).padStart(3)}. ${post.publishedDate} | ${post.department} | ${post.title}\n     ${post.url}`,
  );
}

const withoutDepartment = posts.filter((post) => !post.department).length;
const withoutDate = posts.filter((post) => !/^\d{4}-\d{2}-\d{2}$/.test(post.publishedDate)).length;

console.log(`\n주소 ${posts.length}건을 모았습니다.`);
console.log(`담당 부서가 비어 있는 글 ${withoutDepartment}건, 발표일을 읽지 못한 글 ${withoutDate}건`);
console.log("아직 글을 열어 저장하지는 않습니다. (다음 작업에서 추가)");
