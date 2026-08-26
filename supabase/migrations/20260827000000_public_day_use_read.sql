-- =============================================================================
-- Public read access for Day Use info
--
-- The public site's new /day-use page needs to show live guest-type rates
-- and cottage day-rates without requiring login, the same way the public
-- Rooms page already reads room_types_config. Both tables below were
-- previously staff-only for SELECT.
--
-- Only pricing/catalog rows are exposed (day_use_rates, cottage_types_config),
-- never operational tables like `cottages` (individual units, status,
-- cottage_code) or `day_use_entries` (guest transaction records) — same
-- separation already used for rooms vs room_types_config.
--
-- Anon visitors only ever see is_active = true rows; existing
-- staff/admin policies are untouched.
-- =============================================================================

alter table day_use_rates enable row level security;

drop policy if exists "day_use_rates_select_anon" on day_use_rates;
create policy "day_use_rates_select_anon"
  on day_use_rates for select
  to anon
  using (is_active = true);

drop policy if exists "cottage_types_config_select_anon" on cottage_types_config;
create policy "cottage_types_config_select_anon"
  on cottage_types_config for select
  to anon
  using (is_active = true);
