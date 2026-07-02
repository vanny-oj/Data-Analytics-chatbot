-- Run this in Supabase's SQL Editor (Dashboard → SQL Editor → New Query)
-- This sets up credit tracking for every user that signs up.

-- 1. Table to track each user's question credits
create table public.user_credits (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  credits_remaining integer not null default 5,
  free_credits_used boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. Automatically create a credit row (with 5 free credits) when someone signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_credits (id, email, credits_remaining)
  values (new.id, new.email, 5);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Table to log completed Paystack payments (prevents double-crediting)
create table public.payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  paystack_reference text unique not null,
  amount_kobo integer not null,
  credits_purchased integer not null,
  status text not null default 'pending',
  created_at timestamp with time zone default now()
);

-- 4. Row-level security so users can only see their own data
alter table public.user_credits enable row level security;
alter table public.payments enable row level security;

create policy "Users can view own credits"
  on public.user_credits for select
  using (auth.uid() = id);

create policy "Users can view own payments"
  on public.payments for select
  using (auth.uid() = user_id);

-- Note: credit deduction and payment crediting happen via the service role key
-- in our serverless functions, which bypasses RLS safely on the backend.
