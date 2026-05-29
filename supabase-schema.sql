create extension if not exists pgcrypto;

create table if not exists public.rentals (
    id uuid primary key default gen_random_uuid(),
    category text not null,
    item_id integer not null check (item_id > 0),
    item_code text,
    out_date date not null,
    return_date date not null,
    rented_on date not null default current_date,
    created_at timestamptz not null default timezone('utc', now()),
    constraint rentals_date_order check (out_date <= return_date)
);

alter table public.rentals
add column if not exists item_code text;

create index if not exists rentals_category_item_idx
    on public.rentals (category, item_id, out_date, return_date);

create index if not exists rentals_category_item_code_idx
    on public.rentals (category, item_code, out_date, return_date);

grant select
on public.rentals
to anon;

grant select, insert, update, delete
on public.rentals
to authenticated;

grant select, insert, update, delete
on public.rentals
to service_role;

alter table public.rentals enable row level security;

drop policy if exists "Public read rentals" on public.rentals;
drop policy if exists "Public insert rentals" on public.rentals;
drop policy if exists "Public delete rentals" on public.rentals;
drop policy if exists "Authenticated read rentals" on public.rentals;
drop policy if exists "Authenticated insert rentals" on public.rentals;
drop policy if exists "Authenticated update rentals" on public.rentals;
drop policy if exists "Authenticated delete rentals" on public.rentals;

create policy "Public read rentals"
on public.rentals
for select
to anon
using (true);

create policy "Authenticated read rentals"
on public.rentals
for select
to authenticated
using (true);

create policy "Authenticated insert rentals"
on public.rentals
for insert
to authenticated
with check (true);

create policy "Authenticated update rentals"
on public.rentals
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated delete rentals"
on public.rentals
for delete
to authenticated
using (true);
