// 글에 달린 첨부파일을 읽는다. (DESIGN.md 2.1의 ⑤)
// PDF만 글자를 뽑고, 그 밖의 형식은 건너뛴다.

import { extractText, getDocumentProxy } from "unpdf";

import { politeFetch } from "./board.ts";
import type { Attachment } from "./board.ts";

// 첨부파일 하나를 내려받을 때 기다리는 최대 시간
const DOWNLOAD_TIMEOUT_MS = 60000;
// 이보다 큰 PDF는 읽지 않는다.
const MAX_PDF_BYTES = 30 * 1024 * 1024;
// 뽑아낸 글자가 이보다 적으면 스캔한 그림으로 보고 읽지 못한 것으로 친다.
const MIN_READABLE_LENGTH = 50;

export type AttachmentResult = {
  // 읽어 낸 PDF들의 글자. 읽은 것이 없으면 빈 글
  text: string;
  // 읽은 PDF의 파일 이름
  readNames: string[];
  // 읽지 못한 첨부의 파일 이름. 하나라도 있으면 "읽지 못한 첨부 있음"이다.
  unreadNames: string[];
};

function extensionOf(name: string): string {
  return name.match(/\.([a-z0-9]+)\s*$/i)?.[1].toLowerCase() ?? "";
}

// 확장자를 뺀 파일 이름. 같은 내용의 PDF와 한글 파일을 짝짓는 데 쓴다.
function baseNameOf(name: string): string {
  return name
    .replace(/\.[a-z0-9]+\s*$/i, "")
    // 같은 파일을 다시 올려 이름 끝에 붙은 " (1)" 같은 번호는 뗀다.
    .replace(/\s*\(\d+\)\s*$/, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

// PDF에서 글자를 뽑는다. 쪽 번호만 있는 줄("- 1 -")은 뺀다.
async function readPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return text
    .map((page) =>
      page
        // 저장소가 받지 못하는 보이지 않는 제어 문자를 지운다.
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !/^-\s*\d+\s*-$/.test(line))
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
}

export async function readAttachments(
  attachments: Attachment[],
): Promise<AttachmentResult> {
  const texts: string[] = [];
  const readNames: string[] = [];
  const unreadNames: string[] = [];
  const hangulFiles: Attachment[] = [];

  for (const attachment of attachments) {
    const extension = extensionOf(attachment.name);
    if (extension === "hwp" || extension === "hwpx") {
      // 한글 파일은 읽지 않는다. 읽지 못한 첨부로 칠지는 PDF를 다 읽은 뒤에 정한다.
      hangulFiles.push(attachment);
      continue;
    }
    if (extension !== "pdf") {
      unreadNames.push(attachment.name);
      continue;
    }
    try {
      const res = await politeFetch(attachment.url, DOWNLOAD_TIMEOUT_MS);
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.byteLength > MAX_PDF_BYTES) {
        throw new Error("파일이 너무 큽니다.");
      }
      const text = await readPdfText(data);
      if (text.replace(/\s/g, "").length < MIN_READABLE_LENGTH) {
        throw new Error("글자를 읽을 수 없는 PDF입니다.");
      }
      texts.push(text);
      readNames.push(attachment.name);
    } catch {
      // 첨부 하나를 못 읽어도 글 전체를 실패로 보지 않는다. 표시만 남긴다.
      unreadNames.push(attachment.name);
    }
  }

  // 한글 파일 이름이 읽은 PDF 이름으로 시작하면 읽지 못한 첨부로 치지 않는다.
  // 같은 내용인데 이름 끝에 "_★", "v2" 같은 꼬리가 붙어 올라오는 경우가 있다.
  const readBaseNames = readNames.map(baseNameOf);
  for (const file of hangulFiles) {
    const hangulName = baseNameOf(file.name);
    if (!readBaseNames.some((pdfName) => hangulName.startsWith(pdfName))) {
      unreadNames.push(file.name);
    }
  }

  return { text: texts.join("\n\n"), readNames, unreadNames };
}
