create table public.calendars (
  id text primary key,
  source text not null,
  source_url text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

grant select on public.calendars to anon;
