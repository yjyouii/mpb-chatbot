-- mpb챗봇 문서 저장소 (DESIGN.md 3.4 "저장할 자료의 모양")
-- 표 4개: 문서, 문단 묶음, 실패 목록, 가져오기 기록

-- 뜻이 비슷한 문단을 찾는 부가 기능(pgvector)을 켠다.
create extension if not exists vector with schema extensions;

-- 문서: 게시글 1건이 1줄
create table public.documents (
  id bigint generated always as identity primary key,
  -- 원문 주소. 같은 글이 두 번 들어가지 않게 하는 기준이다.
  url text not null unique,
  title text not null default '표기 없음',
  -- 발표일이 없으면 비워 둔다. 화면과 AI에는 "표기 없음"으로 보여 준다.
  published_date date,
  department text not null default '표기 없음',
  -- 게시글 본문 + PDF에서 읽은 글자 (담당자 실명·전화번호를 걸러 낸 것)
  body text not null,
  has_unread_attachment boolean not null default false,
  fetched_at timestamptz not null default now()
);

-- 문단 묶음: 문서 1건을 여러 조각으로 나눈 것
create table public.chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  -- 뜻을 나타내는 숫자. text-embedding-3-large를 1536개 길이로 줄여 쓴다.
  embedding extensions.vector(1536) not null,
  unique (document_id, chunk_index)
);

-- 질문과 가까운 조각을 빨리 찾기 위한 색인
create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- 실패 목록: 본문을 읽지 못한 글. 다시 실행할 때 먼저 시도하고, 성공하면 지운다.
create table public.ingest_failures (
  url text primary key,
  reason text not null,
  failed_at timestamptz not null default now()
);

-- 가져오기 기록: 실행 1번이 1줄. 화면 위쪽 "○월 ○일까지 가져온 자료 기준"에 쓴다.
create table public.ingest_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  success_count integer not null,
  failure_count integer not null,
  unread_attachment_count integer not null default 0
);

-- 서버용 키로만 접근하게 잠근다. 허용 규칙을 하나도 두지 않으므로
-- 브라우저에서 쓰는 공개 키로는 읽거나 쓸 수 없다.
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.ingest_failures enable row level security;
alter table public.ingest_runs enable row level security;
