-- 질문과 뜻이 가까운 문단 묶음을 찾는 기능 (DESIGN.md 2.2의 ③)
-- 질문을 숫자로 바꾼 값을 받아, 가까운 순으로 문단 묶음과 그 문서의 정보를 돌려준다.

create or replace function public.match_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 8
)
returns table (
  chunk_id bigint,
  document_id bigint,
  content text,
  -- 1에 가까울수록 뜻이 가깝다.
  similarity double precision,
  url text,
  title text,
  published_date date,
  department text,
  has_unread_attachment boolean
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding),
    d.url,
    d.title,
    d.published_date,
    d.department,
    d.has_unread_attachment
  from public.chunks c
  join public.documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 서버용 키로만 부를 수 있게 한다.
revoke execute on function public.match_chunks(extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, integer) to service_role;
