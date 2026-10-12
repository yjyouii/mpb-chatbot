// 자료 가져오기 (관리자가 자기 컴퓨터에서 직접 실행한다)
//
// 최신 글 가져오기:   npm run ingest            (최신 150건을 훑어 새 글만 저장)
// 일부만 가져오기:    npm run ingest -- --limit 20
// 주소만 모아 보기:   npm run ingest -- --list-only
// 글 1건 읽어 보기:   npm run ingest -- --url <글 주소> --dry-run
// 글 1건 읽어 저장:   npm run ingest -- --url <글 주소>
//
// 게시글 본문과 PDF 첨부를 읽는다. 한글(HWP·HWPX) 등 다른 형식의 첨부는 건너뛴다.

import { readAttachments } from "../lib/attachments.ts";
import type { AttachmentResult } from "../lib/attachments.ts";
import { collectLatestPosts, fetchPost } from "../lib/board.ts";
import type { Post } from "../lib/board.ts";
import { NOT_STATED, documentExists, saveDocument } from "../lib/documents.ts";
import type { NewDocument } from "../lib/documents.ts";
import {
  clearFailure,
  getCorpusStatus,
  listFailures,
  recordFailure,
  recordRun,
} from "../lib/ingest-log.ts";
import { redactPersonalInfo } from "../lib/redact.ts";

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

// 읽은 글에 PDF 첨부의 글자를 덧붙이고, 담당자 실명·전화번호·이메일을 걸러 저장할 문서를 만든다.
async function buildDocument(post: Post): Promise<{
  document: NewDocument;
  attachments: AttachmentResult;
  removedContacts: number;
}> {
  const attachments = await readAttachments(post.attachments);
  const redacted = redactPersonalInfo(
    [post.body, attachments.text].filter(Boolean).join("\n\n"),
  );
  return {
    document: {
      url: post.url,
      title: post.title,
      publishedDate: post.publishedDate,
      department: post.department,
      body: redacted.text,
      hasUnreadAttachment: attachments.unreadNames.length > 0,
    },
    attachments,
    removedContacts: redacted.removedContacts,
  };
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
  console.log(`게시글 본문 (${post.body.length}글자):\n${post.body}\n`);

  const { document, attachments, removedContacts } = await buildDocument(post);
  console.log(`읽은 PDF ${attachments.readNames.length}개 (${attachments.text.length}글자)`);
  for (const name of attachments.readNames) {
    console.log(`  - ${name}`);
  }
  console.log(
    attachments.unreadNames.length > 0
      ? `읽지 못한 첨부 있음: ${attachments.unreadNames.join(", ")}`
      : "읽지 못한 첨부 없음",
  );
  if (attachments.text) {
    console.log(`\nPDF에서 읽은 글자 (앞 600글자):\n${attachments.text.slice(0, 600)}\n…`);
  }
  console.log(`\n걸러 낸 전화번호·이메일 ${removedContacts}개`);
  console.log(
    `저장할 본문 전체 ${document.body.length}글자. 끝부분:\n…${document.body.slice(-300)}\n`,
  );

  if (dryRun) {
    console.log("읽기만 했습니다. 저장하지 않았습니다. (--dry-run)");
    return;
  }

  const result = await saveDocument(document);
  console.log(
    result.status === "saved"
      ? `✅ 저장했습니다. (문단 묶음 ${result.chunkCount}개)`
      : "⏭️ 이미 저장된 글이라 건너뛰었습니다.",
  );
}

// 최신 글부터 limit건까지 훑으며, 아직 저장되지 않은 글만 열어 저장한다.
async function ingestLatest(limit: number) {
  console.log(`"보도자료" 게시판의 최신 글 ${limit}건을 가져옵니다. (요청 사이 1초 이상 쉼)\n`);

  // 지난 실행에서 실패한 글을 먼저 다시 시도한다. 최신 글 범위 밖으로 밀렸어도 이어서 가져온다.
  const previousFailures = await listFailures();
  const previouslyFailed = new Set(previousFailures.map((failure) => failure.url));
  if (previousFailures.length > 0) {
    console.log(`지난번에 실패한 글 ${previousFailures.length}건을 먼저 다시 시도합니다.`);
  }

  const summaries = await collectLatestPosts(limit);
  console.log(`목록에서 주소 ${summaries.length}건을 모았습니다. 글을 하나씩 엽니다.\n`);

  const targets: { url: string; title: string }[] = [
    ...previousFailures.map((failure) => ({ url: failure.url, title: "(지난번 실패한 글)" })),
    ...summaries.filter((summary) => !previouslyFailed.has(summary.url)),
  ];

  let saved = 0;
  let skipped = 0;
  let unreadAttachmentCount = 0;
  const failures: { url: string; reason: string }[] = [];

  for (const [index, target] of targets.entries()) {
    const label = `[${String(index + 1).padStart(3)}/${targets.length}]`;
    try {
      // 이미 저장된 글은 홈페이지에서 다시 열지 않는다.
      if (await documentExists(target.url)) {
        skipped++;
        console.log(`${label} ⏭️ 이미 있음 | ${target.title}`);
      } else {
        const post = await fetchPost(target.url);
        const { document } = await buildDocument(post);
        await saveDocument(document);
        saved++;
        if (document.hasUnreadAttachment) {
          unreadAttachmentCount++;
        }
        console.log(
          `${label} ✅ 저장 | ${post.title ?? NOT_STATED}${document.hasUnreadAttachment ? " (읽지 못한 첨부 있음)" : ""}`,
        );
      }
      if (previouslyFailed.has(target.url)) {
        await clearFailure(target.url);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ url: target.url, reason });
      console.log(`${label} ❌ 실패 | ${target.title}\n        ${reason}`);
      // 실패 목록에 올려 다음 실행 때 먼저 다시 시도하게 한다.
      // 기록 자체가 안 되더라도 나머지 글은 계속 가져온다.
      await recordFailure(target.url, reason).catch(() => {});
    }
  }

  // 일부 글이 실패했더라도 끝까지 돌았으면 실행 기록을 남긴다.
  await recordRun({
    successCount: saved,
    failureCount: failures.length,
    unreadAttachmentCount,
  });

  console.log(
    `\n성공 ${saved}건 / 실패 ${failures.length}건 / 읽지 못한 첨부 있는 글 ${unreadAttachmentCount}건 (이미 있어 건너뛴 글 ${skipped}건)`,
  );
  if (failures.length > 0) {
    console.log("\n실패한 글 (다음에 실행하면 먼저 다시 시도합니다)");
    for (const failure of failures) {
      console.log(`  - ${failure.url}\n    ${failure.reason}`);
    }
  }

  const status = await getCorpusStatus();
  console.log(`\n지금 들어 있는 문서 ${status.documentCount}건`);
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
    await ingestLatest(readLimit());
  }
} catch (error) {
  // 긴 오류 기록 대신 무엇이 문제인지 한 줄로 보여 준다.
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
