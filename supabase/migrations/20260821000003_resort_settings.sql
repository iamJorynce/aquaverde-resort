-- =============================================================================
-- resort_settings table
--
-- Backs the "Resort Information" form on app/dashboard/SettingsPage.tsx.
-- Single-row config table (id fixed to 1) holding general resort info that
-- other parts of the app can read (booking confirmations, receipts, public
-- site, emails, etc).
--
-- Access matches app/dashboard/permissions.ts -> MODULE_ACCESS.settings:
--   super_admin, resort_owner  -> can view AND edit
-- Everyone else has no policy, so PostgREST returns zero rows / rejects
-- writes for any other role (RLS default-deny).
-- =============================================================================

create table if not exists resort_settings (
  id                int primary key default 1,
  resort_name       text not null default 'AquaVerde Beach Resort',
  contact           text,
  email             text,
  address           text,
  check_in_time     text default '2:00 PM',
  check_out_time    text default '12:00 PM',
  updated_at        timestamptz default now(),
  updated_by        uuid references profiles(id),
  constraint resort_settings_singleton check (id = 1)
);

-- Seed the single row so GET always has something to read.
insert into resort_settings (id, resort_name, contact, email, address, check_in_time, check_out_time)
values (1, 'AquaVerde Beach Resort', '+63 912 345 6789', 'info@aquaverde.ph', 'Sarangani, South Cotabato, PH', '2:00 PM', '12:00 PM')
on conflict (id) do nothing;

alter table resort_settings enable row level security;

drop policy if exists "resort_settings_select" on resort_settings;
create policy "resort_settings_select"
  on resort_settings for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  );

drop policy if exists "resort_settings_update" on resort_settings;
create policy "resort_settings_update"
  on resort_settings for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  );
