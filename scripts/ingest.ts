// 자료 가져오기 (관리자가 자기 컴퓨터에서 직접 실행한다)
//
// 최신 글 가져오기:   npm run ingest            (최신 150건을 훑어 새 글만 저장)
// 일부만 가져오기:    npm run ingest -- --limit 20
// 주소만 모아 보기:   npm run ingest -- --list-only
// 글 1건 읽어 보기:   npm run ingest -- --url <글 주소> --dry-run
// 글 1건 읽어 저장:   npm run ingest -- --url <글 주소>
//
// 아직 PDF 첨부를 읽지 않는다. (PLAN 작업 11에서 추가)

import { collectLatestPosts, fetchPost } from "../lib/board.ts";
import { NOT_STATED, documentExists, saveDocument } from "../lib/documents.ts";

// 한 번 실행할 때 훑어보는 최신 글의 수
const DEFAULT_LIMIT = 150;
// 임시 안전장치: 아직 PDF를 읽지 않아 본문만 저장되므로, 그 전에는 이 건수까지만 가져온다.
// PDF 읽기와 개인정보 거르기가 끝나면 이 제한을 없앤다.
const TRIAL_LIMIT = 20;

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

// 최신 글부터 limit건까지 훑으며, 아직 저장되지 않은 글만 열어 저장한다.
async function ingestLatest(limit: number) {
  console.log(`"보도자료" 게시판의 최신 글 ${limit}건을 가져옵니다. (요청 사이 1초 이상 쉼)\n`);

  const summaries = await collectLatestPosts(limit);
  console.log(`목록에서 주소 ${summaries.length}건을 모았습니다. 글을 하나씩 엽니다.\n`);

  let saved = 0;
  let skipped = 0;
  const failures: { url: string; reason: string }[] = [];

  for (const [index, summary] of summaries.entries()) {
    const label = `[${String(index + 1).padStart(3)}/${summaries.length}]`;
    try {
      // 이미 저장된 글은 홈페이지에서 다시 열지 않는다.
      if (await documentExists(summary.url)) {
        skipped++;
        console.log(`${label} ⏭️ 이미 있음 | ${summary.title}`);
        continue;
      }
      const post = await fetchPost(summary.url);
      await saveDocument({
        url: post.url,
        title: post.title,
        publishedDate: post.publishedDate,
        department: post.department,
        body: post.body,
        hasUnreadAttachment: post.attachments.length > 0,
      });
      saved++;
      console.log(`${label} ✅ 저장 | ${post.title ?? NOT_STATED}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ url: summary.url, reason });
      console.log(`${label} ❌ 실패 | ${summary.title}\n        ${reason}`);
    }
  }

  console.log(`\n성공 ${saved}건 / 실패 ${failures.length}건 (이미 있어 건너뛴 글 ${skipped}건)`);
  for (const failure of failures) {
    console.log(`  실패: ${failure.url}`);
  }
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
  console.log("주소만 모았습니다. 저장하지 않았습니다. (--list-only)");
}

try {
  const url = readOption("--url");
  if (url !== null) {
    await ingestOne(url, process.argv.includes("--dry-run"));
  } else if (process.argv.includes("--list-only")) {
    await listLatest(readLimit());
  } else {
    const limit = readLimit();
    if (limit > TRIAL_LIMIT) {
      throw new Error(
        `PDF 읽기(PLAN 작업 11)와 개인정보 거르기(작업 12)가 끝나기 전에는 ${TRIAL_LIMIT}건까지만 시험할 수 있습니다. 예: npm run ingest -- --limit ${TRIAL_LIMIT}`,
      );
    }
    await ingestLatest(limit);
  }
} catch (error) {
  // 긴 오류 기록 대신 무엇이 문제인지 한 줄로 보여 준다.
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
