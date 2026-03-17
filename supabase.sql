create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  handle text not null unique,
  email text,
  joined_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

create policy "Users can insert their profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update their profile"
  on public.profiles
  for update
  using (auth.uid() = id);
