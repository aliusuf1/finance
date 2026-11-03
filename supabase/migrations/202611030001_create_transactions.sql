create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  receiver_name text not null check (char_length(receiver_name) between 1 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'PKR' check (currency = 'PKR'),
  direction text not null check (direction in ('outgoing', 'incoming')),
  kind text not null check (kind in ('transfer_out', 'atm', 'bank_fee', 'card', 'transfer_in', 'other')),
  occurred_at text,
  transaction_id text,
  channel text,
  account_masked text,
  purpose_note text not null default '',
  source_name text,
  raw_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_created_idx on public.transactions(user_id, created_at desc);
alter table public.transactions enable row level security;
revoke all on table public.transactions from anon, authenticated;

comment on table public.transactions is 'Private Hisab records. Browser access is denied; authenticated server routes enforce Clerk user ownership.';
