// 공식 홈페이지 "보도자료" 게시판을 읽는다. (DESIGN.md 2.1)
// 관리자가 자기 컴퓨터에서 실행하는 가져오기에서만 쓴다.

import * as cheerio from "cheerio";

const ORIGIN = "https://www.mpb.go.kr";
const BOARD_PATH = "/web/main/bbs/b_0001/";
export const LIST_URL = `${ORIGIN}${BOARD_PATH}list`;
// 목록 한 쪽에 들어 있는 글의 수
const POSTS_PER_PAGE = 10;

// 홈페이지에 보내는 모든 요청 사이에 쉬는 시간 (1초 이상)
const REQUEST_GAP_MS = 1100;
// 요청 하나를 기다리는 최대 시간
const REQUEST_TIMEOUT_MS = 20000;
let lastRequestAt = 0;

export type PostSummary = {
  // 뒷부분(?cp=1&…)을 뗀 원문 주소
  url: string;
  title: string;
  department: string;
  // "2026-10-02" 형식
  publishedDate: string;
};

// 가져와도 되는 주소인지 확인한다. 보도자료 게시판과 그 첨부파일만 허용한다.
function isAllowedUrl(url: string): boolean {
  return (
    url.startsWith(`${ORIGIN}${BOARD_PATH}`) ||
    url.startsWith(`${ORIGIN}/web/main/file/download/uu/`)
  );
}

// 홈페이지에 요청을 보낸다. 직전 요청과 1초 이상 간격을 둔다.
export async function politeFetch(url: string): Promise<Response> {
  if (!isAllowedUrl(url)) {
    throw new Error(`허용되지 않은 주소입니다: ${url}`);
  }
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": "mpb-chatbot-ingest/0.1 (internal use)",
      // 요청마다 연결을 새로 맺는다. 쉬는 동안 끊긴 연결을 다시 쓰다 멈추는 일을 막는다.
      Connection: "close",
    },
    // 응답이 오지 않으면 무한정 기다리지 않고 실패로 처리한다.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`홈페이지 요청 실패 (HTTP ${res.status}): ${url}`);
  }
  return res;
}

export type Attachment = {
  // 화면에 보이는 파일 이름
  name: string;
  url: string;
};

export type Post = {
  url: string;
  // 화면에 없는 값은 null. 저장할 때 "표기 없음"이 된다.
  title: string | null;
  department: string | null;
  // "2026-10-01" 형식
  publishedDate: string | null;
  // 게시글 본문. 첨부파일의 내용은 들어 있지 않다.
  body: string;
  attachments: Attachment[];
};

// 목록 화면의 글 주소를 뒷부분 없는 원문 주소로 바꾼다. 글 주소가 아니면 null
export function toPostUrl(href: string): string | null {
  const match = href.match(/\/web\/main\/bbs\/b_0001\/(\d+)/);
  return match ? `${ORIGIN}${BOARD_PATH}${match[1]}` : null;
}

// 목록 한 쪽의 HTML에서 글 목록을 뽑는다.
export function parseListPage(html: string): PostSummary[] {
  const $ = cheerio.load(html);
  const posts: PostSummary[] = [];
  $("table tbody tr").each((_, row) => {
    const cells = $(row).children("td");
    const link = cells.eq(1).find("a").first();
    const url = toPostUrl(link.attr("href") ?? "");
    if (!url) {
      return;
    }
    posts.push({
      url,
      title: link.text().trim(),
      department: cells.eq(2).text().trim(),
      publishedDate: cells.eq(3).text().trim(),
    });
  });
  return posts;
}

// 최신 글부터 차례로 limit건까지 글 주소를 모은다.
export async function collectLatestPosts(limit: number): Promise<PostSummary[]> {
  const posts: PostSummary[] = [];
  const seen = new Set<string>();
  const maxPages = Math.ceil(limit / POSTS_PER_PAGE) + 2;

  for (let page = 1; page <= maxPages && posts.length < limit; page++) {
    const res = await politeFetch(`${LIST_URL}?cp=${page}`);
    const pagePosts = parseListPage(await res.text());
    // 글이 하나도 없으면 마지막 쪽을 지난 것이다.
    if (pagePosts.length === 0) {
      break;
    }
    for (const post of pagePosts) {
      if (!seen.has(post.url) && posts.length < limit) {
        seen.add(post.url);
        posts.push(post);
      }
    }
  }
  return posts;
}

// "2026.10.01" 같은 날짜를 "2026-10-01"로 바꾼다. 날짜 모양이 아니면 null
function toIsoDate(text: string): string | null {
  const match = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

// 글 화면의 HTML에서 제목, 담당 부서, 발표일, 본문, 첨부파일 목록을 뽑는다.
// 작성자·연락처·이메일 칸은 읽지 않는다. (개인정보는 저장하지 않는다)
export function parsePostPage(html: string, url: string): Post {
  const $ = cheerio.load(html);
  const view = $(".board-view-box").first();

  // "담당부서", "작성일"처럼 이름표가 붙은 칸의 값을 찾는다.
  const meta = (label: string): string =>
    view
      .find(".meta li")
      .filter((_, item) => $(item).children("strong").text().trim() === label)
      .children("span")
      .first()
      .text()
      .trim();

  const editor = view.find(".board-content .editor").first();
  editor.find("br").replaceWith("\n");
  const paragraphs = editor.children("p, div").length
    ? editor
        .children()
        .map((_, element) => $(element).text())
        .get()
    : [editor.text()];
  const body = paragraphs
    .map((paragraph) => paragraph.replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  const attachments: Attachment[] = [];
  view.find(".board-attach li").each((_, item) => {
    const href = $(item).find('a[href^="/web/main/file/download/uu/"]').attr("href");
    if (href) {
      attachments.push({
        name: $(item).find(".name").text().trim(),
        url: `${ORIGIN}${href}`,
      });
    }
  });

  return {
    url,
    title: view.find(".board-title").first().text().trim() || null,
    department: meta("담당부서") || null,
    publishedDate: toIsoDate(meta("작성일")),
    body,
    attachments,
  };
}

// 글 1건을 열어 읽는다. 주소 뒤에 ?cp=1&… 같은 것이 붙어 있어도 된다.
export async function fetchPost(href: string): Promise<Post> {
  const url = toPostUrl(href);
  if (!url) {
    throw new Error(`보도자료 게시판의 글 주소가 아닙니다: ${href}`);
  }
  const res = await politeFetch(url);
  return parsePostPage(await res.text(), url);
}
