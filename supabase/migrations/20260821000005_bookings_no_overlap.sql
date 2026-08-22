-- =============================================================================
-- Prevent double-booking at the database level.
--
-- Previously the only protection against double-booking was an application
-- check in app/api/public/booking/route.ts: SELECT for overlapping bookings,
-- then INSERT if none were found. Those are two separate round-trips with no
-- lock between them, so two guests submitting a booking for the same room
-- and overlapping dates within milliseconds of each other could BOTH pass
-- the check and BOTH get inserted — an actual double-booked room.
--
-- This adds a Postgres exclusion constraint so the database itself refuses
-- the second overlapping insert, no matter which code path it comes from
-- (public booking API, walk-in, admin dashboard, future code we haven't
-- written yet). The application-level check stays in place too — it gives
-- guests a friendly error before they upload payment proof, instead of only
-- finding out after submitting. This constraint is the backstop for when
-- that earlier check loses the race.
--
-- IMPORTANT — read before applying to a database that already has data:
-- if any double-bookings already exist for the same room/overlapping dates,
-- this migration will fail with "conflicting key value violates exclusion
-- constraint" because Postgres validates all existing rows when the
-- constraint is added. Run this first to check:
--
--   select a.id, b.id, a.room_id, a.check_in_date, a.check_out_date
--   from bookings a join bookings b
--     on a.room_id = b.room_id and a.id < b.id
--   where a.room_id is not null
--     and a.status in ('pending','confirmed','checked_in')
--     and b.status in ('pending','confirmed','checked_in')
--     and daterange(a.check_in_date, a.check_out_date, '[)')
--         && daterange(b.check_in_date, b.check_out_date, '[)');
--
-- If that returns rows, resolve them manually (cancel/reassign one of each
-- pair) before this migration will apply successfully.
-- =============================================================================

create extension if not exists btree_gist;

-- Assumes check_in_date/check_out_date are `date` columns (matches how the
-- app treats them everywhere — see lib/bookingDates.ts). If they're actually
-- `timestamp`/`timestamptz` in your live schema, cast them first, e.g.
-- daterange(check_in_date::date, check_out_date::date, '[)').
--
-- Scoped to 'pending' | 'confirmed' | 'checked_in' only (NOT 'checked_out').
-- This constraint's job is to stop a NEW booking from being created for a
-- room/date range that's already spoken for — it has nothing useful to say
-- about a stay that has already finished. A `checked_out` booking is a
-- historical fact; if it happens to overlap another `checked_out` booking
-- for the same room (e.g. from a past front-desk double-booking that
-- already happened before this constraint existed), that's a fact about
-- history, not a new booking this constraint should be blocking.
alter table bookings
  add constraint bookings_no_room_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in_date, check_out_date, '[)') with &&
  )
  where (room_id is not null and status in ('pending', 'confirmed', 'checked_in'));
