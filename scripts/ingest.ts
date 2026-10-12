// 자료 가져오기 (관리자가 자기 컴퓨터에서 직접 실행한다)
//
// 목록 모으기:        npm run ingest
// 일부만 모으기:      npm run ingest -- --limit 20
// 글 1건 읽어 보기:   npm run ingest -- --url <글 주소> --dry-run
// 글 1건 읽어 저장:   npm run ingest -- --url <글 주소>
//
// 지금은 목록에서 주소를 모으는 단계(PLAN 작업 8)와 글 1건을 읽어 저장하는 단계(작업 9)까지 한다.
// 150건을 이어서 가져오는 단계는 다음 작업에서 붙인다.

import { collectLatestPosts, fetchPost } from "../lib/board.ts";
import { NOT_STATED, saveDocument } from "../lib/documents.ts";

// 한 번 실행할 때 훑어보는 최신 글의 수
const DEFAULT_LIMIT = 150;

// "--이름 값" 꼴로 적은 값을 읽는다. 없으면 null
function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? "");
}

function readLimit(): number {
  const raw = readOption("--limit");
  if (raw === null) {
    return DEFAULT_LIMIT;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > DEFAULT_LIMIT) {
    throw new Error(`--limit 뒤에는 1부터 ${DEFAULT_LIMIT}까지의 숫자를 적어 주세요.`);
  }
  return value;
}

// 글 1건을 읽어 보여 주고, dryRun이 아니면 저장한다.
async function ingestOne(href: string, dryRun: boolean) {
  const post = await fetchPost(href);

  console.log(`원문 주소: ${post.url}`);
  console.log(`제목: ${post.title ?? NOT_STATED}`);
  console.log(`발표일: ${post.publishedDate ?? NOT_STATED}`);
  console.log(`담당 부서: ${post.department ?? NOT_STATED}`);
  console.log(`첨부파일 ${post.attachments.length}개`);
  for (const attachment of post.attachments) {
    console.log(`  - ${attachment.name}`);
  }
  console.log(`본문 (${post.body.length}글자):\n${post.body}\n`);

  if (dryRun) {
    console.log("읽기만 했습니다. 저장하지 않았습니다. (--dry-run)");
    return;
  }

  const result = await saveDocument({
    url: post.url,
    title: post.title,
    publishedDate: post.publishedDate,
    department: post.department,
    body: post.body,
    // 아직 첨부파일을 읽지 않으므로, 첨부가 있으면 읽지 못한 것으로 표시한다.
    // PDF를 읽는 단계(PLAN 작업 11)에서 실제로 읽었는지에 따라 정하도록 바꾼다.
    hasUnreadAttachment: post.attachments.length > 0,
  });
  console.log(
    result.status === "saved"
      ? `✅ 저장했습니다. (문단 묶음 ${result.chunkCount}개)`
      : "⏭️ 이미 저장된 글이라 건너뛰었습니다.",
  );
}

// 목록에서 최신 글의 주소를 모아 보여 준다.
async function listLatest(limit: number) {
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
}

try {
  const url = readOption("--url");
  if (url !== null) {
    await ingestOne(url, process.argv.includes("--dry-run"));
  } else {
    await listLatest(readLimit());
  }
} catch (error) {
  // 긴 오류 기록 대신 무엇이 문제인지 한 줄로 보여 준다.
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
