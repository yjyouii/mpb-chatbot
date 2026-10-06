// 본문을 "문단 묶음"으로 나눈다. (DESIGN.md 2.1의 ⑦)
// 문단을 차례로 이어 붙이다가 정해진 길이를 넘으면 새 묶음을 시작한다.

// 묶음 하나의 최대 글자 수
export const MAX_CHUNK_LENGTH = 1000;

// 한 문단이 너무 길면 문장 끝(". " 또는 줄바꿈)에서 자르고,
// 그래도 길면 글자 수로 자른다.
function splitLongParagraph(paragraph: string, maxLength: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("다. "),
      window.lastIndexOf("\n"),
    );
    // 너무 앞에서 잘리면 조각이 지나치게 작아지므로 절반 이후에서만 자른다.
    const cut = sentenceEnd > maxLength / 2 ? sentenceEnd + 1 : maxLength;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) {
    pieces.push(rest);
  }
  return pieces;
}

export function splitIntoChunks(
  body: string,
  maxLength: number = MAX_CHUNK_LENGTH,
): string[] {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxLength));

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
    } else if (current.length + 2 + paragraph.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}
