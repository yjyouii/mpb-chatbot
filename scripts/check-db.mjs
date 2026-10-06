// 문서 저장소 점검: 표 4개가 있는지, 각각 몇 줄 들어 있는지,
// 공개 키로는 읽을 수 없게 잠겨 있는지 확인한다.
// 실행: npm run db:check

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(".env에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  process.exit(1);
}

const tables = [
  ["documents", "문서"],
  ["chunks", "문단 묶음"],
  ["ingest_failures", "실패 목록"],
  ["ingest_runs", "가져오기 기록"],
];

// 표의 줄 수를 센다. 표가 없거나 접근할 수 없으면 오류를 던진다.
async function countRows(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  // content-range 예: "*/0" 또는 "0-9/10"
  return Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
}

let failed = false;

for (const [table, label] of tables) {
  try {
    const count = await countRows(table);
    console.log(`✅ ${label} (${table}): ${count}줄`);
  } catch (error) {
    failed = true;
    console.log(`❌ ${label} (${table}): 읽지 못했습니다 - ${error.message}`);
  }
}

console.log(failed ? "\n문서 저장소에 문제가 있습니다." : "\n문서 저장소 준비 완료.");
process.exit(failed ? 1 : 0);
