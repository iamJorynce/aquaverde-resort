-- The Day Pass / Night Pass split (see 20260829010000_day_use_night_period.sql)
-- tagged day_use_rates and day_use_entries with a period, but the actual
-- bookings row created for each day-use entry (accommodation_type='day_use')
-- never got the same tag. The Check-in/Out module's Day Pass / Night Pass
-- tabs read period directly off bookings, so without this column that
-- query fails outright and both tabs render empty even with guests
-- currently checked in.
alter table bookings
  add column if not exists period text not null default 'day';

alter table bookings
  drop constraint if exists bookings_period_check;
alter table bookings
  add constraint bookings_period_check check (period in ('day', 'night'));

comment on column bookings.period is 'day or night — only meaningful for accommodation_type=''day_use'' bookings; mirrors day_use_entries.period so Check-in/Out can split Day Pass vs Night Pass without an extra join.';

-- Best-effort backfill: bookings.period didn't exist until now, so every
-- row (including ones created as Night Pass) just got defaulted to 'day'
-- above. There's no FK from day_use_entries back to the booking it
-- spawned, so match on the signals that tie them together — same guest
-- phone, same amount, created within a couple minutes of each other —
-- and only touch bookings that are still checked in right now, since
-- that's the only place this would visibly show the wrong tab today.
update bookings b
set period = 'night'
from day_use_entries e, guests g
where g.id = b.guest_id
  and b.accommodation_type = 'day_use'
  and b.status = 'checked_in'
  and b.period = 'day'
  and e.period = 'night'
  and e.total_amount = b.total_amount
  and coalesce(e.guest_phone, '') = coalesce(g.phone, '')
  and coalesce(e.guest_phone, '') <> ''
  and abs(extract(epoch from (b.created_at - e.created_at))) < 120;
