// 글을 "뜻을 나타내는 숫자"로 바꾼다. (OpenAI 임베딩)
// API 키는 서버에서만 읽는다.

export const EMBEDDING_MODEL = "text-embedding-3-large";
// 저장소의 숫자 칸 길이와 같아야 한다. (supabase/migrations의 vector(1536))
export const EMBEDDING_DIMENSIONS = 1536;

// 한 번의 요청에 보내는 글의 개수
const BATCH_SIZE = 64;

type EmbeddingResponse = {
  data: { index: number; embedding: number[] }[];
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(".env에 OPENAI_API_KEY가 없습니다.");
  }

  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `숫자로 바꾸기 실패 (HTTP ${res.status}): ${await res.text()}`,
      );
    }
    const json = (await res.json()) as EmbeddingResponse;
    // 보낸 순서대로 정렬해 담는다.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      embeddings.push(item.embedding);
    }
  }
  return embeddings;
}
