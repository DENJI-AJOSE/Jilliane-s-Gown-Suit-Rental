create extension if not exists pgcrypto;

create table if not exists public.rentals (
    id uuid primary key default gen_random_uuid(),
    category text not null,
    item_id integer not null check (item_id > 0),
    out_date date not null,
    return_date date not null,
    rented_on date not null default current_date,
    created_at timestamptz not null default timezone('utc', now()),
    constraint rentals_date_order check (out_date <= return_date)
);

create index if not exists rentals_category_item_idx
    on public.rentals (category, item_id, out_date, return_date);

alter table public.rentals enable row level security;

create policy "Public read rentals"
on public.rentals
for select
to anon
using (true);

create policy "Public insert rentals"
on public.rentals
for insert
to anon
with check (true);

create policy "Public delete rentals"
on public.rentals
for delete
to anon
using (true);
