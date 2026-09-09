-- Short-time room bookings (staff/walk-in side only): rooms have so far
-- been overnight-only (per-night rate, date-based check-in/out). Staff
-- need to offer fixed-duration short-time stays (3/6/12 hrs) with a flat
-- rate per duration, plus the ability to extend an active short-time stay
-- by more hours for an extra flat-per-hour charge. Day-use / cottages and
-- the public website are untouched by this migration.

-- Flat short-time rates per room type. Nullable on purpose — a room type
-- that hasn't been given short-time rates simply won't offer those
-- duration options in the Walk-in form (falls back to overnight only).
alter table room_types_config
  add column if not exists rate_3hr numeric,
  add column if not exists rate_6hr numeric,
  add column if not exists rate_12hr numeric,
  add column if not exists extend_hourly_rate numeric;

comment on column room_types_config.rate_3hr is 'Flat short-time rate for a 3-hour walk-in stay. Null = short-time not offered for this room type.';
comment on column room_types_config.rate_6hr is 'Flat short-time rate for a 6-hour walk-in stay. Null = short-time not offered for this room type.';
comment on column room_types_config.rate_12hr is 'Flat short-time rate for a 12-hour walk-in stay. Null = short-time not offered for this room type.';
comment on column room_types_config.extend_hourly_rate is 'Flat charge per additional hour when a short-time stay is extended past its original duration via Check-In/Out. Null = extending is not offered for this room type.';

-- Which duration a booking was made under, and (for short-time bookings
-- only) when the stay is due to end plus how much it's been extended by.
-- Overnight bookings leave these at their defaults and keep using
-- check_in_date/check_out_date exactly as before.
alter table bookings
  add column if not exists duration_type text not null default 'overnight',
  add column if not exists expected_check_out_at timestamptz,
  add column if not exists extended_hours numeric not null default 0,
  add column if not exists extension_fee numeric not null default 0;

alter table bookings
  drop constraint if exists bookings_duration_type_check;
alter table bookings
  add constraint bookings_duration_type_check check (duration_type in ('overnight', '3hr', '6hr', '12hr'));

comment on column bookings.duration_type is 'overnight (default, per-night pricing) or a fixed short-time block (3hr/6hr/12hr) — staff walk-in room bookings only.';
comment on column bookings.expected_check_out_at is 'For short-time bookings: timestamp the stay is due to end (check-in time + duration + any extensions). Null for overnight bookings.';
comment on column bookings.extended_hours is 'Total hours a short-time booking has been extended by via the Check-In/Out "Extend" action.';
comment on column bookings.extension_fee is 'Total pesos charged for extensions on this booking (sum of extended hours x the room type''s extend_hourly_rate at the time of each extension). Already folded into extras_total/total_amount.';
