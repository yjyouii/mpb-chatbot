// 성공 기준 측정 (PRD 3장, PLAN 작업 26)
// eval/questions.json의 시험 질문 25개를 챗봇의 답변 기능에 그대로 넣어 보고, 결과를 표로 남긴다.
// 화면과 잠금을 거치지 않고 답변을 만드는 코드(lib)를 바로 부른다.
//
// 실행:               npm run eval
// 다른 모델로 비교:   npm run eval -- --model gpt-6-luna
//
// 결과는 eval/results-<모델 이름>.md에 저장된다.
// "자동 점검"은 참고용이다. 정답 여부의 최종 판정은 작성자가 원문과 대조해 한다.

import { readFileSync, writeFileSync } from "node:fs";

import { ANSWER_MODEL, NOT_FOUND_TEXT, buildSources, generateAnswer } from "../lib/answer.ts";
import { searchChunks } from "../lib/search.ts";

type Answerable = {
  id: string;
  question: string;
  expected: string;
  keywords: string[];
  source: string;
  ownership?: boolean;
};
type Unanswerable = { id: string; question: string };
type QuestionFile = { answerable: Answerable[]; unanswerable: Unanswerable[] };

type Result = {
  id: string;
  question: string;
  expected: string;
  kind: string;
  answer: string;
  sources: string[];
  seconds: number;
  // 자동 점검 결과와 그 이유
  pass: boolean;
  note: string;
};

const modelIndex = process.argv.indexOf("--model");
const model = modelIndex === -1 ? ANSWER_MODEL : (process.argv[modelIndex + 1] ?? ANSWER_MODEL);

const file = JSON.parse(readFileSync("eval/questions.json", "utf8")) as QuestionFile;

// 띄어쓰기와 쉼표 차이로 낱말을 놓치지 않게 한다.
const squeeze = (text: string) => text.replace(/[\s,]/g, "");

async function ask(question: string) {
  const startedAt = Date.now();
  const chunks = await searchChunks(question);
  const answer = await generateAnswer(question, chunks, [], model);
  const { sources } = buildSources(answer, chunks);
  return {
    kind: answer.kind,
    answer: answer.text,
    sources: sources.map((source) => source.url.split("/").pop() ?? ""),
    seconds: (Date.now() - startedAt) / 1000,
  };
}

const results: Result[] = [];

for (const item of file.answerable) {
  const got = await ask(item.question);
  const missing = item.keywords.filter((keyword) => !squeeze(got.answer).includes(squeeze(keyword)));
  const hasSource = got.sources.includes(item.source);
  const pass = got.kind === "answer" && missing.length === 0 && hasSource;
  const notes: string[] = [];
  if (got.kind !== "answer") notes.push(`종류가 ${got.kind}`);
  if (missing.length > 0) notes.push(`빠진 낱말: ${missing.join(", ")}`);
  if (!hasSource) notes.push(`근거 문서 ${item.source}가 출처에 없음`);
  results.push({ ...item, ...got, pass, note: notes.join(" / ") || "핵심 낱말과 출처 모두 맞음" });
  console.log(`${pass ? "✅" : "⚠️"} ${item.id} ${item.question}`);
}

for (const item of file.unanswerable) {
  const got = await ask(item.question);
  const pass = got.kind === "not_found" && got.answer === NOT_FOUND_TEXT && got.sources.length === 0;
  results.push({
    ...item,
    expected: NOT_FOUND_TEXT,
    ...got,
    pass,
    note: pass ? "지어내지 않음" : `종류가 ${got.kind}`,
  });
  console.log(`${pass ? "✅" : "❌"} ${item.id} ${item.question}`);
}

const answerable = results.filter((result) => result.id.startsWith("A"));
const unanswerable = results.filter((result) => result.id.startsWith("U"));
const answered = answerable.filter((result) => result.kind === "answer");
const passed = answerable.filter((result) => result.pass).length;
const withSource = answered.filter((result) => result.sources.length > 0).length;
const refused = unanswerable.filter((result) => result.pass).length;
const slowest = Math.max(...results.map((result) => result.seconds));
const average = results.reduce((sum, result) => sum + result.seconds, 0) / results.length;

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
const row = (result: Result) =>
  `| ${result.id} | ${cell(result.question)} | ${cell(result.expected)} | ${cell(result.answer)} | ${result.sources.join(", ") || "-"} | ${result.pass ? "✅" : "⚠️"} ${cell(result.note)} | ${result.seconds.toFixed(1)} |`;

const summary = [
  `- 문서에 답이 있는 질문: 자동 점검 통과 ${passed}/${answerable.length} (${Math.round((passed / answerable.length) * 100)}%) — 기준 80% 이상`,
  `- 답변에 출처가 붙은 비율: ${withSource}/${answered.length} — 기준은 문서를 근거로 한 모든 답변`,
  `- 문서에 답이 없는 질문: "${NOT_FOUND_TEXT}"로 답함 ${refused}/${unanswerable.length} — 기준 5개 모두`,
  `- 답변까지 걸린 시간: 평균 ${average.toFixed(1)}초, 가장 느린 것 ${slowest.toFixed(1)}초`,
];

const report = [
  `# 성공 기준 측정 결과 (${model})`,
  "",
  `- 측정 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  `- 답변 모델: ${model}`,
  "- 자동 점검은 답에 핵심 낱말이 들어 있는지와 근거 문서가 출처에 있는지만 본다. 정답 여부의 최종 판정은 작성자가 원문과 대조해 한다.",
  "",
  "## 요약",
  "",
  ...summary,
  "",
  "## 문서에 답이 있는 질문 20개",
  "",
  "| 번호 | 질문 | 원문의 정답 | 챗봇의 답 | 출처(글 번호) | 자동 점검 | 초 |",
  "|---|---|---|---|---|---|---|",
  ...answerable.map(row),
  "",
  "## 문서에 답이 없는 질문 5개",
  "",
  "| 번호 | 질문 | 기대하는 답 | 챗봇의 답 | 출처(글 번호) | 자동 점검 | 초 |",
  "|---|---|---|---|---|---|---|",
  ...unanswerable.map(row),
  "",
].join("\n");

const path = `eval/results-${model}.md`;
writeFileSync(path, report);
console.log(`\n${summary.join("\n")}\n\n결과를 ${path}에 저장했습니다.`);
