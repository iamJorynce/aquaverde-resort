-- =============================================================================
-- cottage_types_config
--
-- Previously, "cottage type" was a fixed Postgres enum (open | covered |
-- family | vip | function_hall | beach_table | tent_area) hardcoded both in
-- the DB schema and in a <select> in app/dashboard/CottagesPage.tsx. Adding
-- a new type required a migration AND a code deploy — unlike Room Types
-- (room_types_config), which admins can already add/edit from the
-- dashboard. This brings Cottages up to the same standard.
--
-- The old `cottages.type` enum column is left in place (unused going
-- forward) rather than dropped, so this migration carries no risk of data
-- loss and is trivially reversible. It can be dropped in a later cleanup
-- migration once the new column has been confirmed working in production.
-- =============================================================================

create table if not exists cottage_types_config (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  default_day_rate       numeric,
  default_overnight_rate numeric,
  max_capacity           int,
  description            text,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table cottages
  add column if not exists cottage_type_id uuid references cottage_types_config(id);

-- The old enum column was NOT NULL; relax that so new cottages created
-- after this migration don't need to set it at all — cottage_type_id is
-- the source of truth going forward. Existing rows keep their value.
alter table cottages alter column type drop not null;

-- Seed one row per existing enum value, using the same display names the
-- old hardcoded <select> used, so nothing visually changes for existing
-- cottages after this migration runs.
insert into cottage_types_config (name, is_active)
select v.name, true
from (values
  ('Open Cottage'),
  ('Covered Cottage'),
  ('Family Cottage'),
  ('VIP Cottage'),
  ('Function Hall'),
  ('Beach Table'),
  ('Tent Area')
) as v(name)
where not exists (select 1 from cottage_types_config where name = v.name);

-- Backfill cottage_type_id on every existing cottage from its old `type`
-- enum column, matching by the same label mapping.
update cottages c
set cottage_type_id = ctc.id
from cottage_types_config ctc
where c.cottage_type_id is null
  and ctc.name = case c.type
    when 'open'          then 'Open Cottage'
    when 'covered'        then 'Covered Cottage'
    when 'family'          then 'Family Cottage'
    when 'vip'              then 'VIP Cottage'
    when 'function_hall' then 'Function Hall'
    when 'beach_table'    then 'Beach Table'
    when 'tent_area'      then 'Tent Area'
  end;

alter table cottage_types_config enable row level security;

-- Read: any logged-in staff member (matches MODULE_ACCESS.cottages in
-- app/dashboard/permissions.ts — front_desk/cashier can view/select a type
-- when adding a cottage, even though only admins can manage the catalog).
drop policy if exists "cottage_types_config_select" on cottage_types_config;
create policy "cottage_types_config_select"
  on cottage_types_config for select
  to authenticated
  using (true);

-- Write: admin only (matches ACTION_PERMISSIONS.canManageCottagesCatalog).
drop policy if exists "cottage_types_config_write" on cottage_types_config;
create policy "cottage_types_config_write"
  on cottage_types_config for all
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
