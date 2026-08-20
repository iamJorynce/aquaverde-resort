-- =============================================================================
-- Enables realtime for inventory_items.
--
-- app/dashboard/page.tsx subscribes to postgres_changes on inventory_items to
-- keep the low-stock badge in sync (Stock In/Out, new items, deactivation).
-- That subscription only receives events if the table is part of the
-- `supabase_realtime` publication — other tables already used for realtime
-- elsewhere in this app (bookings, rooms, housekeeping_tasks — see
-- hooks/useRealtime.ts and app/dashboard/page.tsx) were added to it already,
-- but inventory_items was never wired up for realtime before this badge, so
-- it's very likely missing. This is idempotent — safe to run even if it's
-- already in the publication.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table inventory_items;
  end if;
end $$;

-- Sanity check — run this separately in the SQL Editor to see every table
-- currently wired for realtime, and confirm bookings / rooms /
-- housekeeping_tasks / inventory_items are all listed:
--
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and schemaname = 'public'
--   order by tablename;
